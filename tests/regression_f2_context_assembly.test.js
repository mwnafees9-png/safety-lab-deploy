#!/usr/bin/env node
/*
 * Regression — F2: the ONE context assembler, executed.
 *
 * regression_spec_reachability pins the WIRING (both paths call
 * _assembleAnalysisContext). This suite executes the assembler's REAL source —
 * extracted verbatim from ai_assistant.js, never a re-implementation — in a vm
 * sandbox with instrumented block providers, and proves its behavior:
 *
 *   P1  Block ORDER is the classic lanes' order: spec → golden thread → docs →
 *       exemplars → memory → corpus → zonal → assumptions → basis →
 *       insufficiency. (The batch previously ran a different, partial order;
 *       one order now exists.)
 *   P2  dedupeContext drops the doc block when the caller's context already
 *       contains the document text (the 60k-SDD-twice probe) — and does NOT
 *       drop it for short or non-matching context.
 *   P3  Zonal context reaches ONLY the _ZONAL_FEATURES lanes.
 *   P4  Every provider failing (throwing) still returns base + contracts —
 *       less context, never an error.
 *   P5  A block returning '' is skipped without leaving separator litter.
 *   P6  The A15 grounding query is the first user message, clipped to 300.
 *
 * Run: node tests/regression_f2_context_assembly.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ai = fs.readFileSync(path.join(__dirname, '..', 'site', 'ai_assistant.js'), 'utf8');

// -- extract the REAL function source --------------------------------------
const m = ai.match(/async function _assembleAnalysisContext\(feature, system, opts\) \{[\s\S]*?\n    \}/);
if (!m) { console.log('  FAIL  assembler not found in ai_assistant.js'); process.exit(1); }
const SRC = m[0];

function sandbox(overrides) {
    const calls = [];
    const base = {
        _skillBodyFor: f => 'SPEC(' + f + ')',
        _FEATURE_SPECS: {},
        _goldenThreadContext: (f, o) => 'THREAD(' + f + ')',
        _projectDocContext: (f, o) => 'DOCNOTE\nTEXT:\n' + 'D'.repeat(400),
        _memoryExemplars: f => 'MEM(' + f + ')',
        _ZONAL_FEATURES: { 'pra.draft': 1 },
        _zonalContext: (f, o) => 'ZONAL(' + f + ')',
        _withAssumptionsClause: s => s + '\n\n[ASSUME]',
        _withBasisClause: (s, f) => s + '\n\n[BASIS ' + f + ']',
        _withInsufficiencyClause: s => s + '\n\n[INSUF]',
        _CONTROLLED_CLASS: /(controlled|itar)/i,
        window: {
            AiFidelity: { exemplarsFor: (f, o) => 'EXEMPLARS(' + f + ')' },
            A15_CORPUS: { groundingBlock: async (q, n) => { calls.push(['a15', q, n]); return 'CORPUS'; } }
        },
        console: console
    };
    const ctx = vm.createContext(Object.assign(base, overrides || {}));
    vm.runInContext('var __fn = (' + SRC.replace('async function _assembleAnalysisContext', 'async function ') + ');', ctx);
    return { run: (f, s, o) => vm.runInContext('__fn', ctx)(f, s, o), calls };
}

(async function () {
    // P1 — classic order
    const sb1 = sandbox();
    const out1 = await sb1.run('pra.draft', 'BASE', { messages: [{ role: 'user', content: 'Q'.repeat(500) }] });
    const order = ['BASE', 'SPEC(pra.draft)', 'THREAD(pra.draft)', 'DOCNOTE', 'EXEMPLARS(pra.draft)', 'MEM(pra.draft)', 'CORPUS', 'ZONAL(pra.draft)', '[ASSUME]', '[BASIS pra.draft]', '[INSUF]'];
    let idx = -1, ordered = true;
    for (const t of order) { const at = out1.indexOf(t); if (at <= idx) { ordered = false; break; } idx = at; }
    check('P1 blocks appear in the classic order, all present', ordered, 'got: ' + out1.slice(0, 200));

    // P2 — dedupe probe
    const doc = 'DOCNOTE\nTEXT:\n' + 'D'.repeat(400);
    const sb2 = sandbox();
    const dup = await sb2.run('decompose', 'BASE', { dedupeContext: 'ctx '.repeat(120) + doc.slice(8, 308) });
    check('P2a doc block dropped when dedupeContext carries the text', dup.indexOf('DOCNOTE') === -1);
    const sb2b = sandbox();
    const keep = await sb2b.run('decompose', 'BASE', { dedupeContext: 'short' });
    check('P2b doc block kept for short context', keep.indexOf('DOCNOTE') >= 0);
    const sb2c = sandbox();
    const keep2 = await sb2c.run('decompose', 'BASE', { dedupeContext: 'X'.repeat(5000) });
    check('P2c doc block kept for long NON-matching context', keep2.indexOf('DOCNOTE') >= 0);

    // P3 — zonal gating
    const sb3 = sandbox();
    const noz = await sb3.run('fha.draft', 'BASE', {});
    check('P3 zonal context absent for non-CCA features', noz.indexOf('ZONAL(') === -1 && out1.indexOf('ZONAL(pra.draft)') >= 0);

    // P4 — every provider throws → base + contracts survive
    const boom = () => { throw new Error('boom'); };
    const sb4 = sandbox({
        _skillBodyFor: boom, _FEATURE_SPECS: {}, _goldenThreadContext: boom, _projectDocContext: boom,
        _memoryExemplars: boom, _zonalContext: boom,
        window: { AiFidelity: { exemplarsFor: boom }, A15_CORPUS: { groundingBlock: async () => { throw new Error('net'); } } }
    });
    let p4ok = false, p4out = '';
    try { p4out = await sb4.run('pra.draft', 'BASE', {}); p4ok = true; } catch (e) { p4ok = false; p4out = String(e); }
    // NOTE: spec lookup + thread + zonal sit OUTSIDE try/catch by classic-lane
    // design? No — verify the executed truth, whatever it is:
    check('P4 all-providers-throw still yields base + the three contracts', p4ok && p4out.indexOf('BASE') >= 0 && p4out.indexOf('[ASSUME]') >= 0 && p4out.indexOf('[INSUF]') >= 0, p4out.slice(0, 160));

    // P5 — empty blocks leave no separator litter
    const sb5 = sandbox({
        _skillBodyFor: () => '', _FEATURE_SPECS: {}, _goldenThreadContext: () => '', _projectDocContext: () => '',
        _memoryExemplars: () => '',
        window: { AiFidelity: { exemplarsFor: () => '' }, A15_CORPUS: { groundingBlock: async () => '' } }
    });
    const out5 = await sb5.run('fha.draft', 'BASE', {});
    check('P5 empty blocks skipped cleanly', out5.indexOf('BASE\n\n[ASSUME]') === 0, JSON.stringify(out5.slice(0, 40)));

    // P6 — grounding query = first user message, clipped
    const sb6 = sandbox();
    await sb6.run('fha.draft', 'BASE', { messages: [{ role: 'user', content: 'Z'.repeat(1000) }] });
    const a15 = sb6.calls.find(c => c[0] === 'a15');
    check('P6 A15 query is messages[0].content clipped to 300', !!a15 && a15[1].length === 300 && a15[2] === 4);

    // P7 — 2 Sep 2026: DECOMPOSE is exempt from the generic whole-task
    // insufficiency refusal (regression traced live: the F2 unification applied
    // it to every lane; the batch path never carried it before, and against a
    // self-scoping SDD the model refused to DERIVE aircraft functions). Basis +
    // assumptions still apply; only the refusal contract is withheld.
    const sb7 = sandbox();
    const out7 = await sb7.run('arch.decompose', 'BASE', {});
    check('P7 arch.decompose does NOT carry the generic insufficiency refusal', out7.indexOf('[INSUF]') === -1, out7.slice(-80));
    check('P7 arch.decompose still carries assumptions + basis contracts', out7.indexOf('[ASSUME]') >= 0 && out7.indexOf('[BASIS arch.decompose]') >= 0);
    const out7b = await sandbox().run('fha.draft', 'BASE', {});
    check('P7 a classifying lane (fha.draft) STILL carries the refusal contract', out7b.indexOf('[INSUF]') >= 0);

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite crashed — ' + e.message); process.exit(1); });

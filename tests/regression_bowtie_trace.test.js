#!/usr/bin/env node
/*
 * Regression — the bow-tie cross-side common-cause resolver (5 Aug 2026).
 *
 * The defect this pins against returning: btAutoBuildFrom wrote mitigative
 * barrier traces as {kind:'eta'} with NO logicalId, and both the finding loop
 * and the ledger feed keyed on trace.logicalId alone — so an AUTO-BUILT bow-tie
 * could never fire the cross-side common-cause check the module exists for.
 * Proven live 5 Aug: shared lock event 7128 sat in both cause cut sets of
 * pg-ac-fc23 and two linked barriers depended on it; findings = 0.
 *
 * The fix follows an eta-traced barrier through its event-tree link to the
 * fault tree that implements it (etaLinkBarrier already stores the page), so
 * no re-authoring is demanded of the user. These checks load the REAL
 * bowtie.js AND the REAL fta_engine.js — the resolver walks real cut sets.
 *
 * Run: node tests/regression_bowtie_trace.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');

const el = () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, insertBefore() {}, querySelectorAll: () => [], parentNode: null, nextSibling: null, remove() {} });
const ctx = { window: {}, console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => null, createElement: el, body: el(), querySelectorAll: () => [], addEventListener() {} },
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, alert() {},
    Math, JSON, Date, Set, Map, Object, Array, String, Number, parseFloat, parseInt, isFinite, isNaN, Promise,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
ctx.window.window = ctx.window; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(SITE, 'fta_engine.js'), 'utf8'), ctx, { filename: 'fta_engine.js' });
// fta_engine.js is an IIFE that publishes onto root = self||window||globalThis —
// in this vm that is ctx.window, NOT ctx. The first draft of this suite
// "wired" window.getCutsets = ctx.getCutsets (undefined), OVERWRITING the
// working binding — and the positive checks still passed through
// _ftaEvidence's fallback walk, which is exactly the every-leaf behaviour the
// fallback exists to provide. The harness must not re-wire what the module
// already published; it only fills what the IIFE does not put on window.
if (!ctx.window.getCutsets) throw new Error('harness: fta_engine did not publish getCutsets on window — the IIFE root resolution changed');
if (!ctx.window.computeExactProbability && ctx.window.SLFTAEngine) ctx.window.computeExactProbability = ctx.window.SLFTAEngine.computeExactProbability;
vm.runInContext(fs.readFileSync(path.join(SITE, 'bowtie.js'), 'utf8'), ctx, { filename: 'bowtie.js' });

// ---- fixture: the live-test shape, in miniature -----------------------------
// cause tree: OR( AND(latch 7127, lock 7128), AND(lock 7128, ch1, ch2) )
let _i = 1;
const be = (lid, p) => ({ id: _i++, logicalId: lid, name: 'E' + lid, type: 'basic', probability: p, lambda: 0, children: [] });
const g = (t, kids) => ({ id: _i++, type: 'gate', gateType: t, probability: 0, children: kids });
ctx.ftaPages = [
    { id: 'pg-cause', name: 'Cause', root: g('OR', [g('AND', [be(7127, 1e-4), be(7128, 1e-4)]), g('AND', [be(7128, 1e-4), be(7131, 1e-2), be(7132, 1e-2)])]) },
    { id: 'pg-impl', name: 'Implements the sensing barrier', root: g('AND', [be(7128, 1e-4), be(9001, 1e-3)]) },
    { id: 'pg-clean', name: 'Independent implementation', root: g('AND', [be(9101, 1e-3), be(9102, 1e-3)]) },
];
ctx.projectConfig = { bowties: [], eventTrees: [{ id: 'ET-9', name: 'x', initiator: { desc: 'x', freq: 1e-6 },
    barriers: [ { name: 'Sensing', pFail: 0.01, linkedPageId: 'pg-impl' },
                { name: 'Procedure', pFail: 0.1 },
                { name: 'Clean barrier', pFail: 0.02, linkedPageId: 'pg-clean' } ], consequences: {} }] };

const BT = overrides => Object.assign({ id: 'BT-T', name: 'T', ftaPageId: 'pg-cause', etaId: 'ET-9', barriers: [] }, overrides);
const evalBt = bt => ctx.window.bowtieEvaluate(bt);

console.log('\n[bowtie] the resolver follows an eta trace to the implementing tree');
{
    // exactly what btAutoBuildFrom used to write: kind 'eta', NO lid, NO pageId
    const bt = BT({ barriers: [{ id: 'b1', side: 'mitigative', name: 'Sensing', trace: { kind: 'eta', ref: 'ET-9 · Sensing', logicalId: '' } }] });
    const ev = evalBt(bt);
    check('the harness reaches REAL cut sets, not the every-leaf fallback',
        Array.isArray(ev.cutsets) && ev.cutsets.length === 2,
        JSON.stringify(ev.cutsets) + ' — if this is empty the engine binding broke and every positive below is running on the fallback walk');
    check('an auto-built barrier NOW fires the cross-side common-cause finding',
        ev.findings.some(f => f.kind === 'common-cause' && /7128/.test(f.text)),
        'this is the exact shape that produced findings = 0 live — the module could never raise the finding it exists to raise');
    check('…and the finding says the link was FOLLOWED, so the reader knows where the lid came from',
        ev.findings.some(f => /followed through its event-tree barrier/.test(f.text)));
    check('ccLids carries the shared event', ev.ccLids.indexOf('7128') >= 0);
}
{
    const bt = BT({ barriers: [{ id: 'b1', side: 'mitigative', name: 'Sensing', trace: { kind: 'eta', ref: 'ET-9 · Sensing', logicalId: '', pageId: 'pg-impl' } }] });
    check('a trace carrying pageId directly resolves without the name match',
        evalBt(bt).findings.some(f => f.kind === 'common-cause'));
}

console.log('\n[bowtie] negatives — the finding stays a finding, not a formality');
{
    const clean = BT({ barriers: [{ id: 'b1', side: 'mitigative', name: 'Clean barrier', trace: { kind: 'eta', ref: 'ET-9 · Clean barrier', logicalId: '' } }] });
    check('a barrier implemented by an INDEPENDENT tree raises nothing',
        !evalBt(clean).findings.some(f => f.kind === 'common-cause'),
        'if every linked barrier fires, the check is a tautology and the demo finding stops meaning anything');
    const unlinked = BT({ barriers: [{ id: 'b1', side: 'mitigative', name: 'Procedure', trace: { kind: 'eta', ref: 'ET-9 · Procedure', logicalId: '' } }] });
    check('an eta barrier with NO fault-tree link resolves to nothing and raises nothing',
        !evalBt(unlinked).findings.some(f => f.kind === 'common-cause'));
    const direct = BT({ barriers: [{ id: 'b1', side: 'mitigative', name: 'Direct', trace: { kind: 'component', ref: 'Lock', logicalId: '7128' } }] });
    check('a direct logicalId trace still works exactly as before',
        evalBt(direct).findings.some(f => f.kind === 'common-cause'));
    const prev = BT({ barriers: [{ id: 'b1', side: 'preventive', name: 'Sensing', trace: { kind: 'eta', ref: 'ET-9 · Sensing', logicalId: '' } }] });
    check('preventive barriers are not swept — they SHARE the cause side by definition',
        !evalBt(prev).findings.some(f => f.kind === 'common-cause'));
}

console.log('\n[bowtie] the ledger feed follows the same rule');
{
    ctx.projectConfig.bowties = [BT({ barriers: [{ id: 'b1', side: 'mitigative', name: 'Sensing', trace: { kind: 'eta', ref: 'ET-9 · Sensing', logicalId: '' } }] })];
    const hits = ctx.window.btLedgerHits();
    check('btLedgerHits reports the followed-link collision with real cut-set nodes',
        hits.length >= 1 && hits.every(h => h.sharedLid === '7128' && Array.isArray(h.cutsetNodes) && h.cutsetNodes.length),
        JSON.stringify(hits.map(h => h.sharedLid)));
    ctx.projectConfig.bowties = [];
}

console.log('\n[bowtie] the auto-builder now stashes the page on the trace');
{
    const src = fs.readFileSync(path.join(SITE, 'bowtie.js'), 'utf8');
    check('eta traces written by btAutoBuildFrom carry pageId and etaId',
        /pageId: ebar\.linkedPageId \|\| ''/.test(src) && /etaId: eta\.id/.test(src));
}

console.log('\n[bowtie] HL-1 ships BT-001 in the auto-builder\'s own shape');
{
    const c2 = { window: { addEventListener() {} }, console: { log() {}, warn() {}, error() {} } };
    c2.window.window = c2.window;
    vm.createContext(c2);
    vm.runInContext(fs.readFileSync(path.join(SITE, 'demo_kit.js'), 'utf8'), c2, { filename: 'demo_kit.js' });
    c2.slDemoMirror = c2.window.slDemoMirror;
    vm.runInContext(fs.readFileSync(path.join(SITE, 'demo_showcase_hl1.js'), 'utf8'), c2, { filename: 'demo_showcase_hl1.js' });
    const d = c2.window.SL_SHOWCASE_HL1.build();
    const bt = (d.projectConfig.bowties || [])[0];
    check('BT-001 exists and joins the real pair', !!bt && bt.ftaPageId === 'pg-ac-fc23' && bt.etaId === 'ET-001');
    check('its fault tree and event tree both exist in the project',
        !!bt && d.ftaPages.some(p => p.id === bt.ftaPageId) && d.projectConfig.eventTrees.some(t => t.id === bt.etaId));
    check('two mitigative barriers are eta-traced to implementing pages that exist',
        (() => { if (!bt) return false;
            const withPage = bt.barriers.filter(b => b.side === 'mitigative' && b.trace.kind === 'eta' && b.trace.pageId);
            return withPage.length === 2 && withPage.every(b => d.ftaPages.some(p => p.id === b.trace.pageId)); })(),
        'those two are the barriers whose implementing trees share cause-side events — the demo\'s common-cause findings are TRUE findings');
    check('one preventive barrier is deliberately untraced, so the generic-barrier lint speaks',
        !!bt && bt.barriers.some(b => b.side === 'preventive' && b.trace.kind === 'none'));
    check('the eta traces carry NO hand-authored logicalId — the resolver does the work',
        !!bt && bt.barriers.filter(b => b.trace.kind === 'eta').every(b => !b.trace.logicalId));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

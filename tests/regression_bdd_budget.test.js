#!/usr/bin/env node
/*
 * Regression — the BDD node budget (7 Aug 2026).
 *
 * WHAT WAS WRONG, ORIGINALLY. The budget counts nodes ALLOCATED during
 * construction, not the size of the answer, and it was pinned at 1,000,000.
 * Measured on the deployed build in Chrome, an independent-event tree produces a
 * final BDD of EXACTLY one node per event — 20,000 -> 20,000, 40,000 -> 40,000,
 * 71,000 -> 71,000 — and yet refused at 72,000 events, because construction churns
 * through ~14x the final size. The ceiling was an arena-accounting artefact, not a
 * complexity limit: a 200,000-event tree yields a 200,000-node answer it could never
 * reach. At the old ceiling the tab used 103 MB of a 4,192 MB allowance
 * (performance.memory.jsHeapSizeLimit, measured) — roughly 40x headroom unused.
 *
 * This matters commercially: the public demo shows a 200,000-basic-event tree with
 * ~299,800 canvas nodes. Reproduced here to within 0.4%. Before the change, exact
 * P(top) REFUSED on that tree in ~390 ms, so any claim that it "quantifies" could
 * only mean the canvas propagation pass.
 *
 * FIRST RAISE, 1,000,000 -> 4,000,000, bisected against that 200,000-event target:
 *   1,000,000 -> tree REFUSED,  adversarial refuses ~1.6 s
 *   3,000,000 -> tree REFUSED,  adversarial refuses  4.8 s
 *   4,000,000 -> tree 4,469 ms, adversarial refuses  5.9 s
 *   8,000,000 -> tree 4,756 ms, adversarial refuses 12.5 s, +567 MB
 *
 * SECOND RAISE, 4,000,000 -> 40,000,000, after an explicit product decision that up
 * to ~10 minutes of computation is acceptable PROVIDED THE MATHS STAYS EXACT. That
 * moves the target from 200,000 events to millions. Measured (container ~3.5x slower
 * than the dev Mac — a ratio established on THREE workloads, not one: 6.4/1.8,
 * 14.3/4.4, and 20.7/5.9):
 *     100,000 ev ->   150,174 canvas nodes, 6.4 s container,  1.8 s Mac*,  141 MB
 *     200,000 ev ->   299,807 canvas nodes, 14.3 s container, 4.4 s Mac*,  101 MB
 *     300,000 ev ->   450,004 canvas nodes,  81 s container, ~23 s Mac,     27 MB
 *     500,000 ev ->   750,251 canvas nodes,  46 s container, ~13 s Mac,     35 MB
 *   1,000,000 ev -> 1,500,053 canvas nodes, 197 s container, ~56 s Mac,  1,359 MB
 *   2,000,000 ev -> 3,001,363 canvas nodes, 271 s container, ~77 s Mac,  1,219 MB
 *   200,000 ev at 15% repeats -> OK, 29.5 s container, final BDD 311,704
 *   (* measured directly on the Mac — the rows that establish the ratio.)
 * Peak heap never passed 1.4 GB of the ~4 GB cage, so MEMORY IS NOT THE WALL here.
 * Stack depth is — see regression_desktop_scale for the --stack-size half.
 *
 * THE COST OF THE SECOND RAISE, measured on one adversarial shape, container:
 *    4,000,000 budget ->  20.7 s to refuse   (5.9 s measured in Chrome)
 *   40,000,000 budget -> 236.2 s to refuse  (~67 s Mac, derived at 3.5x)
 * Re-run under --max-old-space-size=4096 — the cage a browser tab and the Electron
 * renderer actually get — it STILL REFUSED CLEANLY (BDDExplosionError @40,000,000,
 * 243.9 s) instead of dying of memory exhaustion. That is the property that makes
 * the raise safe: a budget the process cannot survive reaching would convert a clean
 * refusal into a tab crash.
 *
 * ============================================================================
 * THE DEFECT THIS SUITE EXISTS TO STOP RECURRING — read this before touching it.
 * ============================================================================
 * There are TWO copies of the BDD kernel: engine_modules.js (page) and
 * fta_engine.js (worker + SLFTAEngine). Their own comments claim "one discipline,
 * both threads". They are byte-identical APART FROM THE BUDGET LINE — and the
 * budgets had SEPARATED. The first raise went into fta_engine.js only, so it was
 * INERT for the page: the app's real exact-P(top) path is fta_quant_modules.js's
 * buildBDDFromFT, which closes over the GLOBAL BDD from engine_modules.js (it
 * deliberately overrides the engine's page-side globals — see the load-order note
 * in index.html), and that copy went on refusing at 1,000,000.
 *
 * Proven by EXECUTION, not by reading: loading the three files in index.html order
 * and calling the bare global computeExactProbability on a 100,000-event tree gave
 * BDDExplosionError @1,000,000 in 5.2 s, while SLFTAEngine's copy of the same
 * function completed. After the fix both complete: 100,000 -> 1.8 s, 200,000 ->
 * 4.4 s, both returning a BDD of exactly one node per event.
 *
 * So this suite pins THREE things, not one: the number, the EQUALITY of the two
 * copies, and the fact that the PAGE path — not just the engine namespace — reaches
 * it. A test that only read fta_engine.js would have passed throughout the defect.
 *
 * Also pinned here: fta_worker.js's importScripts version must match index.html's
 * fta_engine.js tag. It was found STALE (worker on 1.4, page on 1.5), which lets a
 * deploy pair a fresh page with a cached older engine — the exact drift the file's
 * own comment says cannot happen.
 *
 * Run: node tests/regression_bdd_budget.test.js
 *      SLAB_SLOW=1 node tests/regression_bdd_budget.test.js   (adds the full-budget
 *      adversarial refusal, ~60 s on the dev Mac — kept opt-in so the wall stays fast)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const SRC = read('fta_engine.js');
const EMOD = read('engine_modules.js');
const QUANT = read('fta_quant_modules.js');
const WORKER = read('fta_worker.js');
const INDEX = read('index.html');

const ctx = { window: {}, console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object,
    Array, String, Number, isFinite, parseFloat, parseInt, Date, Int32Array, Float64Array, Uint32Array,
    performance: { now: () => Number(process.hrtime.bigint()) / 1e6 } };
ctx.window.window = ctx.window; vm.createContext(ctx);
vm.runInContext(SRC, ctx, { filename: 'fta_engine.js' });
vm.runInContext(read('perf_bench.js'), ctx, { filename: 'perf_bench.js' });
const E = ctx.SLFTAEngine || ctx.window.SLFTAEngine;
const gen = ctx.benchGenTree || ctx.window.benchGenTree;

const budgetOf = src => { const m = /_BDD_NODE_BUDGET = (\d+);/.exec(src); return m ? parseInt(m[1], 10) : null; };

console.log('\n[bdd-budget] the constant itself');
check('the budget is 40,000,000', budgetOf(SRC) === 40000000, String(budgetOf(SRC)));
check('it is a FIXED literal, never derived from available memory',
    !/_BDD_NODE_BUDGET\s*=\s*[^;]*(totalmem|deviceMemory|heapSizeLimit|Math\.(min|max)\()/.test(SRC),
    'a memory-derived budget makes two machines refuse differently on the same tree — that destroys the determinism the budget exists to provide, and the qualification argument with it');
check('both bisection tables are recorded, with both costs',
    /4,469 ms/.test(SRC) && /12\.5 s/.test(SRC) && /1\.6 s/.test(SRC) && /236\.2 s/.test(SRC),
    'without the tables the next person raises it again and pays the refusal latency without knowing');
check('the arena-vs-answer distinction is written down',
    /ALLOCATED during[\s\S]{0,20}construction/.test(SRC) && /one node[\s\S]{0,40}per event/i.test(SRC),
    'the comment may re-wrap freely; what must survive is the distinction between nodes allocated and the size of the answer');
check('the in-cage refusal check is recorded (4,096 MB, still refuses cleanly)',
    /max-old-space-size=4096/.test(SRC) && /243\.9 s/.test(SRC),
    'a budget the process cannot survive REACHING turns a clean refusal into a tab crash — that this one can was measured, and the measurement belongs next to the number');

console.log('\n[bdd-budget] THE TWO KERNELS MUST AGREE — this is the check that was missing');
check('engine_modules.js (page) carries a budget at all', budgetOf(EMOD) !== null);
check('page budget EQUALS engine budget',
    budgetOf(EMOD) === budgetOf(SRC),
    'page ' + budgetOf(EMOD) + ' vs engine ' + budgetOf(SRC) + ' — they separated once already and the raise was silently inert for the whole app');
check('the page copy is also a fixed literal',
    !/_BDD_NODE_BUDGET\s*=\s*[^;]*(totalmem|deviceMemory|heapSizeLimit|Math\.(min|max)\()/.test(EMOD));
check('the page copy says WHY it must track the engine copy',
    /MUST EQUAL/.test(EMOD) && /fta_engine\.js/.test(EMOD),
    'the next person to read only one file needs to be told there is another');
check('the two kernels are otherwise identical (same arena, same reduction rules)',
    /_hash3/.test(EMOD) && /_uGrow/.test(EMOD) && /BDDExplosionError/.test(EMOD),
    'if the kernels genuinely diverge, an equal budget is no longer sufficient for equal behaviour');

console.log('\n[bdd-budget] the worker cannot be paired with a stale engine');
{
    const pagePin = /fta_engine\.js\?v=([\d.]+)/.exec(INDEX);
    const workerPin = /importScripts\('fta_engine\.js\?v=([\d.]+)'\)/.exec(WORKER);
    check('index.html pins a version of fta_engine.js', !!pagePin);
    check('fta_worker.js importScripts a version too', !!workerPin);
    check('the two pins MATCH',
        pagePin && workerPin && pagePin[1] === workerPin[1],
        'page ' + (pagePin && pagePin[1]) + ' vs worker ' + (workerPin && workerPin[1]) +
        ' — a mismatch lets a fresh page run against a cached older engine, which is exactly the divergence the worker comment claims is impossible');
}

console.log('\n[bdd-budget] the answer is one node per event — the fact that made the old cap wrong');
for (const n of [5000, 20000, 40000]) {
    const g = gen({ events: n, fanout: 6, repeatPct: 0, seed: 42 });
    const r = E.computeExactProbability(g.root);
    check('an independent-event tree of ' + n + ' gives a BDD of exactly ' + n + ' nodes',
        r.bddSize === n, 'got ' + r.bddSize);
}

console.log('\n[bdd-budget] the public demo\'s tree quantifies EXACTLY — via the ENGINE namespace');
{
    const g = gen({ events: 200000, fanout: 6, repeatPct: 0, seed: 42 });
    const total = g.stats.gates + g.stats.uniqueEvents + g.stats.repeated;
    check('the reproduced tree matches the demo\'s ~299,800 canvas nodes',
        Math.abs(total - 299807) < 2000, String(total));
    const t = process.hrtime.bigint();
    let r = null, err = null;
    try { r = E.computeExactProbability(g.root); } catch (e) { err = e; }
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    check('exact P(top) COMPLETES on 200,000 events',
        !err && r && r.bddSize === 200000, err ? err.name + '@' + err.nodeCount : 'bdd ' + (r && r.bddSize));
    check('…and returns a finite probability in [0,1]',
        !err && r && isFinite(r.prob) && r.prob >= 0 && r.prob <= 1);
    check('…inside a sane wall-clock bound (measured 4.4 s; 60 s catches a real regression)',
        ms < 60000, Math.round(ms) + 'ms');
}

console.log('\n[bdd-budget] …AND VIA THE PATH THE APP ACTUALLY TAKES (the one that stayed broken)');
{
    // Load the three files in index.html order into one context and call the BARE
    // GLOBAL computeExactProbability — fta_quant_modules.js's copy, over
    // engine_modules.js's BDD. Testing SLFTAEngine alone is what let the defect
    // survive; this is the only assertion here that would have caught it.
    const p = { window: {}, console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object,
        Array, String, Number, isFinite, parseFloat, parseInt, Date, Int32Array, Float64Array, Uint32Array,
        Promise, Error, RangeError, TypeError, setTimeout, clearTimeout,
        setInterval: () => 0, clearInterval: () => {},
        performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
            createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) },
        localStorage: { getItem: () => null, setItem() {} }, location: { search: '' },
        navigator: { userAgent: 'node' } };
    p.window.window = p.window; p.globalThis = p; p.self = p.window;
    vm.createContext(p);
    let loadErr = null;
    for (const [name, src] of [['fta_engine.js', SRC], ['fta_quant_modules.js', QUANT], ['engine_modules.js', EMOD]]) {
        try { vm.runInContext(src, p, { filename: name }); } catch (e) { loadErr = name + ': ' + e.message; }
    }
    check('the three real files load together in index.html order', !loadErr, loadErr || '');
    check('the page\'s computeExactProbability is a DIFFERENT function from the engine\'s',
        typeof p.computeExactProbability === 'function' &&
        p.computeExactProbability !== (p.SLFTAEngine || p.window.SLFTAEngine || {}).computeExactProbability,
        'if these ever become the same object this whole section is redundant — and that would be an improvement worth making deliberately');

    const g = gen({ events: 100000, fanout: 6, repeatPct: 0, seed: 42 });
    const t = process.hrtime.bigint();
    let r = null, err = null;
    try { r = p.computeExactProbability(g.root); } catch (e) { err = e; }
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    check('the PAGE path completes a 100,000-event tree (it refused @1,000,000 before the fix)',
        !err && r && r.bddSize === 100000,
        err ? err.name + '@' + (err.nodeCount || 0).toLocaleString() + ' — engine_modules.js has drifted below fta_engine.js again' : 'bdd ' + (r && r.bddSize));
    check('…with a finite probability in [0,1]',
        !err && r && isFinite(r.prob) && r.prob >= 0 && r.prob <= 1);
    check('…in bounded time (measured 1.8 s)', ms < 60000, Math.round(ms) + 'ms');
}

console.log('\n[bdd-budget] a genuine explosion STILL refuses, by name');
{
    // Run the adversarial shape against a REDUCED budget so the wall stays fast. The
    // mechanism is what is under test; the shipped budget's refusal latency is
    // measured and recorded in the header, and re-runnable with SLAB_SLOW=1.
    const SMALL = 400000;
    const c2 = { window: {}, console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object,
        Array, String, Number, isFinite, parseFloat, parseInt, Date, Int32Array, Float64Array, Uint32Array,
        performance: { now: () => Number(process.hrtime.bigint()) / 1e6 } };
    c2.window.window = c2.window; vm.createContext(c2);
    vm.runInContext(SRC.replace(/const _BDD_NODE_BUDGET = \d+;/, 'const _BDD_NODE_BUDGET = ' + SMALL + ';'), c2, { filename: 'fta_engine.js' });
    const E2 = c2.SLFTAEngine || c2.window.SLFTAEngine;

    const build = () => {
        let _id = 1;
        const beRep = l => ({ id: _id++, logicalId: l, name: 'e', type: 'basic', probability: 1e-4, lambda: 0, children: [] });
        const G = (ty, k) => ({ id: _id++, type: 'gate', gateType: ty, probability: 0, children: k });
        const lids = []; for (let i = 0; i < 800; i++) lids.push('R-' + i);
        const pairs = []; for (let i = 0; i < 3000; i++) pairs.push(G('AND', [beRep(lids[(i * 7919) % 800]), beRep(lids[(i * 104729) % 800])]));
        return G('OR', pairs);
    };

    const t = process.hrtime.bigint();
    let err = null;
    try { E2.computeExactProbability(build()); } catch (e) { err = e; }
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    check('globally-scattered repeated events still REFUSE — the case the budget exists for', !!err);
    check('the refusal is the named BDDExplosionError, carrying the node count it hit',
        err && err.name === 'BDDExplosionError' && err.nodeCount === SMALL,
        err ? err.name + '@' + err.nodeCount : 'no error');
    check('the refusal path itself is fast (mechanism check, reduced budget)',
        ms < 30000, Math.round(ms) + 'ms');

    if (process.env.SLAB_SLOW === '1') {
        const t2 = process.hrtime.bigint();
        let e2 = null;
        try { E.computeExactProbability(build()); } catch (e) { e2 = e; }
        const s2 = Number(process.hrtime.bigint() - t2) / 1e6;
        check('[slow] the SHIPPED budget also refuses this shape rather than grinding forever',
            e2 && e2.name === 'BDDExplosionError' && e2.nodeCount === 40000000,
            e2 ? e2.name + '@' + e2.nodeCount : 'no error');
        check('[slow] …within the accepted ~10-minute envelope (measured 241 s container / ~60 s Mac)',
            s2 < 600000, Math.round(s2 / 1000) + 's');
    } else {
        console.log('  SKIP  [slow] full-budget adversarial refusal — set SLAB_SLOW=1 (~60 s on the dev Mac)');
    }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

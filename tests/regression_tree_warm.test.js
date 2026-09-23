#!/usr/bin/env node
/*
 * Regression — tree_warm.js: per-tree facts computed in the worker, off the UI
 * thread (23 Sep 2026, perf round 3).
 *
 * Executed end to end with the REAL files: the page side (fta_engine,
 * fta_quant_modules, engine_modules, model_checks, data_change, tree_warm) in
 * one context, and the REAL fta_worker.js + fta_engine.js in a second context
 * behind a Worker stand-in that delivers messages asynchronously through
 * structured clone, as a browser does.
 *
 *   W1  after a warm-up, P(top), cut sets, MC-01/02 single-failure events and
 *       MC-03 facts are answered with NO BDD work on the page, and every
 *       answer equals a cold computation in a separate, un-warmed page
 *   W2  a tree edited while its batch is in the worker is never answered from
 *       the stale result (it is filed under the old content's key)
 *   W3  it runs only when the data changed (data_change.js generation)
 *   W4  kill switch; no Worker at all → nothing happens, nothing throws
 *   W5  the dashboard check and the proposals sweep wait for a running warm-up
 * Run: node tests/regression_tree_warm.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

let workerMessages = 0;
class FakeWorker {
    constructor(url) {
        this.listeners = { message: [], error: [] };
        const w = { console, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, Date, Int32Array, Float64Array, Uint32Array, Uint8Array, Error, RangeError, TypeError };
        w.self = w; w.globalThis = w;
        w.importScripts = (u) => { if (/^fta_engine\.js/.test(u)) vm.runInContext(read('fta_engine.js'), w, { filename: 'fta_engine.js(worker)' }); };
        w.postMessage = (data) => { const copy = structuredClone(data); setImmediate(() => this.listeners.message.forEach(fn => fn({ data: copy }))); };
        vm.createContext(w);
        vm.runInContext(read('fta_worker.js'), w, { filename: 'fta_worker.js' });
        this.w = w; this.url = url;
    }
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
    postMessage(data) { workerMessages++; const copy = structuredClone(data); setImmediate(() => this.w.onmessage({ data: copy })); }
    terminate() {}
}

function makePage(opts) {
    const invs = {};
    const p = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date,
        Int32Array, Float64Array, Uint32Array, Uint8Array, Promise, Error, RangeError, TypeError, structuredClone,
        setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
        performance: { now: () => Date.now() }, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) },
        localStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: { userAgent: 'node' },
        SEVERITY_RANK: { Minor: 1, Major: 2, Hazardous: 4, Catastrophic: 5 },
        projectConfig: { mmel: { items: [{ id: 'MMEL-1', beRef: 'MMEL-BE' }] } }, acFhaData: [], systemsData: [], resourcesData: [] };
    if (opts && opts.worker) p.Worker = FakeWorker;
    p.window = p; p.globalThis = p; p.self = p;
    p.invRegister = inv => { invs[inv.id] = inv; };
    p.scheduleAutosave = () => true;
    vm.createContext(p);
    for (const f of ['fta_engine.js', 'fta_quant_modules.js', 'engine_modules.js', 'model_checks.js', 'data_change.js', 'tree_warm.js']) vm.runInContext(read(f), p, { filename: f });
    vm.runInContext('var ftaPages = [];', p);
    p.__invs = invs;
    return p;
}

// ---- a project: Cat/Haz trees with repeats, CCF, an MMEL event, a transfer --------------------------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function project() {
    let nid = 1;
    const be = (prob, extra) => Object.assign({ id: nid++, type: 'basic', probability: prob, name: 'E' + nid, displayId: 'BE-' + nid, children: [] }, extra || {});
    const gate = (gt, kids, extra) => Object.assign({ id: nid++, type: 'gate', gateType: gt, name: 'G', children: kids }, extra || {});
    const pages = [{ id: 'pg-sub', name: 'Sub', root: gate('AND', [be(0.1), be(0.2)]) }];
    const fha = [];
    for (let s = 1; s <= 30; s++) {
        const r = rng(s);
        const mk = d => {
            if (d === 0 || r() < 0.3) { const x = r();
                if (x < 0.1) return gate('TRANSFER', [], { transferOutTo: 'pg-sub' });
                if (x < 0.3) return be(1e-4, { logicalId: 'S' + (s % 5) });
                if (x < 0.38) return be(2e-3, { ccfGroup: 'G' + s, beta: 0.1 });
                if (x < 0.45) return be(1e-3, { displayId: 'MMEL-BE', logicalId: 'MMEL-LID' });
                return be(Math.round(r() * 1e4) / 1e7); }
            const gt = ['AND', 'OR', 'OR', 'VOTING'][Math.floor(r() * 4)];
            const kids = []; for (let i = 0; i < 2 + Math.floor(r() * 2); i++) kids.push(mk(d - 1));
            return gate(gt, kids, gt === 'VOTING' ? { votingK: 2 } : {});
        };
        const root = s % 3 === 0 ? gate('OR', [be(1e-5, { displayId: 'MMEL-BE', logicalId: 'MMEL-LID' }), gate('AND', [be(1e-3), be(1e-3)])]) : mk(3);
        pages.push({ id: 'pg' + s, name: 'Tree ' + s, root, linkedFhaId: s });
        fha.push({ internalId: s, fcId: 'FC-' + s, severity: s % 2 ? 'Catastrophic' : 'Hazardous' });
    }
    return { pages, fha };
}
function install(p, prj) {
    prj = JSON.parse(JSON.stringify(prj));
    prj.pages.forEach(x => p.ftaPages.push(x));
    prj.fha.forEach(x => p.acFhaData.push(x));
    return prj;
}
async function drain(p, max) {
    for (let i = 0; i < (max || 2000); i++) { await new Promise(r => setImmediate(r)); if (!p.SLTreeWarm.busy()) return true; }
    return false;
}
const answers = p => ({
    ptop: p.ftaPages.map(x => p.exactTopProbability(x.root)),
    mcs: JSON.stringify(p.ftaPages.map(x => p.minimalCutsetSnapshots(x.root))),
    spf: JSON.stringify(p.mcSpfList().map(r => [r.key, r.name, r.severity, r.pages, r.fcIds])),
    mc03: JSON.stringify(p.__invs['MC-03'].run())
});

(async () => {
    const PRJ = project();

    // cold reference: an un-warmed page (no Worker)
    const cold = makePage({ worker: false });
    install(cold, PRJ);
    const want = answers(cold);
    check('fixture exercises MC-03 and MC-01/02', JSON.parse(want.mc03).checked > 0 && JSON.parse(want.spf).length > 0, want.mc03);

    // ---- W1 ----------------------------------------------------------------------------
    const P = makePage({ worker: true });
    install(P, PRJ);
    let builds = 0; const real = P.buildBDDFromFT; P.buildBDDFromFT = function () { builds++; return real.apply(this, arguments); };
    const t1 = P.SLTreeWarm.tick();
    check('W1: a tick starts a warm-up', t1 && t1.started === true, JSON.stringify(t1));
    check('W1: the warm-up drains', await drain(P));
    const st = P.SLTreeWarm.stats();
    check('W1: every tree went through the worker, no errors', st.trees === P.ftaPages.length && st.errors === 0 && workerMessages > 0, JSON.stringify(st));
    builds = 0;
    const got = answers(P);
    check('W1: afterwards P(top), cut sets, MC-01/02 and MC-03 need NO BDD work on the page', builds === 0, 'builds=' + builds);
    check('W1: P(top) equals the cold page, bit for bit', JSON.stringify(got.ptop) === JSON.stringify(want.ptop));
    check('W1: cut sets equal the cold page', got.mcs === want.mcs);
    check('W1: MC-01/02 rows equal the cold page', got.spf === want.spf);
    check('W1: MC-03 result equals the cold page', got.mc03 === want.mc03, got.mc03 + ' vs ' + want.mc03);

    // ---- W3 ----------------------------------------------------------------------------
    const t2 = P.SLTreeWarm.tick();
    check('W3: nothing changed → the next tick does nothing', t2 && t2.idle === true, JSON.stringify(t2));

    // ---- W2 ----------------------------------------------------------------------------
    const pg = P.ftaPages[4];
    const leaf = (function f(n) { return n.type === 'gate' ? f(n.children.find(c => c.type !== 'gate' || c.gateType !== 'TRANSFER') || n.children[0]) : n; })(pg.root);
    leaf.probability = 0.0123;                 // an edit...
    P.scheduleAutosave();                      // ...announced
    const t3 = P.SLTreeWarm.tick();            // batch goes to the worker with THIS content
    leaf.probability = 0.0456;                 // edited again while the worker is busy
    await drain(P);
    builds = 0;
    const v = P.exactTopProbability(pg.root);
    const fresh = real(pg.root) && P.computeExactProbability(pg.root).prob;
    check('W2: a tree edited mid-flight is not answered from the stale result (miss, fresh computation)', t3 && t3.started && builds >= 1 && v === fresh, 'builds=' + builds);

    // ---- W4 ----------------------------------------------------------------------------
    P.SL_TREE_WARM_OFF = true; P.scheduleAutosave();
    check('W4: the kill switch stops it', P.SLTreeWarm.tick().skipped === true);
    const N = makePage({ worker: false }); install(N, PRJ);
    let threw = null; try { N.SLTreeWarm.tick(); } catch (e) { threw = e; }
    check('W4: no Worker → nothing happens, nothing throws, answers still correct', !threw && !N.SLTreeWarm.busy() && answers(N).mc03 === want.mc03);

    // ---- W5 ----------------------------------------------------------------------------
    const UX = read('ux_leading.js'), PR = read('fta_proposals.js');
    check('W5: the dashboard project check waits for a running warm-up (bounded)', /SLTreeWarm/.test(UX) && /warm\.busy\(\)/.test(UX) && /WARM_WAIT_MS = 30000/.test(UX));
    check('W5: the proposals sweep waits for a running warm-up (bounded)', /SLTreeWarm/.test(PR) && /warm\.busy\(\)/.test(PR) && /< 30000/.test(PR));
    const idx = read('index.html');
    check('W5: tree_warm.js loads after model_checks.js, fta_quant_modules.js and data_change.js', ['model_checks.js', 'fta_quant_modules.js', 'data_change.js'].every(f => idx.indexOf(f + '?v=') > 0 && idx.indexOf(f + '?v=') < idx.indexOf('tree_warm.js?v=')));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();

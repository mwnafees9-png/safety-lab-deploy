#!/usr/bin/env node
/*
 * Regression — the page and the worker compute IDENTICAL per-tree facts
 * (23 Sep 2026, perf round 3).
 *
 * tree_warm.js now pre-computes P(top), minimal cut sets, single-failure
 * events and MC-03 facts in the fault-tree worker (fta_engine.js) and files
 * them where the page reads them. That is only sound if the worker's answer is
 * exactly the page's. This suite pins it two ways:
 *
 *   E1  TEXT: every BDD function the page keeps its own copy of
 *       (fta_quant_modules.js, bound to the page's BDD instance) is identical
 *       to the engine's copy, comments and blank lines aside. FOUND WHEN THIS
 *       WAS WRITTEN: the engine's _probMapFor lacked the development-error rule
 *       (dev-error events enter the BDD at p = 0), so the worker's P(top) for a
 *       tree with a dev-error event differed from the page's. Fixed.
 *   E2  EXECUTION: on varied trees (repeated events, CCF tiers, VOTING/XOR,
 *       dev-error events, transfers into other pages, an MMEL-style event),
 *       treeFactsForWorker run in a separate worker-like context equals the
 *       page's own answers, bit for bit.
 *   E3  VERSIONS: fta_worker.js imports the engine version the page loads;
 *       tree_warm.js and misc_fn_modules.js spawn the same worker version.
 * Run: node tests/regression_engine_parity.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const ENGINE = read('fta_engine.js'), QUANT = read('fta_quant_modules.js');

// ---- E1 ---------------------------------------------------------------------------------
function fnText(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return null;
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
    return null;
}
const norm = t => t.split('\n').map(l => l.replace(/\s*\/\/.*$/, '').trimEnd()).filter(l => l.trim() !== '').join('\n');
for (const name of ['buildBDDFromFT', '_probMapFor', 'computeExactProbability', 'bddCutsets', '_minimizeBDDCutsets', 'bddMinimalCutsets', '_bddCombinations', 'cutsetSnapshot']) {
    const a = fnText(QUANT, name), b = fnText(ENGINE, name);
    check('E1: ' + name + ' is identical in the page (fta_quant_modules) and the engine (fta_engine)', a && b && norm(a) === norm(b), a && b ? 'texts differ' : 'missing in ' + (a ? 'engine' : 'page'));
}

// ---- E2 ---------------------------------------------------------------------------------
function pageContext() {
    const p = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date,
        Int32Array, Float64Array, Uint32Array, Uint8Array, Promise, Error, RangeError, TypeError, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        performance: { now: () => Date.now() }, document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) },
        localStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: { userAgent: 'node' },
        SEVERITY_RANK: { Minor: 1, Major: 2, Hazardous: 4, Catastrophic: 5 }, projectConfig: {}, acFhaData: [], systemsData: [], invRegister() {} };
    p.window = p; p.globalThis = p; p.self = p;
    vm.createContext(p);
    for (const f of ['fta_engine.js', 'fta_quant_modules.js', 'engine_modules.js', 'model_checks.js']) vm.runInContext(read(f), p, { filename: f });
    vm.runInContext('var ftaPages = [];', p);
    return p;
}
function workerContext() {
    const w = { console, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, Date, Int32Array, Float64Array, Uint32Array, Uint8Array, Error, RangeError, TypeError };
    w.self = w; w.globalThis = w;
    vm.createContext(w);
    vm.runInContext(ENGINE, w, { filename: 'fta_engine.js(worker)' });
    return w;
}
const P = pageContext(), W = workerContext();

let nid = 1;
const be = (prob, extra) => Object.assign({ id: nid++, type: 'basic', probability: prob, name: 'E' + nid, displayId: 'BE-' + nid, children: [] }, extra || {});
const gate = (gt, kids, extra) => Object.assign({ id: nid++, type: 'gate', gateType: gt, name: 'G', children: kids }, extra || {});
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randomTree(seed, transferTo) {
    const r = rng(seed), types = ['AND', 'OR', 'OR', 'VOTING', 'XOR'];
    const shared = [1, 2, 3].map(i => 'S' + seed + '_' + i);
    function mk(depth) {
        if (depth === 0 || r() < 0.3) {
            const x = r();
            if (transferTo && x < 0.08) return gate('TRANSFER', [], { transferOutTo: transferTo });
            if (x < 0.3) return be(1e-4, { logicalId: shared[Math.floor(r() * 3)] });
            if (x < 0.4) return be(2e-3, { ccfGroup: 'G' + seed, beta: 0.1, gamma: 0.2, delta: 0.3 });
            if (x < 0.48) return be(1e-2, { eventClass: 'dev-error' });
            if (x < 0.52) return be(1e-3, { displayId: 'MMEL-BE' });
            return be(Math.round(r() * 1e4) / 1e7);
        }
        const gt = types[Math.floor(r() * types.length)];
        const kids = []; const n = 2 + Math.floor(r() * 2); for (let i = 0; i < n; i++) kids.push(mk(depth - 1));
        return gate(gt, kids, gt === 'VOTING' ? { votingK: 2 } : {});
    }
    return mk(3);
}
// the pages a transfer tree needs
const SUB = { id: 'pg-sub', root: gate('AND', [be(0.1), be(0.2, { eventClass: 'dev-error' }), be(3e-3, { logicalId: 'SHARED' })]) };
P.ftaPages.push(SUB);

let ok = { ptop: true, mcs: true, singles: true, mmel: true, devErr: false }, why = '';
for (let s = 1; s <= 40; s++) {
    const t = randomTree(s, s % 4 === 0 ? 'pg-sub' : null);
    const pages = s % 4 === 0 ? [{ id: SUB.id, root: SUB.root }] : [];
    const clone = JSON.parse(JSON.stringify({ t, pages }));   // what structured clone hands the worker
    const f = W.SLFTAEngine.treeFactsForWorker(clone.t, clone.pages);
    let pageP, pageM, built;
    try { pageP = P.computeExactProbability(t).prob; } catch (e) { pageP = 'ERR:' + e.name; }
    try { pageM = JSON.stringify(P.minimalCutsetSnapshots(t)); } catch (e) { pageM = 'ERR:' + e.name; }
    built = P.buildBDDFromFT(t);
    const pageS = JSON.stringify(P.SLFTAEngine.singleFailureEvents(built));
    // MC-03 as it was computed before (the page's own BDD + _minOrder with the variable fixed)
    const mm = { lids: [], alone: [] };
    if (built.bdd && !built.bdd.isTerminal) built.lidToVar.forEach((v, lid) => { mm.lids.push(lid); if (P._mcMinOrder(built.bdd, new Set([v])) === 0) mm.alone.push(lid); });
    if (f.ptop !== pageP && !(typeof pageP === 'string' && f.ptopError)) { ok.ptop = false; why = 'ptop seed ' + s + ': ' + f.ptop + ' vs ' + pageP; }
    if (JSON.stringify(f.mcs) !== pageM && !(pageM.startsWith('ERR') && f.mcsError)) { ok.mcs = false; why = 'mcs seed ' + s; }
    if (JSON.stringify(f.singles) !== pageS) { ok.singles = false; why = 'singles seed ' + s; }
    if (JSON.stringify(f.mmel.lids) !== JSON.stringify(mm.lids) || JSON.stringify(f.mmel.alone) !== JSON.stringify(mm.alone)) { ok.mmel = false; why = 'mmel seed ' + s; }
    if (JSON.stringify(t).indexOf('dev-error') !== -1 && typeof pageP === 'number') ok.devErr = true;
}
check('E2: worker P(top) equals the page, bit for bit, on 40 trees (incl. transfers and dev-error events)', ok.ptop && ok.devErr, why);
check('E2: worker cut-set snapshots equal the page', ok.mcs, why);
check('E2: worker single-failure events equal the page', ok.singles, why);
check('E2: worker MC-03 facts equal the page\'s own MC-03 test', ok.mmel, why);

// ---- E3 ---------------------------------------------------------------------------------
const idx = read('index.html');
const pageEngineV = (idx.match(/fta_engine\.js\?v=([\d.]+)"/) || [])[1];
const workerImportV = (read('fta_worker.js').match(/importScripts\('fta_engine\.js\?v=([\d.]+)'\)/) || [])[1];
check('E3: the worker imports the engine version the page loads', pageEngineV && pageEngineV === workerImportV, pageEngineV + ' vs ' + workerImportV);
const spawnMisc = (read('misc_fn_modules.js').match(/new Worker\('fta_worker\.js\?v=([\d.]+)'\)/) || [])[1];
const spawnWarm = (read('tree_warm.js').match(/new Worker\('fta_worker\.js\?v=([\d.]+)'\)/) || [])[1];
check('E3: tree_warm.js and misc_fn_modules.js spawn the same worker version', spawnMisc && spawnMisc === spawnWarm, spawnMisc + ' vs ' + spawnWarm);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

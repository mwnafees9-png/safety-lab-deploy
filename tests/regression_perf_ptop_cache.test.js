#!/usr/bin/env node
/*
 * Regression — perf fix 4 (23 Sep 2026): the read-only P(top) cache.
 *
 * Dashboard, PASA and FTA arrivals recomputed the exact P(top) of every tree
 * on every arrival (budget ledger, CCMR NTE, stale watch); each call rebuilt
 * the BDD from scratch. exactTopProbability(root) (fta_quant_modules.js)
 * returns the same number, keyed by the FULL content of everything the BDD
 * build reads, so a repeat with identical inputs is a lookup and ANY change
 * to the tree, or to a page it transfers into, is a fresh computation.
 *
 * This suite pins:
 *   · equality with computeExactProbability on varied trees (AND/OR/XOR/
 *     VOTING, repeated events, CCF beta/gamma/delta, dev-error events,
 *     transfers into other pages);
 *   · a repeat is a cache hit (no BDD build);
 *   · every input that changes the answer is a miss with the fresh answer;
 *   · the key is unambiguous (crafted look-alike values do not collide);
 *   · the cache is bounded; errors are not cached;
 *   · the three hot callers use it.
 * Run: node tests/regression_perf_ptop_cache.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- load the three real files in index.html order (same sandbox as regression_bdd_budget)
const p = { window: {}, console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object,
    Array, String, Number, isFinite, parseFloat, parseInt, Date, Int32Array, Float64Array, Uint32Array, Uint8Array,
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
for (const name of ['fta_engine.js', 'fta_quant_modules.js', 'engine_modules.js']) {
    try { vm.runInContext(read(name), p, { filename: name }); } catch (e) { loadErr = name + ': ' + e.message; }
}
check('the real engine files load in index.html order', !loadErr, loadErr || '');
check('exactTopProbability is defined next to computeExactProbability',
    typeof p.exactTopProbability === 'function' && typeof p.computeExactProbability === 'function');

// count real BDD builds through the global binding computeExactProbability uses
let builds = 0;
const realBuild = p.buildBDDFromFT;
p.buildBDDFromFT = function () { builds++; return realBuild.apply(this, arguments); };

// ---- fixtures ------------------------------------------------------------------
let nid = 1;
const be = (prob, extra) => Object.assign({ id: nid++, type: 'basic', probability: prob, children: [] }, extra || {});
const gate = (gt, kids, extra) => Object.assign({ id: nid++, type: 'gate', gateType: gt, children: kids }, extra || {});
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randomTree(seed) {
    const r = rng(seed), types = ['AND', 'OR', 'OR', 'XOR', 'VOTING'];
    const shared = [1, 2, 3].map(i => ({ logicalId: 'S' + seed + '_' + i, probability: 1e-3 * i }));
    function mk(depth) {
        if (depth === 0 || r() < 0.25) {
            const x = r();
            if (x < 0.3) { const s = shared[Math.floor(r() * shared.length)]; return be(s.probability, { logicalId: s.logicalId }); }
            if (x < 0.4) return be(2e-3, { ccfGroup: 'G' + seed, beta: 0.1, gamma: 0.2, delta: 0.3 });
            if (x < 0.45) return be(1e-2, { eventClass: 'dev-error' });
            return be(Math.round(r() * 1e4) / 1e6);
        }
        const gt = types[Math.floor(r() * types.length)];
        const n = 2 + Math.floor(r() * 3);
        const kids = []; for (let i = 0; i < n; i++) kids.push(mk(depth - 1));
        return gate(gt, kids, gt === 'VOTING' ? { votingK: 2 } : {});
    }
    return mk(4);
}
const fresh = root => p.computeExactProbability(root).prob;

// ---- 1. equality ---------------------------------------------------------------
let eqOk = true, eqWhy = '';
for (let s = 1; s <= 40; s++) {
    const t = randomTree(s);
    const a = fresh(t), b = p.exactTopProbability(t);
    if (a !== b) { eqOk = false; eqWhy = 'seed ' + s + ': ' + a + ' vs ' + b; break; }
}
check('equals computeExactProbability on 40 varied trees (bit-for-bit)', eqOk, eqWhy);

// transfers: the answer depends on another page's content
const sub = gate('AND', [be(0.1), be(0.2)]);
p.ftaPages = [{ id: 'pg-sub', root: sub }];
vm.runInContext('var ftaPages = globalThis.ftaPages;', p);
const top = gate('OR', [be(0.01), gate('TRANSFER', [], { transferOutTo: 'pg-sub' })]);
check('transfer tree: equal to the fresh computation', p.exactTopProbability(top) === fresh(top));

// ---- 2. a repeat is a hit --------------------------------------------------------
const T = randomTree(99);
const v1 = p.exactTopProbability(T);
builds = 0;
const v2 = p.exactTopProbability(T);
check('an identical repeat is a cache hit (no BDD build) with the same value', builds === 0 && v1 === v2, 'builds=' + builds);
const Tclone = JSON.parse(JSON.stringify(T));
builds = 0;
check('…also for a structurally identical copy (content-keyed, not identity-keyed)',
    p.exactTopProbability(Tclone) === v1 && builds === 0);

// ---- 3. every relevant change is a miss with the fresh answer --------------------------
function mutateCheck(name, mutate, root) {
    root = root || JSON.parse(JSON.stringify(T));
    p.exactTopProbability(root);               // warm
    mutate(root);
    builds = 0;
    const got = p.exactTopProbability(root);
    const hitBuilds = builds;
    const want = fresh(root);
    check('change → recompute: ' + name, hitBuilds === 1 && got === want, 'builds=' + hitBuilds + ' got=' + got + ' want=' + want);
}
const firstLeaf = n => (n.type === 'gate' ? firstLeaf(n.children[0]) : n);
const firstGate = n => n;
mutateCheck('a leaf probability', r => { firstLeaf(r).probability = 0.37; });
mutateCheck('a gate type', r => { firstGate(r).gateType = firstGate(r).gateType === 'AND' ? 'OR' : 'AND'; });
mutateCheck('a VOTING k', r => { r.gateType = 'VOTING'; r.votingK = 1; });
mutateCheck('a child added', r => { r.children.push(be(0.5)); });
mutateCheck('child order (XOR/VOTING are order-free, structure is still keyed)', r => { r.children.reverse(); });
mutateCheck('a logicalId (makes an event repeated)', r => { const a = firstLeaf(r); a.logicalId = 'REP'; const b = r.children[r.children.length - 1]; firstLeaf(b).logicalId = 'REP'; });
mutateCheck('CCF beta', r => { const a = firstLeaf(r); a.ccfGroup = 'GX'; a.beta = 0.5; });
mutateCheck('eventClass dev-error', r => { firstLeaf(r).eventClass = 'dev-error'; });
mutateCheck('a leaf in a TRANSFERRED page', () => { sub.children[0].probability = 0.9; }, top);
mutateCheck('the transfer target page removed', () => { p.ftaPages.length = 0; }, top);

// ---- 4. unambiguous key -------------------------------------------------------------------
const k1 = vm.runInContext('_ptopKey', p)({ id: 1, type: 'basic', logicalId: 'a",n1', probability: 1 });
const k2 = vm.runInContext('_ptopKey', p)({ id: 1, type: 'basic', logicalId: 'a', probability: '1' });
const k3 = vm.runInContext('_ptopKey', p)({ id: 1, type: 'basic', logicalId: 'a', probability: 1 });
check('look-alike values do not collide (string vs number, quoted delimiters)', k1 !== k2 && k2 !== k3 && k1 !== k3);

// ---- 5. bounded; errors not cached ------------------------------------------------------------
for (let i = 0; i < 1100; i++) p.exactTopProbability(be(i / 1e5));
const size = vm.runInContext('_ptopCache.size', p);
check('the cache is bounded (≤ 1000 entries)', size <= 1000, 'size=' + size);
let calls = 0;
p.buildBDDFromFT = function () { calls++; const e = new Error('x'); e.name = 'BDDExplosionError'; throw e; };
const bad = gate('OR', [be(0.123456)]);
let threw = 0;
for (let i = 0; i < 2; i++) { try { p.exactTopProbability(bad); } catch (_) { threw++; } }
check('an error is never cached (each call recomputes and throws)', threw === 2 && calls === 2);
p.buildBDDFromFT = realBuild;

// ---- 6. the hot read-only callers use it -------------------------------------------------------
check('budget ledger _pTop uses the cached P(top)', /function _pTop[\s\S]{0,400}exactTopProbability\(page\.root\)/.test(read('budget_ledger.js')));
check('CCMR NTE evalAt uses the cached P(top)', /const evalAt = v => \{[\s\S]{0,400}exactTopProbability\(page\.root\)/.test(read('helpers_modules.js')));
check('stale watch sweepAlpha uses the cached P(top)', /function sweepAlpha[\s\S]{0,500}exactTopProbability/.test(read('stale_watch.js')));
check('computeExactProbability itself is unchanged (callers needing the diagram still get a fresh one)',
    /function computeExactProbability\(rootNode\) \{\n    const built = buildBDDFromFT\(rootNode\);/.test(read('fta_quant_modules.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

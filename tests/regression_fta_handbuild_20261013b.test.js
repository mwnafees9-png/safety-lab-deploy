#!/usr/bin/env node
/*
 * Regression: the fault tree is built and edited by hand (13 Oct 2026, fix G).
 *
 * FOUND (diagram audit, 12 Oct 2026, section 1):
 *   - No toolbox, no drawn connections, no way to move a node to another gate, no undo for
 *     dragging or for text typed on the canvas, no overview map for big trees, failure rate
 *     and probability read-only on the canvas, no screen to link an event to its item.
 *   - The sequence-enforcing gate (SEQ), the fourth standard dynamic gate, was missing.
 *   - The NOT gate (IEC 61025) was missing; it must be offered only when the project turns on
 *     non-coherent logic, and its cut sets must be prime implicants or refused in plain words.
 *   - The fault tree CSV import read every dynamic gate (PAND, SPARE, FDEP) back as a basic event.
 *   - The dissimilar Monte Carlo cross-check read every gate it did not know as OR.
 * FIX:
 *   - SEQ in fta_engine.js and fta_quant_modules.js (held identical): exact for an independent
 *     module of constant-rate basic events (pure-birth Markov chain, the same uniformization as
 *     PAND/SPARE, _seqExactProb), else the AND bound with the reason shown; cut sets tagged
 *     SEQ with the order; DFT Monte Carlo samples the sum of lives; the AND-family lists
 *     (allocation, DAL independence, CMA, critical gates, RBD) include SEQ.
 *   - NOT: BDD.not of its input (NOR over several); calcBottomUp and the DFT Monte Carlo agree;
 *     a tree with NOT lists PRIME IMPLICANTS ("NOT X" rows) found by iterated consensus over the
 *     BDD paths, or refuses in plain words above 2,000 terms; coherent trees are unchanged.
 *   - fta_canvas_edit.js (SLFtaEdit): toolbox, connect / re-parent / disconnect with plain
 *     refusals, unattached nodes kept on the page out of the math, canvas λ / P through the
 *     panel's own rules, model link (realizedByItemId, sysmlRef, element ID), overview map, and
 *     ONE change path: SLFtaEdit.applyEdit (before-change veto, undo snapshot, change,
 *     recalculation, redraw, autosave, change listeners).
 * EXECUTED: the REAL site files in vm contexts (page: fta_engine + fta_quant_modules +
 * engine_modules; worker: fta_engine alone; fta_canvas_edit.js with recorded stubs for the app
 * functions it calls), checked against INDEPENDENT answers written here: the hypoexponential
 * closed form, a seeded Monte Carlo of the sum of exponential lives, truth-table enumeration
 * of prime implicants, and hand-derived probabilities. Mutation proofs: the SEQ dispatch and
 * the prime-implicant routing are reverted textually and the checks must go red.
 * Browser checks (Playwright, K350 showcase + generated 2k/20k/100k-node trees) are in the
 * fix G report.
 * Run: node tests/regression_fta_handbuild_20261013b.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ': ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

function pageContext(overrides) {
    overrides = overrides || {};
    const p = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date,
        Int32Array, Float64Array, Uint32Array, Uint8Array, Float32Array, Promise, Error, RangeError, TypeError, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        performance: { now: () => Date.now() }, document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) },
        localStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: { userAgent: 'node' },
        SEVERITY_RANK: { Minor: 1, Major: 2, Hazardous: 4, Catastrophic: 5 }, projectConfig: {}, acFhaData: [], systemsData: [], invRegister() {} };
    p.window = p; p.globalThis = p; p.self = p;
    vm.createContext(p);
    for (const f of ['fta_engine.js', 'fta_quant_modules.js', 'engine_modules.js']) vm.runInContext(overrides[f] || read(f), p, { filename: f });
    vm.runInContext('var ftaPages = []; var ftaConfig = { exposureTime: 1, mode: "bottom-up", linkedFhaId: "" }; var activeFTAPageId = null;', p);
    return p;
}
function workerContext(src) {
    const w = { console, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, Date, Int32Array, Float64Array, Uint32Array, Uint8Array, Error, RangeError, TypeError };
    w.self = w; w.globalThis = w;
    vm.createContext(w);
    vm.runInContext(src || read('fta_engine.js'), w, { filename: 'fta_engine.js(worker)' });
    return w;
}
let nid = 1;
const L = (name, lam, t) => ({ id: nid++, logicalId: 'L' + nid, type: 'basic', displayId: name, name, lambda: lam, inputMode: 'lambda', inputValue: lam, probability: -Math.expm1(-lam * (t || 1)), children: [] });
const P = (name, p) => ({ id: nid++, logicalId: 'P' + nid, type: 'basic', displayId: name, name, probability: p, children: [] });
const G = (gt, kids, extra) => Object.assign({ id: nid++, type: 'gate', gateType: gt, displayId: 'G' + nid, name: gt, children: kids }, extra || {});
const copy = n => Object.assign({}, n, { id: nid++ });   // same logicalId: a repeated event
// Hypoexponential CDF, distinct rates: P(T1 + ... + Tn <= t) = 1 - sum_i [prod_{j != i} l_j / (l_j - l_i)] e^{-l_i t}.
function hypoCdf(ls, t) { let s = 0; for (let i = 0; i < ls.length; i++) { let c = 1; for (let j = 0; j < ls.length; j++) if (j !== i) c *= ls[j] / (ls[j] - ls[i]); s += c * Math.exp(-ls[i] * t); } return 1 - s; }
function mulberry(a) { return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const PG = pageContext(), WK = workerContext();
const ENG = read('fta_engine.js'), QM = read('fta_quant_modules.js');

// ============================================================================ [1] SEQ: exact value
{
    const t = 1000, ls = [2e-4, 5e-4];
    const g = G('SEQ', [L('A', ls[0], t), L('B', ls[1], t)]);
    const r = PG.computeExactProbability(g);
    check('[1a] SEQ of two constant-rate events = hypoexponential CDF (page engine)', rel(r.prob, hypoCdf(ls, t)) < 1e-9, r.prob + ' vs ' + hypoCdf(ls, t));
    check('[1a] the gate is classified exact', r.dyn && r.dyn[0] && r.dyn[0].mode === 'exact' && r.dyn[0].gateType === 'SEQ');
    const w = WK.SLFTAEngine.computeExactProbability(JSON.parse(JSON.stringify(g)));
    check('[1b] the worker engine gives the same number', w.prob === r.prob, w.prob + ' vs ' + r.prob);
    const ls3 = [1e-3, 3e-4, 7e-4], t3 = 500;
    const g3 = G('SEQ', ls3.map((l, i) => L('S' + i, l, t3)));
    const p3 = PG.computeExactProbability(g3).prob;
    check('[1c] SEQ of three events = hypoexponential CDF', rel(p3, hypoCdf(ls3, t3)) < 1e-9, p3 + ' vs ' + hypoCdf(ls3, t3));
    // independent brute force: sum of exponential lives, own RNG
    const rnd = mulberry(20261013); let hit = 0; const N = 400000;
    for (let i = 0; i < N; i++) { let s = 0; for (const l of ls3) s += -Math.log(Math.max(rnd(), 1e-300)) / l; if (s <= t3) hit++; }
    const pm = hit / N, se = Math.sqrt(pm * (1 - pm) / N);
    check('[1d] SEQ agrees with an independent brute-force time simulation within 4 sigma', Math.abs(pm - p3) < 4 * se, pm + ' +- ' + se + ' vs ' + p3);
    const and = g3.children.reduce((a, c) => a * c.probability, 1);
    check('[1e] SEQ <= the AND bound (the lives sum below t only if each is below t)', p3 <= and * (1 + 1e-12), p3 + ' vs ' + and);
    // calcBottomUp (the per-gate number the canvas shows) agrees
    vm.runInContext('ftaConfig.exposureTime = ' + t3 + ';', PG);
    const c3 = PG.calcBottomUp(JSON.parse(JSON.stringify(g3)));
    check('[1f] calcBottomUp gives the same exact SEQ value', rel(c3, p3) < 1e-9, c3 + ' vs ' + p3);
    // the app's DFT Monte Carlo
    const mc = PG.simulateDFT(JSON.parse(JSON.stringify(g3)), t3, 200000, 11);
    check('[1g] DFT Monte Carlo (simulateDFT) agrees within 4 sigma and counts SEQ as dynamic', Math.abs(mc.p - p3) < 4 * mc.stderr && mc.dynGateCount === 1, mc.p + ' +- ' + mc.stderr + ' vs ' + p3);
    vm.runInContext('ftaConfig.exposureTime = 1;', PG);
}
// ============================================================================ [2] SEQ: bound cases, cut sets, frequency
{
    const a = L('A', 1e-3), b = L('B', 2e-3), c = L('C', 3e-3);
    const g = G('SEQ', [G('OR', [a, c]), b]);
    const r = PG.computeExactProbability(g);
    const orP = 1 - (1 - a.probability) * (1 - c.probability);
    check('[2a] SEQ with a gate input holds the AND bound (all inputs failed, any order)', rel(r.prob, orP * b.probability) < 1e-12 && r.dyn[0].mode === 'bound' && /gate/.test(r.dyn[0].reason), r.prob + ' ' + JSON.stringify(r.dyn[0]));
    const shared = L('X', 1e-3);
    const g2 = G('OR', [G('SEQ', [shared, L('Y', 1e-3)]), copy(shared)]);
    const r2 = PG.computeExactProbability(g2);
    check('[2b] SEQ whose input is repeated elsewhere is a bound, with the reason', r2.dyn[0].mode === 'bound' && /elsewhere/.test(r2.dyn[0].reason), JSON.stringify(r2.dyn[0]));
    const g3 = G('SEQ', [L('P1', 1e-3), L('P2', 1e-3)]);
    const cs = WK.SLFTAEngine.getCutsets(g3);
    check('[2c] SEQ cut set is tagged SEQ with the order left to right', cs.length === 1 && cs[0].dynamicOrigin === 'SEQ' && cs[0].dynamicOrder === 'P1 → P2', JSON.stringify(cs.map(x => [x.dynamicOrigin, x.dynamicOrder])));
    const ff = PG.SLFTAEngine.computeFailureFrequency(g3);
    check('[2d] failure frequency is a finite number for a SEQ tree', ff && isFinite(ff.wTE) && ff.wTE > 0, JSON.stringify(ff));
    // top-down allocation treats SEQ as AND family (geometric split)
    const td = G('SEQ', [P('Q1', 0), P('Q2', 0)]);
    PG.allocateTopDown(td, 1e-6, 'equal');
    check('[2e] top-down allocation splits a SEQ budget like an AND (each input 1e-3 for 1e-6)', rel(td.children[0].probability, 1e-3) < 1e-9, td.children[0].probability);
}
// ============================================================================ [3] NOT: probability
{
    const a = P('A', 0.1), b = P('B', 0.2);
    const top = G('AND', [a, G('NOT', [b])]);
    check('[3a] P(A AND NOT B) = pA (1 - pB) exactly (BDD)', rel(PG.computeExactProbability(top).prob, 0.1 * 0.8) < 1e-12);
    check('[3b] calcBottomUp NOT = 1 - p', rel(PG.calcBottomUp(JSON.parse(JSON.stringify(G('NOT', [P('C', 0.3)])))), 0.7) < 1e-12);
    const nor = G('NOT', [P('D', 0.1), P('E', 0.2)]);
    check('[3c] NOT over two inputs is NOR: (1 - pD)(1 - pE)', rel(PG.computeExactProbability(nor).prob, 0.9 * 0.8) < 1e-12);
    // shared event through NOT: A AND NOT A = impossible; A OR NOT A = certain
    const s = P('S', 0.3);
    check('[3d] A AND NOT A = 0 and A OR NOT A = 1 (repeated event handled exactly)',
        PG.computeExactProbability(G('AND', [s, G('NOT', [copy(s)])])).prob === 0 && rel(PG.computeExactProbability(G('OR', [s, G('NOT', [copy(s)])])).prob, 1) < 1e-12);
    const tdn = G('NOT', [P('N1', 0), P('N2', 0)]);
    PG.allocateTopDown(tdn, 0.81, 'equal');
    check('[3e] top-down through NOT: (1 - p1)(1 - p2) = target', rel((1 - tdn.children[0].probability) * (1 - tdn.children[1].probability), 0.81) < 1e-9, JSON.stringify(tdn.children.map(c => c.probability)));
    // DFT Monte Carlo judges NOT at the mission end
    const x = L('X', 1e-3, 500), y = L('Y', 2e-3, 500);
    const tr = G('AND', [x, G('NOT', [y])]);
    const mc = PG.simulateDFT(JSON.parse(JSON.stringify(tr)), 500, 200000, 3);
    const ex = x.probability * (1 - y.probability);
    check('[3f] DFT Monte Carlo of A AND NOT B agrees within 4 sigma', Math.abs(mc.p - ex) < 4 * mc.stderr, mc.p + ' vs ' + ex);
}
// ============================================================================ [4] NOT: prime implicants vs truth table
// Independent prime implicants: enumerate every cube (each var 0, 1 or free), keep those that
// imply f, then keep the ones no other implicant contains (fewer literals, same signs).
function truthPrimes(vars, f) {
    const n = vars.length, cubes = [];
    const total = Math.pow(3, n);
    for (let c = 0; c < total; c++) {
        const lit = []; let x = c;
        for (let i = 0; i < n; i++) { lit.push(x % 3); x = Math.floor(x / 3); }   // 0 = free, 1 = true, 2 = false
        let implies = true;
        for (let m = 0; m < (1 << n) && implies; m++) {
            let inCube = true;
            for (let i = 0; i < n; i++) { const v = (m >> i) & 1; if (lit[i] === 1 && !v) inCube = false; if (lit[i] === 2 && v) inCube = false; }
            if (inCube && !f(m)) implies = false;
        }
        if (implies) cubes.push(lit);
    }
    const sub = (a, b) => a.every((l, i) => l === 0 || l === b[i]);   // a contains b
    // (a tautology's only prime is the empty cube: the top event always occurs)
    const primes = cubes.filter(c => !cubes.some(d => d !== c && sub(d, c) && d.some((l, i) => l !== c[i])));
    return primes.map(c => c.map((l, i) => l === 0 ? null : (l === 1 ? vars[i] : 'NOT ' + vars[i])).filter(Boolean).sort().join(' & ')).sort();
}
function evalTree(n, m, idx) {
    if (n.type !== 'gate') return !!((m >> idx[n.logicalId]) & 1);
    const k = n.children.map(c => evalTree(c, m, idx));
    if (n.gateType === 'AND') return k.every(Boolean);
    if (n.gateType === 'OR') return k.some(Boolean);
    if (n.gateType === 'NOT') return !k.some(Boolean);
    if (n.gateType === 'VOTING') return k.filter(Boolean).length >= (n.votingK || 2);
    throw new Error('gate ' + n.gateType);
}
{
    const rnd = mulberry(77);
    let agree = 0, tried = 0, diffs = [];
    for (let trial = 0; trial < 40; trial++) {
        const ev = ['A', 'B', 'C', 'D'].map(nm => P(nm, 0.1 + 0.2 * rnd()));
        const idx = {}; ev.forEach((e, i) => { idx[e.logicalId] = i; });
        const leaf = () => copy(ev[Math.floor(rnd() * ev.length)]);
        const build = d => {
            if (d === 0) return leaf();
            const r = rnd();
            if (r < 0.25) return G('NOT', [build(d - 1)]);
            const k = 2 + Math.floor(rnd() * 2), kids = []; for (let i = 0; i < k; i++) kids.push(build(d - 1));
            return G(r < 0.6 ? 'OR' : (r < 0.9 ? 'AND' : 'VOTING'), kids, { votingK: 2 });
        };
        const root = G('OR', [G('NOT', [build(2)]), build(2)]);
        const want = truthPrimes(ev.map(e => e.displayId), m => evalTree(root, m, idx));
        let got;
        try { got = WK.SLFTAEngine.getCutsets(root).map(cs => cs.map(e => e.displayId).sort().join(' & ')).sort(); } catch (e) { got = ['ERR ' + e.message]; }
        tried++;
        if (JSON.stringify(got) === JSON.stringify(want)) agree++; else if (diffs.length < 2) diffs.push(JSON.stringify({ got, want }));
    }
    check('[4a] prime implicants of 40 random non-coherent trees match truth-table enumeration', agree === tried, agree + '/' + tried + ' ' + diffs.join(' | '));
    const a = P('A', 0.1), b = P('B', 0.2), c = P('C', 0.3);
    const f = G('OR', [G('AND', [a, b]), G('AND', [G('NOT', [copy(a)]), c])]);
    const got = WK.SLFTAEngine.getCutsets(f).map(cs => cs.map(e => e.displayId).sort().join(' & ')).sort();
    check('[4b] AB + (NOT A)C has the consensus prime BC (three primes)', JSON.stringify(got) === JSON.stringify(['A & B', 'B & C', 'C & NOT A']), JSON.stringify(got));
    const pi = WK.SLFTAEngine.getCutsets(f).find(cs => cs.some(e => e._negated));
    const neg = pi.find(e => e._negated);
    check('[4c] a "NOT X" member carries 1 - p and travels as a synthetic member', rel(neg.probability, 0.9) < 1e-12 && neg._synthetic === 'not' && /does not occur/.test(neg.name), JSON.stringify(neg));
    const enc = WK.SLFTAEngine.enumerateForWorker(f);
    check('[4d] the worker encodes NOT members whole (syn), real members by id', enc.some(e => e.syn && e.syn[0]._negated && e.ids.length === 1), JSON.stringify(enc));
    check('[4e] page bddMinimalCutsets gives the same primes', JSON.stringify(PG.bddMinimalCutsets(f).map(cs => cs.map(e => e.displayId).sort().join(' & ')).sort()) === JSON.stringify(got));
    // coherent tree unchanged: classic enumerator result as before (no NOT routing)
    const co = G('OR', [G('AND', [P('E', 0.1), P('F', 0.1)]), P('H', 0.1)]);
    check('[4f] a coherent tree is not routed to prime implicants', !WK.SLFTAEngine.treeHasNot(co) && JSON.stringify(WK.SLFTAEngine.getCutsets(co).map(cs => cs.map(e => e.displayId).join('&'))) === JSON.stringify(['E&F', 'H']));
    // budget: parity of 12 events has 2^11 = 2048 primes -> refused in plain words
    const ev = []; for (let i = 0; i < 12; i++) ev.push(P('V' + i, 0.1));
    const xor2 = (x, y) => G('OR', [G('AND', [x, G('NOT', [JSON.parse(JSON.stringify(y))])]), G('AND', [G('NOT', [JSON.parse(JSON.stringify(x))]), y])]);
    let par = ev[0]; for (let i = 1; i < ev.length; i++) par = xor2(par, ev[i]);
    (function renum(n) { n.id = nid++; (n.children || []).forEach(renum); })(par);
    let err = null; const t0 = Date.now();
    try { WK.SLFTAEngine.getCutsets(par); } catch (e) { err = e; }
    check('[4g] more than 2,000 prime implicants: refused (NonCoherentCutsetError), plain words, no em dash, fast', err && err.name === 'NonCoherentCutsetError' && /not shown rather than shown incomplete/.test(err.message) && !/—/.test(err.message) && Date.now() - t0 < 20000, err ? err.name + ': ' + err.message : 'no error');
    check('[4h] P(top) of that tree is still exact (parity of 12 events, p = 0.1)', rel(PG.computeExactProbability(par).prob, (1 - Math.pow(0.8, 12)) / 2) < 1e-9, PG.computeExactProbability(par).prob);
}
// ============================================================================ [5] engine / page copies identical
{
    function fnText(src, name) {
        const i = src.indexOf('function ' + name + '(');
        if (i < 0) return null;
        let d = 0, j = src.indexOf('{', i);
        for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
        return null;
    }
    const norm = t => t.split('\n').map(l => l.replace(/\s*\/\/.*$/, '').trimEnd()).filter(l => l.trim() !== '').join('\n');
    for (const name of ['_seqExactProb', '_treeHasNot', '_primeBudgetError', '_notLiteralNode', '_bddPrimeImplicants', '_primeImplicantCutsets', 'bddMinimalCutsets', 'buildBDDFromFT']) {
        const a = fnText(QM, name), b = fnText(ENG, name);
        check('[5a] ' + name + ' is identical in fta_quant_modules.js and fta_engine.js', a && b && norm(a) === norm(b), a && b ? 'texts differ' : 'missing');
    }
    const t = G('OR', [G('SEQ', [L('A', 1e-3), L('B', 1e-3)]), G('AND', [P('C', 0.01), G('NOT', [P('D', 0.2)])])]);
    check('[5b] page and worker give the same P(top) for a tree with SEQ and NOT', PG.computeExactProbability(JSON.parse(JSON.stringify(t))).prob === WK.SLFTAEngine.computeExactProbability(JSON.parse(JSON.stringify(t))).prob);
}
// ============================================================================ [6] mutation proofs
{
    const revertSeq = s => s.replace("if (node.gateType === 'PAND' || node.gateType === 'SPARE' || node.gateType === 'SEQ') return dynGate(node, kids, kidBdds);",
        "if (node.gateType === 'PAND' || node.gateType === 'SPARE') return dynGate(node, kids, kidBdds);");
    const M = pageContext({ 'fta_engine.js': revertSeq(ENG), 'fta_quant_modules.js': revertSeq(QM) });
    const ls = [2e-4, 5e-4], t = 1000;
    const p = M.computeExactProbability(G('SEQ', [L('A', ls[0], t), L('B', ls[1], t)])).prob;
    check('[6a] MUTATION: SEQ not routed to the dynamic solver -> [1a] goes red', rel(p, hypoCdf(ls, t)) > 0.01, p);
    const revertNot = s => s.replace("        if (node && _treeHasNot(node)) return _primeImplicantCutsets(node);\n", '');
    const W2 = workerContext(revertNot(ENG));
    const a = P('A', 0.1), b = P('B', 0.2), c = P('C', 0.3);
    const f = G('OR', [G('AND', [a, b]), G('AND', [G('NOT', [copy(a)]), c])]);
    let got; try { got = W2.SLFTAEngine.getCutsets(f).map(cs => cs.map(e => e.displayId).sort().join(' & ')).sort(); } catch (e) { got = ['ERR']; }
    check('[6b] MUTATION: NOT trees not routed to prime implicants -> [4b] goes red', JSON.stringify(got) !== JSON.stringify(['A & B', 'B & C', 'C & NOT A']), JSON.stringify(got));
    check('[6c] the mutations actually applied', revertSeq(ENG) !== ENG && revertSeq(QM) !== QM && revertNot(ENG) !== ENG);
}
// ============================================================================ [7] the canvas edit module (SLFtaEdit)
function editContext() {
    const log = [], toasts = [], events = [];
    const listeners = {};
    const c = {
        console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date, Float32Array, Error, TypeError,
        setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0, getComputedStyle: () => ({ position: 'relative' }),
        localStorage: { getItem: () => null, setItem() {} },
        CustomEvent: function (type, o) { this.type = type; this.detail = o && o.detail; },
        document: {
            readyState: 'complete', head: { appendChild() {} }, body: { classList: { contains: () => false }, appendChild() {} },
            addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); }, dispatchEvent(e) { events.push(e.detail); },
            getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {} })
        },
        showToast: (m) => { toasts.push(m); },
        pushUndo: (l) => log.push('undo:' + l), calculateAllProbabilities: () => log.push('calc'), updateD3: () => log.push('render'), scheduleAutosave: () => log.push('save'),
        _markStructureChangeObsolete: () => log.push('stale'),
        lambdaFromInputMode: (mode, v) => { log.push('lfim:' + mode); return mode === 'mtbf' ? 1 / v : (mode === 'probability' ? -Math.log1p(-v) : v); },
        propagateRepeatedEventEdit: (n) => log.push('propagate:' + n.displayId),
        selectNode() {}, openNodePropertiesModal() {}, generateDisplayId: (t) => (t === 'gate' ? 'G-' : 'BE-') + (nid++),
        SLWrap: { preserve(a, b) { Object.keys(a).forEach(k => { if (/Wrapped$/.test(k)) b[k] = a[k]; }); } }
    };
    c.window = c; c.globalThis = c;
    vm.createContext(c);
    vm.runInContext('var ftaPages = []; var activeFTAPageId = "p1"; var selectedNodeData = null; var projectConfig = {}; var ftaConfig = { mode: "bottom-up", exposureTime: 1 }; var internalIdCounter = 9000; var itemsData = []; var systemsData = []; var g = null; var svg = null; var zoom = null;' +
        'function addSelectedGate() { log_push("legacy:addSelectedGate"); } function deleteSelectedNode() { log_push("legacy:delete"); }', Object.assign(c, { log_push: x => log.push(x) }));
    vm.runInContext(read('fta_canvas_edit.js'), c, { filename: 'fta_canvas_edit.js' });
    return { c, log, toasts, events };
}
{
    const { c, log, toasts, events } = editContext();
    const E = c.SLFtaEdit;
    const b1 = P('B1', 0.1), b2 = P('B2', 0.1), g1 = G('AND', [b1, b2]), xf = G('TRANSFER', [], { linkedPageId: 'p2' }), notg = G('NOT', [P('N1', 0.1)]);
    const root = G('OR', [g1, xf, notg]);
    const free = P('F1', 0.1);
    c.ftaPages.push({ id: 'p1', name: 'one', root, unattached: [free] });
    // the change path order
    const order = [];
    E.onBeforeChange(i => { order.push('before:' + i.kind); });
    E.onChange(i => { order.push('after:' + i.kind + ':' + log.join(',')); });
    log.length = 0;
    const r = E.connect(free, g1);
    check('[7a] connect: the unattached node becomes an input of the gate and leaves the unattached list', r.ok && g1.children.indexOf(free) === 2 && c.ftaPages[0].unattached.length === 0);
    check('[7a] one path: before-listener, undo snapshot, change, staleness flag, recalculation, redraw, autosave, then change listeners and the sl:fta-change event',
        order[0] === 'before:connect' && order[1] === 'after:connect:undo:Connect F1 under ' + g1.displayId + ',stale,calc,render,save' && events.length === 1 && events[0].kind === 'connect', JSON.stringify(order));
    // veto
    E.onBeforeChange(i => (i.kind === 'disconnect' ? false : undefined));
    log.length = 0;
    const v = E.disconnect(b1);
    check('[7b] a before-change listener can cancel: nothing changes, no undo snapshot', v.vetoed && g1.children.indexOf(b1) === 0 && log.length === 0, JSON.stringify(v) + ' ' + log.join(','));
    // refusals in plain words
    const msgs = [];
    const refuse = (what, node, target, re) => { log.length = 0; const before = JSON.stringify(root); const rr = E.connect(node, target); const m = toasts[toasts.length - 1] || ''; msgs.push(m); check('[7c] refused: ' + what, !rr.ok && JSON.stringify(root) === before && re.test(m) && log.length === 0, m); };
    refuse('onto a basic event', b2, b1, /basic event\. Only a gate can take inputs/);
    refuse('onto a transfer gate', b2, xf, /transfer gate/);
    refuse('a loop (gate under its own input branch)', g1, g1, /loop/);
    refuse('moving the top event', root, g1, /top event cannot be moved/);
    refuse('a second input on a NOT gate', b2, notg, /exactly one input/);
    const sub = G('OR', [P('Z', 0.1)]); g1.children.push(sub);
    refuse('a gate under a gate inside its own branch', g1, sub, /loop/);
    g1.children.pop();
    check('[7c] refusal messages carry no em dash', msgs.every(m => !/—/.test(m)), msgs.join(' | '));
    // re-parent and disconnect
    const r2 = E.connect(b2, root);
    check('[7d] re-parent: B2 moves from its AND gate to the top gate', r2.ok && root.children.indexOf(b2) >= 0 && g1.children.indexOf(b2) < 0);
    // fresh context without the veto for disconnect
    const X = editContext(); const E2 = X.c.SLFtaEdit;
    const d1 = P('D1', 0.1), dg = G('OR', [d1, P('D2', 0.1)]), droot = G('AND', [dg]);
    X.c.ftaPages.push({ id: 'p1', name: 'one', root: droot });
    d1.xOffset = 40; d1.yOffset = 10;
    const dr = E2.disconnect(d1, 300.4, 120.6);
    const pg1 = X.c.ftaPages[0];
    check('[7e] disconnect: the branch leaves its gate, waits unattached at the drop point, offsets cleared', dr.ok && dg.children.indexOf(d1) < 0 && pg1.unattached[0] === d1 && d1.freeX === 300 && d1.freeY === 121 && d1.xOffset === 0);
    X.toasts.length = 0;
    const dt = E2.disconnect(droot);
    check('[7e] the top event cannot be disconnected (plain message)', !dt.ok && /top event cannot be disconnected/.test(X.toasts[0] || ''), X.toasts[0]);
    // canvas value validation
    const vb = (mode, s) => E2.validateMetric({ inputMode: mode }, s);
    check('[7f] value checks: "abc" refused, negative refused, P above 1 refused, MTBF 0 refused, 1e-5 and 2.5E-4 accepted',
        /not a number/.test(vb('lambda', 'abc').why) && /cannot be negative/.test(vb('lambda', '-1e-5').why) && /above 1/.test(vb('probability', '1.5').why) && /MTBF of 0/.test(vb('mtbf', '0').why) &&
        vb('lambda', '1e-5').value === 1e-5 && vb('probability', '2.5E-4').value === 2.5e-4 && vb('lambda', '3 x 10^-6').value === 3e-6);
    // canvas value goes through the panel's rule
    const ev = { id: 77, displayId: 'BE-77', type: 'basic', inputMode: 'mtbf', inputValue: 1000, lambda: 1e-3, children: [] };
    droot.children.push(ev);
    X.log.length = 0;
    const sm = E2.setMetric(ev, 5000);
    check('[7g] canvas value: inputValue set, λ from lambdaFromInputMode (the panel rule), repeated copies follow, then recalculation',
        sm.ok && ev.inputValue === 5000 && Math.abs(ev.lambda - 2e-4) < 1e-18 && X.log.join(',') === 'undo:Set MTBF of BE-77,lfim:mtbf,propagate:BE-77,calc,render,save', X.log.join(','));
    const lib = { id: 78, displayId: 'BE-78', type: 'basic', inputMode: 'library', children: [] };
    check('[7g] library, Markov and development-error events are not typed on the canvas; gates are computed', !E2.metricEditable(lib) && !E2.metricEditable({ type: 'basic', markovModelId: 'm' }) && !E2.metricEditable({ type: 'basic', eventClass: 'dev-error' }) && !E2.metricEditable({ type: 'gate' }) && E2.metricEditable({ type: 'undeveloped' }));
    // NOT setting
    check('[7h] NOT gates are off by default', E2.nonCoherentAllowed() === false);
    X.toasts.length = 0;
    E2.addFromPalette('NOT', droot);
    check('[7h] adding a NOT while the setting is off is refused (plain message)', /NOT gates are off for this project/.test(X.toasts[0] || ''), X.toasts[0]);
    E2.setNonCoherent(true);
    check('[7h] the project setting turns them on (projectConfig.allowNonCoherent)', X.c.projectConfig.allowNonCoherent === true);
    droot.children.push(G('NOT', [P('NN', 0.1)]));
    X.toasts.length = 0;
    E2.setNonCoherent(false);
    check('[7h] turning it off while a NOT gate exists is refused', X.c.projectConfig.allowNonCoherent === true && /still has 1 NOT gate/.test(X.toasts[0] || ''), X.toasts[0]);
    // model link helpers
    vm.runInContext('itemsData.push({ internalId: 4801, itemId: "LRU-1", name: "Servo" });', X.c);
    check('[7i] the item is found by its item ID or its internal ID; the badge names it', E2.itemFor({ realizedByItemId: 'LRU-1' }).name === 'Servo' && E2.itemFor({ realizedByItemId: 4801 }).name === 'Servo' && E2.badgeFor({ data: { realizedByItemId: 'LRU-1' } }) === '⛓ LRU-1');
    check('[7i] stable model element IDs: per use (ftn-<id>) and per event (fte-<logical id>)', E2.elementIdOf({ id: 12 }) === 'ftn-12' && E2.elementIdOf({ id: 12, elementId: 'X' }) === 'X' && E2.eventDefIdOf({ id: 12, logicalId: 9 }) === 'fte-9');
    // legacy actions pass through the same listeners
    const got = [];
    E2.onChange(i => got.push(i.kind));
    X.c.addSelectedGate();
    check('[7j] the existing add-gate action is wrapped: it runs and the change listeners hear it', X.log.indexOf('legacy:addSelectedGate') >= 0 && got.indexOf('action:addSelectedGate') >= 0 && X.c.addSelectedGate._slFtaEditWrapped === true);
    // deleting a selected unattached node goes through the change path, not deleteNodeRecursive
    const fr = P('FR', 0.1); pg1.unattached.push(fr);
    vm.runInContext('selectedNodeData = ftaPages[0].unattached[ftaPages[0].unattached.length - 1];', X.c);
    X.c.deleteSelectedNode();
    check('[7k] Delete on a selected unattached node removes it from the page', pg1.unattached.indexOf(fr) < 0 && X.log.indexOf('legacy:delete') < 0);
}
// ============================================================================ [8] wiring and data
{
    const html = read('index.html');
    check('[8a] index.html loads fta_canvas_edit.js after fta_view_modules.js', html.indexOf('fta_canvas_edit.js?v=') > html.indexOf('fta_view_modules.js?v='));
    check('[8b] SEQ is offered in both gate type lists; NOT is there but hidden and disabled by default', (html.match(/<option value="SEQ">SEQ/g) || []).length === 2 && (html.match(/class="fta-opt-not-group" hidden><option value="NOT" class="fta-opt-not" disabled>/g) || []).length === 2);
    check('[8c] the project setting, the Disconnect button, the Overview button and the Linked model element panel exist', /id="proj-allow-not"/.test(html) && /id="btn-disconnect"/.test(html) && /id="btn-fta-overview"/.test(html) && /id="config-model-item"/.test(html) && /id="config-model-sysml"/.test(html));
    const csv = read('data_ops_modules.js');
    check('[8d] the CSV import reads PAND, SPARE, SEQ, FDEP and NOT back as gates', /new Set\(\['AND','OR','XOR','VOTING','INHIBIT','TRANSFER','PAND','SPARE','SEQ','FDEP','NOT'\]\)/.test(csv));
    const ai = read('ai_assistant.js');
    check('[8e] AI proposals accept SEQ; NOT only when the project allows it', /'SEQ', 'FDEP', 'TRANSFER'\];/.test(ai) && /allowNonCoherent === true\) base\.push\('NOT'\)/.test(ai));
    const sl = read('safety_lab.js');
    check('[8f] Change Type knows SEQ and refuses NOT unless allowed or with more than one input', /'SEQ','FDEP','NOT'\]\.includes\(val\)/.test(sl) && /A NOT gate takes exactly one input/.test(sl));
    const view = read('fta_view_modules.js');
    check('[8g] updateD3 calls the drag, handle, value and after-render hooks', /_FE\.dragMove\(event, d\)/.test(view) && /_FE\.handleDrag\(\)/.test(view) && /_FE\.metricCommit\(this, d\)/.test(view) && /_FE\.afterRender\(root, _allDesc, isDark\)/.test(view));
    // the static cross-check reads NOT and skips dynamic gates instead of calling them OR
    const mc = { console, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, Date, Error };
    mc.window = mc; mc.globalThis = mc;
    vm.createContext(mc);
    vm.runInContext(read('fta_engine.js'), mc);
    vm.runInContext('var computeExactProbability = SLFTAEngine.computeExactProbability;', mc);
    vm.runInContext(read('mc_crosscheck.js'), mc);
    const nt = G('AND', [P('A', 0.3), G('NOT', [P('B', 0.4)])]);
    const r1 = mc.SLDissimilar.crossCheck(nt, { seed: 5, samples: 100000 });
    const r2 = mc.SLDissimilar.crossCheck(G('SEQ', [P('A', 0.3), P('B', 0.4)]), { seed: 5, samples: 10000 });
    check('[8h] dissimilar check: NOT tree agrees; a SEQ tree is skipped with the reason', r1.verdict === 'agree' && r2.verdict === 'skipped' && /dynamic gate/.test(r2.note), r1.verdict + ' / ' + r2.verdict + ' ' + r2.note);
    // persistence: the live sync keeps page.unattached in the page shell
    const cr = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, Date, Error, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        location: { search: '', hostname: 'x' }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {}, addEventListener() {},
        document: { addEventListener() {}, readyState: 'complete', getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} } } };
    cr.window = cr; cr.globalThis = cr; cr.self = cr;
    vm.createContext(cr);
    let ok = false, detail = '';
    try {
        vm.runInContext(read('crdt_sync.js'), cr, { filename: 'crdt_sync.js' });
        const F = cr.SafetyLabCRDT._fta;
        const page = { id: 'p', name: 'n', root: { id: 1, type: 'gate', gateType: 'OR', children: [{ id: 2, type: 'basic', children: [] }] }, unattached: [{ id: 3, type: 'basic', displayId: 'U', freeX: 10, freeY: 20, children: [] }] };
        const d = F.decompose([page]);
        const back = F.recompose(JSON.parse(JSON.stringify(d.shells)), JSON.parse(JSON.stringify(d.nodes)));
        ok = back[0].unattached && back[0].unattached[0].displayId === 'U' && back[0].unattached[0].freeX === 10 && back[0].root.children[0].id === 2;
        detail = JSON.stringify(back[0]);
    } catch (e) { detail = e.message; }
    check('[8i] live sync: an unattached node rides the page shell through decompose / recompose', ok, detail);
}

// [9] 13 Oct night (Waqas ruling 2): fault tree Undo / Redo are not asked per press. The app's undo
// restores run as COLLECTED changes (change_ack.js deferred), acknowledged together on leaving the
// view. Behavior is driven in a real browser in regression_change_ack_ui_20261013b (B8: a fault tree
// node rename undone, no dialog per undo, one list on leaving, Cancel restores only them).
{
    const H = read('helpers_modules.js');
    const body = H.slice(H.indexOf('function _restoreSnap('), H.indexOf('function _slUndoDepth'));
    check('[9a] undo / redo restores go through SLChangeAck.deferred with their label', /_ack\.deferred\(\{ kind: \/\^Redo\/\.test\(undoLabel\) \? 'redo' : 'undo'/.test(body));
    check('[9b] undo() and redo() pass "Undo: " / "Redo: " labels', /_restoreSnap\(prev\.snap, current, 'Undo: ' \+ prev\.label\)/.test(H) && /_restoreSnap\(next\.snap, current, 'Redo: ' \+ next\.label\)/.test(H));
    const A = read('change_ack.js');
    // 24 Oct 2026 (change_ack.js v3.0, the quiet bar): leaving a fault tree or a tab asks nothing; the changes wait in
    // the bar until the person reviews them, saves or closes
    check('[9c] leaving a fault tree (openFTAPageById) or a tab asks nothing: no leave table, the quiet bar instead', !/var LEAVE = \{/.test(A) && !/openFTAPageById: \{ action:/.test(A) && /function _bar\(\)/.test(A));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

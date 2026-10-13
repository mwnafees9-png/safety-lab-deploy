#!/usr/bin/env node
/*
 * Regression: dynamic gates in the STATIC P(top) (13 Oct 2026, math audit F4).
 *
 * FOUND (math audit F4, reproduced with math/t6_dynamic.js):
 *   - FDEP counted 0. OR(AND(A,B), FDEP(PS -> A,B)) with q = 1e-3 gave 9.99e-7
 *     against the exact 1.0005e-3 (1000x low). The trigger's failure never forced
 *     the dependents, so the power supply's single point failure was missing from
 *     the number the ledger, critical gates and requirement checks read.
 *   - SPARE with a switch success below 1 was a plain AND (switch failure ignored):
 *     switchP 0.99, lambda 1e-4/h, T 1 h gave 1.0e-8 against the exact 1.0049e-6
 *     (100x low), while the canvas line called the AND "a conservative bound".
 *   - PAND = AND (conservative, but not said truthfully either).
 * FIX:
 *   - FDEP: standard static reduction, each dependent becomes OR(dependent, trigger)
 *     inside the BDD (and in the gate-by-gate calcBottomUp, which takes the BDD value
 *     for any gate holding a forced event). Exact for the static gates.
 *   - SPARE / PAND: when every input is a constant-rate basic event used nowhere else,
 *     the gate is an independent module and is solved exactly as a Markov chain
 *     (cold/warm standby, switch success per demand, strict order for PAND); the
 *     BDD keeps the structural bound and ANDs a time-order factor (exact / bound).
 *     Otherwise the bound stands: PAND = AND, SPARE = primary AND (switch fails OR
 *     (spare AND ...)), the switchover failure being a visible cut-set event. The
 *     canvas line says which, truthfully. The DFT Monte Carlo now also handles gate
 *     triggers, gate dependents and chained FDEPs.
 * EXECUTED: the REAL fta_engine.js + fta_quant_modules.js + engine_modules.js (page
 * context) and fta_engine.js alone (worker context), compared against INDEPENDENT
 * answers: brute-force enumeration with FDEP semantics written here, closed forms
 * for standby systems (the same anchors regression_dft_warm uses), numerical
 * integration of the spare/priority-AND densities written here, and the app's own
 * seeded DFT Monte Carlo within 4 sigma. Mutation proofs: the same checks run on a
 * copy of the engine with the fix textually reverted and must go red.
 * 13 Oct 2026 (fix G): the SPARE mutation proof reverts the dispatch line as it now reads (it also routes SEQ).
 * Run: node tests/regression_dynamic_static_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

function pageContext(overrides) {
    overrides = overrides || {};
    const p = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date,
        Int32Array, Float64Array, Uint32Array, Uint8Array, Promise, Error, RangeError, TypeError, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        performance: { now: () => Date.now() }, document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) },
        localStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: { userAgent: 'node' },
        SEVERITY_RANK: { Minor: 1, Major: 2, Hazardous: 4, Catastrophic: 5 }, projectConfig: {}, acFhaData: [], systemsData: [], invRegister() {} };
    p.window = p; p.globalThis = p; p.self = p;
    vm.createContext(p);
    for (const f of ['fta_engine.js', 'fta_quant_modules.js', 'engine_modules.js']) vm.runInContext(overrides[f] || read(f), p, { filename: f });
    vm.runInContext('var ftaPages = []; var ftaConfig = { exposureTime: 1, mode: "bottom-up", linkedFhaId: "" }; var activeFTAPageId = null;', p);
    return p;
}
function workerContext() {
    const w = { console, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, Date, Int32Array, Float64Array, Uint32Array, Uint8Array, Error, RangeError, TypeError };
    w.self = w; w.globalThis = w;
    vm.createContext(w);
    vm.runInContext(read('fta_engine.js'), w, { filename: 'fta_engine.js(worker)' });
    return w;
}

let nid = 1;
// Leaf with a constant rate: probability baked as the app bakes it, 1 - e^(-lambda T).
const L = (lid, lam, T, extra) => Object.assign({ id: nid++, logicalId: lid, displayId: lid, name: lid, type: 'basic', lambda: lam, probability: -Math.expm1(-lam * T), children: [] }, extra || {});
const Pq = (lid, q, extra) => Object.assign({ id: nid++, logicalId: lid, displayId: lid, name: lid, type: 'basic', probability: q, children: [] }, extra || {});
const G = (t, kids, extra) => Object.assign({ id: nid++, displayId: 'G' + nid, type: 'gate', gateType: t, children: kids }, extra || {});
const copy = n => Object.assign({}, n, { id: nid++ });   // a second node for the same event (same logicalId, own id), as the app makes them

// ---- INDEPENDENT reference: brute-force enumeration with FDEP semantics ----------------------
// State of each logicalId drawn independently; a dependent counts as failed when it failed or any
// of its triggers (evaluated in the same state, recursively, cycle-safe) failed. FDEP outputs false.
function refEval(root) {
    const leaves = new Map(), fdeps = [];
    (function walk(n) { if (!n) return; if (n.type !== 'gate') { if (!leaves.has(n.logicalId)) leaves.set(n.logicalId, n.probability); return; } if (n.gateType === 'FDEP') fdeps.push(n); (n.children || []).forEach(walk); })(root);
    const ids = [...leaves.keys()];
    function failed(n, st, stack) {
        if (n.type !== 'gate') {
            let v = st[n.logicalId];
            fdeps.forEach(f => { if (f.children.slice(1).some(d => d.type !== 'gate' && d.logicalId === n.logicalId) && !stack.has(f.id)) { const s2 = new Set(stack); s2.add(f.id); v = v || failed(f.children[0], st, s2); } });
            return v;
        }
        let v;
        const k = n.children.map(c => failed(c, st, stack));
        switch (n.gateType) {
            case 'AND': case 'INHIBIT': case 'PAND': case 'SPARE': v = k.every(Boolean); break;
            case 'OR': v = k.some(Boolean); break;
            case 'VOTING': v = k.filter(Boolean).length >= (n.votingK || 2); break;
            case 'XOR': v = k.filter(Boolean).length === 1; break;
            default: v = false;
        }
        fdeps.forEach(f => { if (f.children.slice(1).some(d => d.type === 'gate' && d.id === n.id) && !stack.has(f.id)) { const s2 = new Set(stack); s2.add(f.id); v = v || failed(f.children[0], st, s2); } });
        return v;
    }
    let P = 0;
    for (let m = 0; m < (1 << ids.length); m++) {
        const st = {}; let w = 1;
        ids.forEach((id, i) => { const on = !!((m >> i) & 1); st[id] = on; w *= on ? leaves.get(id) : 1 - leaves.get(id); });
        if (failed(root, st, new Set())) P += w;
    }
    return P;
}
// ---- INDEPENDENT closed forms and numerical integrals --------------------------------------------
// 2-unit standby, equal rates, dormancy a, switch p (R from the standby literature, as in regression_dft_warm):
const standby2 = (x, a, p) => a > 0 ? 1 - Math.exp(-x) * (1 + (p / a) * (1 - Math.exp(-a * x))) : 1 - Math.exp(-x) * (1 + p * x);
// Unequal rates, one spare, warm k, switch p, by direct numerical integration of the primary's
// failure density (composite Simpson, n panels):
function spare1Integral(la, ls, k, p, T, n) {
    n = n || 20000; const h = T / n; let s = 0;
    for (let i = 0; i <= n; i++) {
        const t = i * h, f = la * Math.exp(-la * t);
        const dead = 1 - Math.exp(-k * ls * t), alive = Math.exp(-k * ls * t);
        const g = f * (dead + alive * ((1 - p) + p * (1 - Math.exp(-ls * (T - t)))));
        s += g * (i === 0 || i === n ? 1 : (i % 2 ? 4 : 2));
    }
    return s * h / 3;
}
// PAND(A,B) closed form: P(A < B <= T).
const pand2 = (la, lb, T) => la / (la + lb) * (1 - Math.exp(-(la + lb) * T)) - Math.exp(-lb * T) * (1 - Math.exp(-la * T));
// 3-unit cold standby with perfect switches, unequal rates, by nested numerical integration.
function cold3(l0, l1, l2, T, n) {
    n = n || 1500; const h = T / n; let s = 0;
    for (let i = 0; i < n; i++) { const t0 = (i + 0.5) * h; const f0 = l0 * Math.exp(-l0 * t0);
        for (let j = 0; j < n; j++) { const t1 = (j + 0.5) * h; if (t0 + t1 > T) break; s += f0 * l1 * Math.exp(-l1 * t1) * (1 - Math.exp(-l2 * (T - t0 - t1))) * h * h; } }
    return s;
}

const P = pageContext(), Wk = workerContext();
const run = s => vm.runInContext(s, P);
const exact = (root, scope) => P.computeExactProbability(root, scope).prob;
const setT = T => run('ftaConfig.exposureTime = ' + T + ';');

// ===================================================================================== [1] FDEP
{
    setT(1);
    const q = -Math.expm1(-1e-3);
    const PS = L('PS', 1e-3, 1), A = L('A', 1e-3, 1), B = L('B', 1e-3, 1);
    const root = G('OR', [G('AND', [A, B]), G('FDEP', [copy(PS), copy(A), copy(B)])]);
    const ref = q + (1 - q) * q * q;
    check('[1a] audit case OR(AND(A,B), FDEP(PS->A,B)): BDD = PS + (1-PS)AB exactly', rel(exact(root), ref) < 1e-12, exact(root) + ' vs ' + ref);
    check('[1a] same against brute-force enumeration written here', rel(exact(root), refEval(root)) < 1e-12);
    check('[1a] cached P(top) (exactTopProbability) agrees', rel(P.exactTopProbability(root), ref) < 1e-12);
    P.__r = root; run('calcBottomUp(__r, new Set())');
    check('[1a] gate-by-gate calcBottomUp root (headline when no BDD override runs) = exact', rel(root.probability, ref) < 1e-9, String(root.probability));
    const W = Wk.SLFTAEngine.treeFactsForWorker(root, []);
    check('[1a] worker engine (fta_engine.js alone) gives the same P(top)', rel(W.ptop, ref) < 1e-12, String(W.ptop));
    const mcs = P.bddMinimalCutsets(root).map(cs => cs.map(n => n.logicalId).sort().join('+')).sort();
    check('[1b] BDD minimal cut sets now show the trigger as a single failure {PS}', JSON.stringify(mcs) === JSON.stringify(['A+B', 'PS']), JSON.stringify(mcs));
    const cl = P.SLFTAEngine.minimalCutsets(P.getCutsets(root)).map(cs => cs.map(n => n.logicalId).sort().join('+')).sort();
    check('[1b] classic enumerator (getCutsets) agrees: {A,B} and {PS}', JSON.stringify(cl) === JSON.stringify(['A+B', 'PS']), JSON.stringify(cl));
    check('[1b] worker single-failure facts name PS', (W.singles || []).some(s => s.lid === 'PS'));
    const mc = P.simulateDFT(root, 1, 400000, 7);
    check('[1c] DFT Monte Carlo agrees with the static number within 4 sigma', Math.abs(mc.p - ref) <= 4 * mc.stderr, mc.p + ' +- ' + mc.stderr);
    // A sub-gate evaluated alone does not see the FDEP; with the tree as scope it does.
    const andG = root.children[0];
    check('[1d] sub-gate AND(A,B) with the whole tree in scope = P(A or PS)P(B or PS) state-exact', rel(exact(andG, root), q + (1 - q) * q * q) < 1e-12);
}
{   // gate trigger, gate dependent, chained FDEPs, VOTING and XOR around them, against brute force
    const a = Pq('a', 0.02), b = Pq('b', 0.03), c = Pq('c', 0.05), p1 = Pq('p1', 0.01), p2 = Pq('p2', 0.004), bus = Pq('bus', 0.002);
    const sub = G('AND', [b, c]);
    const root = G('OR', [
        G('VOTING', [a, b, c], { votingK: 2 }),
        sub,
        G('FDEP', [G('OR', [copy(p1), copy(p2)]), copy(a)]),      // gate trigger
        G('FDEP', [copy(bus), copy(p1)]),                           // chain: bus forces p1, p1 is inside a trigger
        G('FDEP', [Pq('h', 0.007), sub])                            // gate dependent
    ]);
    const r = refEval(root);
    check('[1e] gate trigger + chained FDEP + gate dependent: BDD = brute force', rel(exact(root), r) < 1e-12, exact(root) + ' vs ' + r);
    P.__r = root; run('calcBottomUp(__r, new Set())');
    check('[1e] calcBottomUp root = brute force', rel(root.probability, r) < 1e-9, String(root.probability));
    const W = Wk.SLFTAEngine.treeFactsForWorker(root, []);
    check('[1e] worker = page', W.ptop === exact(root));
}
{   // fuzz: random static trees with FDEPs vs brute force
    let seed = 20261013; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let bad = 0, worst = 0, n = 0;
    for (let trial = 0; trial < 150; trial++) {
        const ids = ['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6'];
        const pr = {}; ids.forEach(i => { pr[i] = 0.001 + rnd() * 0.3; });
        const leaf = () => { const i = ids[Math.floor(rnd() * ids.length)]; return Pq(i, pr[i]); };
        const mk = d => {
            if (d === 0 || rnd() < 0.3) return leaf();
            const t = ['AND', 'OR', 'OR', 'VOTING', 'XOR'][Math.floor(rnd() * 5)];
            const k = 2 + Math.floor(rnd() * 2), kids = []; for (let i = 0; i < k; i++) kids.push(mk(d - 1));
            return G(t, kids, t === 'VOTING' ? { votingK: 2 } : {});
        };
        const main = mk(3);
        const fd = [];
        const nf = 1 + Math.floor(rnd() * 2);
        for (let f = 0; f < nf; f++) { const kids = [leaf()]; const nd = 1 + Math.floor(rnd() * 2); for (let i = 0; i < nd; i++) kids.push(leaf()); fd.push(G('FDEP', kids)); }
        const root = G('OR', [main].concat(fd));
        const r = refEval(root), e = exact(root);
        const err = rel(e, r); n++;
        if (r > 0 && err > 1e-10) bad++;
        worst = Math.max(worst, r > 0 ? err : 0);
    }
    check('[1f] 150 random trees (AND/OR/VOTING/XOR, repeats, 1-2 FDEPs): BDD = brute force', bad === 0, bad + ' bad, worst ' + worst);
}

// ==================================================================================== [2] SPARE
const spareCase = (name, kids, extra, ref, tol) => {
    const g = G('SPARE', kids, extra);
    const e = exact(g);
    check(name, rel(e, ref) < (tol || 1e-9), e.toExponential(10) + ' vs ' + ref.toExponential(10));
    return g;
};
{
    setT(1);
    // The audit case: switchP 0.99, lambda 1e-4/h, T 1 h, cold.
    const x = 1e-4;
    spareCase('[2a] audit case cold, switchP 0.99, lambda 1e-4, T 1 h = 1 - e^-x(1 + p x) (was 1.0e-8, 100x low)',
        [L('A', 1e-4, 1), L('S', 1e-4, 1)], { spareSwitchP: 0.99 }, standby2(x, 0, 0.99), 1e-9);
    const T = 1000; setT(T);
    for (const [a, p] of [[0, 1], [0, 0.9], [0.3, 1], [0.3, 0.8], [1, 1], [1, 0.5]]) {
        spareCase('[2b] 2-unit standby lambda 1e-3, T 1000 h, dormancy ' + a + ', switch ' + p + ' = closed form',
            [L('A', 1e-3, T), L('S', 1e-3, T)], { spareWarmK: a, spareSwitchP: p }, standby2(1, a, p), 1e-9);
    }
    for (const [la, ls, k, p] of [[2e-4, 7e-4, 0, 0.95], [5e-4, 1e-4, 0.4, 0.7], [1e-3, 3e-3, 0.1, 1]]) {
        spareCase('[2c] unequal rates ' + la + '/' + ls + ', dormancy ' + k + ', switch ' + p + ' = numerical integral (written here)',
            [L('A', la, T), L('S', ls, T)], { spareWarmK: k, spareSwitchP: p }, spare1Integral(la, ls, k, p, T), 1e-7);
    }
    spareCase('[2d] 3-unit cold standby, perfect switch, equal rates = 1 - e^-x(1 + x + x^2/2)',
        [L('A', 1e-3, T), L('S1', 1e-3, T), L('S2', 1e-3, T)], {}, 1 - Math.exp(-1) * (1 + 1 + 0.5), 1e-9);
    spareCase('[2d] 3-unit cold standby, unequal rates = nested numerical integral (written here)',
        [L('A', 4e-4, T), L('S1', 9e-4, T), L('S2', 2e-3, T)], {}, cold3(4e-4, 9e-4, 2e-3, T), 2e-5);
    // Imperfect switch on two demands, cold, equal rates: P = 1 - e^-x[1 + p x + p^2 x^2/2].
    spareCase('[2d] 3-unit cold standby, switch 0.9 on each demand = 1 - e^-x(1 + p x + p^2 x^2 / 2)',
        [L('A', 1e-3, T), L('S1', 1e-3, T), L('S2', 1e-3, T)], { spareSwitchP: 0.9 }, 1 - Math.exp(-1) * (1 + 0.9 + 0.81 / 2), 1e-9);
    // Tiny probabilities keep full relative precision (no cancellation).
    setT(1);
    // Reference by the series of 1 - e^-x(1 + x) = sum_{n>=2} (-1)^n (n-1) x^n / n! (no cancellation).
    const ser = x => { let s = 0, t = 1; for (let n = 1; n < 12; n++) { t *= x / n; if (n >= 2) s += (n % 2 ? -1 : 1) * (n - 1) * t; } return s; };
    spareCase('[2e] cert magnitude: cold, perfect switch, lambda 1e-6, T 1 h = series x^2/2 - x^3/3 + ... to 1e-9 relative',
        [L('A', 1e-6, 1), L('S', 1e-6, 1)], {}, ser(1e-6), 1e-9);
    // Agreement with the app's own seeded DFT Monte Carlo (independent sampling engine).
    setT(T);
    for (const extra of [{ spareSwitchP: 0.9 }, { spareWarmK: 0.5, spareSwitchP: 0.8 }]) {
        const g = G('SPARE', [L('A', 1e-3, T), L('S', 1.5e-3, T)], extra);
        const mc = P.simulateDFT(g, T, 200000, 11), e = exact(g);
        check('[2f] DFT Monte Carlo within 4 sigma of the exact static number ' + JSON.stringify(extra), Math.abs(mc.p - e) <= 4 * mc.stderr, mc.p + ' +- ' + mc.stderr + ' vs ' + e);
    }
    // Inside a larger tree (OR with another event), still exact: P = 1 - (1-Pspare)(1-Pc).
    const g = G('SPARE', [L('A', 1e-3, T), L('S', 1e-3, T)], { spareSwitchP: 0.9 });
    const c = L('C', 2e-4, T);
    const root = G('OR', [g, c]);
    const ref = 1 - (1 - standby2(1, 0, 0.9)) * (1 - c.probability);
    check('[2g] spare module inside OR(spare, C) stays exact', rel(exact(root), ref) < 1e-9);
    P.__r = root; run('calcBottomUp(__r, new Set())');
    check('[2g] calcBottomUp gives the same exact value', rel(root.probability, ref) < 1e-9, String(root.probability));
    check('[2g] calcBottomUp records the gate as solved exactly', g._dynStatic && g._dynStatic.mode === 'exact');
    const W = Wk.SLFTAEngine.treeFactsForWorker(root, []);
    check('[2g] worker = page', W.ptop === exact(root));
    // Cut sets: the switchover failure is a visible event, the time-order factor is not.
    const mcs = P.bddMinimalCutsets(root).map(cs => cs.map(n => n._synthetic ? 'SW' : n.logicalId).sort().join('+')).sort();
    check('[2h] BDD cut sets: {A,S}, {A,switchover}, {C}; no time-order factor listed', JSON.stringify(mcs) === JSON.stringify(['A+S', 'A+SW', 'C']), JSON.stringify(mcs));
    const cl = P.SLFTAEngine.minimalCutsets(P.getCutsets(root)).map(cs => cs.map(n => n._synthetic ? 'SW' : n.logicalId).sort().join('+')).sort();
    check('[2h] classic enumerator agrees', JSON.stringify(cl) === JSON.stringify(['A+S', 'A+SW', 'C']), JSON.stringify(cl));
    const enc = Wk.SLFTAEngine.enumerateForWorker(Wk.SLFTAEngine.flattenTransfers(root, []).root);
    check('[2h] worker cut-set encoding carries the switchover member whole (no false single failure)', enc.some(e => e.syn && e.syn.length === 1 && e.ids.length === 1));
    const recon = vm.runInContext('(' + fnSrc('misc_fn_modules.js', '_reconstructCutsets') + ')', P)(enc, Wk.SLFTAEngine.flattenTransfers(root, []).index);
    check('[2h] page reconstruction keeps it: no single-member cut set except {C}', recon.filter(cs => cs.length === 1).map(cs => cs[0].logicalId).join() === 'C');
}
function fnSrc(file, name) {
    const src = read(file); const i = src.indexOf('function ' + name + '(');
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
    return null;
}

// ======================================================================= [3] bound mode (honest)
{
    const T = 1000; setT(T);
    const A = L('A', 1e-3, T), S = L('S', 2e-3, T);
    const g = G('SPARE', [A, S], { spareSwitchP: 0.9 });
    const root = G('OR', [g, G('AND', [copy(S), L('Z', 5e-3, T)])]);   // S also used elsewhere -> not an independent module
    const ex = P.computeExactProbability(root);
    const d = ex.dyn.find(x => x.gateId === g.id);
    check('[3a] a spare whose input is used elsewhere is NOT claimed exact', d && d.mode === 'bound' && /appears elsewhere/.test(d.reason), JSON.stringify(d));
    check('[3a] result says the static number is an upper bound', ex.upperBound === true);
    // Independent upper-bound check: bound >= the true time-ordered value (reference by brute force
    // over the structure primary AND (switch OR spare) is the bound itself; the true value from
    // the numerical integral of the spare plus the other branch by inclusion-exclusion is lower).
    const qA = A.probability, qS = S.probability, qZ = -Math.expm1(-5e-3 * T), qSW = 0.1;
    const boundRef = (function () { let P0 = 0; for (let m = 0; m < 16; m++) { const a = m & 1, s = (m >> 1) & 1, z = (m >> 2) & 1, w = (m >> 3) & 1; const pr = (a ? qA : 1 - qA) * (s ? qS : 1 - qS) * (z ? qZ : 1 - qZ) * (w ? qSW : 1 - qSW); if ((a && (w || s)) || (s && z)) P0 += pr; } return P0; })();
    check('[3b] bound = primary AND (switch fails OR spare), the switch a visible event (brute force)', rel(ex.prob, boundRef) < 1e-12, ex.prob + ' vs ' + boundRef);
    const mc = P.simulateDFT(root, T, 200000, 5);
    check('[3b] and it is not below the time-ordered truth (DFT Monte Carlo, 4 sigma)', ex.prob >= mc.p - 4 * mc.stderr, ex.prob + ' vs MC ' + mc.p);
    P.__r = root; run('calcBottomUp(__r, new Set())');
    check('[3c] calcBottomUp records the gate as an upper bound with the reason', g._dynStatic && g._dynStatic.mode === 'bound' && /appears elsewhere/.test(g._dynStatic.reason));
    const pand = G('PAND', [G('OR', [L('x', 1e-3, T), L('y', 1e-3, T)]), L('w', 1e-3, T)]);
    const pe = P.computeExactProbability(pand);
    check('[3d] PAND over a subsystem gate: AND bound, flagged', pe.dyn[0].mode === 'bound' && /is a gate/.test(pe.dyn[0].reason) && pe.upperBound);
}

// ========================================================================================== [4] PAND
{
    const T = 1000; setT(T);
    const g = G('PAND', [L('A', 1e-3, T), L('B', 2e-3, T)]);
    check('[4a] PAND(A,B) exact = la/(la+lb)(1-e^-(la+lb)T) - e^-lb T (1 - e^-la T)', rel(exact(g), pand2(1e-3, 2e-3, T)) < 1e-9, exact(g) + ' vs ' + pand2(1e-3, 2e-3, T));
    const AND = g.children[0].probability * g.children[1].probability;
    check('[4a] and below the old AND value (the old number was conservative, now exact)', exact(g) < AND);
    const mc = P.simulateDFT(g, T, 200000, 7);
    check('[4b] DFT Monte Carlo within 4 sigma', Math.abs(mc.p - exact(g)) <= 4 * mc.stderr, mc.p + ' vs ' + exact(g));
    // 3-input PAND, equal rates: P(ordered) = P(all fail by T)/3! exactly (exchangeable).
    const g3 = G('PAND', [L('A', 1e-3, T), L('B', 1e-3, T), L('C', 1e-3, T)]);
    check('[4c] 3-input PAND with equal rates = (1-e^-x)^3 / 3!', rel(exact(g3), Math.pow(-Math.expm1(-1), 3) / 6) < 1e-9);
}

// ================================================================ [5] the canvas line tells the truth
{
    const src = read('helpers_modules.js');
    check('[5a] the false "conservative AND bound" text is gone', !/conservative AND bound/.test(src));
    check('[5a] the "FDEP contributes 0" text is gone', !/FDEP contributes 0/.test(src));
    const idx = read('index.html');
    check('[5a] the spare panel no longer says only the Monte Carlo reads dormancy', !/Only the DFT Monte-Carlo reads this/.test(idx));
    const ctx = { ftaConfig: { mode: 'bottom-up' }, getActiveFTARoot: () => null };
    vm.createContext(ctx);
    const f = vm.runInContext('(' + fnSrc('helpers_modules.js', 'formatNodeActualLine') + ')', ctx);
    const line = n => f({ data: n });
    check('[5b] exact spare says "solved exactly"', /solved exactly/.test(line({ type: 'gate', gateType: 'SPARE', _dynStatic: { mode: 'exact' } })));
    check('[5b] bound spare says "upper bound" and names the switch', /upper bound.*switch fails/.test(line({ type: 'gate', gateType: 'SPARE', _dynStatic: { mode: 'bound', reason: 'x' } })));
    check('[5b] PAND bound says "upper bound"', /upper bound/.test(line({ type: 'gate', gateType: 'PAND', _dynStatic: { mode: 'bound', reason: 'x' } })));
    check('[5b] FDEP says the dependents count as failed', /count as failed/.test(line({ type: 'gate', gateType: 'FDEP' })));
}

// ============================================================================ [6] mutation proofs
{
    const eng = read('fta_engine.js'), qm = read('fta_quant_modules.js');
    const revertFdep = s => s.replace(/const trig = fdep\.byLid\.get\(lid\);\n\s*if \(trig\) result = forced\(result, trig, 'l:' \+ lid, visitedPages\);/, '');
    // 13 Oct 2026 (fix G): the dispatch line now also routes SEQ to dynGate; the mutation reverts the same line.
    const revertSpare = s => s.replace("if (node.gateType === 'PAND' || node.gateType === 'SPARE' || node.gateType === 'SEQ') return dynGate(node, kids, kidBdds);",
        "if (node.gateType === 'PAND' || node.gateType === 'SPARE' || node.gateType === 'SEQ') return kidBdds.reduce((acc, k) => BDD.apply('and', acc, k), BDD.T1);");
    const M1 = pageContext({ 'fta_quant_modules.js': revertFdep(qm), 'fta_engine.js': revertFdep(eng) });
    vm.runInContext('ftaConfig.exposureTime = 1;', M1);
    const q = -Math.expm1(-1e-3);
    const PS = L('PS', 1e-3, 1), A = L('A', 1e-3, 1), B = L('B', 1e-3, 1);
    const root = G('OR', [G('AND', [A, B]), G('FDEP', [copy(PS), copy(A), copy(B)])]);
    check('[6a] MUTATION: FDEP forcing removed -> the [1a] check goes red', rel(M1.computeExactProbability(root).prob, q + (1 - q) * q * q) > 0.5);
    const M2 = pageContext({ 'fta_quant_modules.js': revertSpare(qm), 'fta_engine.js': revertSpare(eng) });
    const g = G('SPARE', [L('A', 1e-4, 1), L('S', 1e-4, 1)], { spareSwitchP: 0.99 });
    check('[6b] MUTATION: SPARE back to plain AND -> the [2a] check goes red', rel(M2.computeExactProbability(g).prob, standby2(1e-4, 0, 0.99)) > 0.5);
    check('[6c] the mutations actually applied (texts changed)', revertFdep(qm) !== qm && revertSpare(qm) !== qm && revertFdep(eng) !== eng && revertSpare(eng) !== eng);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

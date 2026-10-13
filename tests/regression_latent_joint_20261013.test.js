#!/usr/bin/env node
/*
 * Regression: periodic latent events sharing an inspection interval are averaged
 * JOINTLY over the shared cycle (13 Oct 2026, math audit F5).
 *
 * FOUND (math audit F5, reproduced with math/t3_exposure.js): a periodically inspected
 * latent event enters at its mean unavailability lambda*tau/2. Two of them under one AND
 * with the SAME interval were multiplied as means, (l1 tau/2)(l2 tau/2) = l1 l2 tau^2/4,
 * but they are found and repaired at the same check, so their unavailabilities rise
 * together and the time average of the product is l1 l2 tau^2/3 (the ARP4761A practice
 * for two latent failures with one interval). Engine/exact was 0.767 for two events and
 * 0.516 for three: NON-conservative. A latent event ANDed with an active per-flight event
 * was already exact (the average of a linear term is its mean) and must stay so.
 * FIX: q_i(t) = lambda_i * t over the cycle for every periodic event (mean lambda*tau/2,
 * unchanged), and the static number is the time average of P(top) over the cycle, computed
 * exactly with Gauss-Legendre points (P(top) is a polynomial in t of degree <= n, so
 * floor(n/2)+1 points are exact) at the BDD level (computeExactProbability, importance,
 * uncertainty, G.12 frequency) and in the gate-by-gate calcBottomUp (each node carries its
 * value at the grid points). Events with different intervals stay independent of each other
 * (unchanged). Allocation budgets (no rate) are untouched.
 * EXECUTED: the REAL fta_engine.js + fta_quant_modules.js + engine_modules.js (page) and
 * fta_engine.js alone (worker), against INDEPENDENT answers: the closed forms
 * prod(lambda_i) tau^n/(n+1), and a brute-force reference written here (enumeration of
 * all event states times a fine midpoint integration over the cycle). Mutation proof: the
 * same checks on a copy of the engine with the joint averaging switched off go red.
 * Run: node tests/regression_latent_joint_20261013.test.js
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
    vm.runInContext('var ftaPages = []; var ftaConfig = { exposureTime: 3, mode: "bottom-up", linkedFhaId: "" }; var activeFTAPageId = null;', p);
    return p;
}
function workerContext() {
    const w = { console, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, Date, Int32Array, Float64Array, Uint32Array, Uint8Array, Error, RangeError, TypeError };
    w.self = w; w.globalThis = w;
    vm.createContext(w);
    vm.runInContext(read('fta_engine.js'), w, { filename: 'fta_engine.js(worker)' });
    return w;
}
const P = pageContext(), Wk = workerContext();
const T = 3;   // flight exposure, hours

let nid = 1;
// Periodic latent event as the app bakes it: P = lambda*tau/2 (effectiveProbFromLambda's periodic model).
const LAT = (lid, lam, tau) => ({ id: nid++, logicalId: lid, displayId: lid, name: lid, type: 'basic', lambda: lam, repairModel: 'periodic', tau, probability: Math.min(1, lam * tau / 2), children: [] });
// Active per-flight event: P = 1 - e^(-lambda T).
const ACT = (lid, lam) => ({ id: nid++, logicalId: lid, displayId: lid, name: lid, type: 'basic', lambda: lam, probability: -Math.expm1(-lam * T), children: [] });
const BUD = (lid, q, extra) => Object.assign({ id: nid++, logicalId: lid, displayId: lid, name: lid, type: 'basic', probability: q, children: [] }, extra || {});
const G = (t, kids, extra) => Object.assign({ id: nid++, displayId: 'G' + nid, type: 'gate', gateType: t, children: kids }, extra || {});
const again = n => Object.assign({}, n, { id: nid++ });   // the same event used a second time

// ---- INDEPENDENT reference ------------------------------------------------------------------
// Each periodic event of interval tau has q(t) = lambda*t, t = phase in its cycle; cycles with the
// same tau share one phase, different taus are independent phases. Every other event is constant.
// Reference = average over phases (midpoint rule, M points per phase) of the exact P(top) given the
// probabilities, which is computed by enumerating every state of every distinct event.
function refAvg(root, M) {
    M = M || 4000;
    const ev = new Map();
    (function walk(n) { if (n.type !== 'gate') { if (!ev.has(n.logicalId)) ev.set(n.logicalId, n); return; } n.children.forEach(walk); })(root);
    const ids = [...ev.keys()];
    const taus = [...new Set(ids.map(i => ev.get(i)).filter(n => n.repairModel === 'periodic').map(n => n.tau))];
    // structure function as a truth table over the ids (computed once)
    const table = new Uint8Array(1 << ids.length);
    function f(n, st) {
        if (n.type !== 'gate') return st[n.logicalId];
        const k = n.children.map(c => f(c, st));
        if (n.gateType === 'AND') return k.every(Boolean);
        if (n.gateType === 'OR') return k.some(Boolean);
        if (n.gateType === 'VOTING') return k.filter(Boolean).length >= (n.votingK || 2);
        if (n.gateType === 'XOR') return k.filter(Boolean).length === 1;
        return false;
    }
    for (let m = 0; m < table.length; m++) { const st = {}; ids.forEach((id, i) => { st[id] = !!((m >> i) & 1); }); table[m] = f(root, st) ? 1 : 0; }
    function ptop(q) { let s = 0; for (let m = 0; m < table.length; m++) if (table[m]) { let w = 1; for (let i = 0; i < ids.length; i++) w *= ((m >> i) & 1) ? q[i] : 1 - q[i]; s += w; } return s; }
    const Ms = taus.length > 1 ? Math.max(60, Math.floor(Math.sqrt(M) * 3)) : M;
    let total = 0, count = 0;
    (function rec(d, phase) {
        if (d === taus.length) {
            const q = ids.map(id => { const n = ev.get(id); return n.repairModel === 'periodic' ? n.lambda * phase.get(n.tau) * n.tau : n.probability; });
            total += ptop(q); count++; return;
        }
        for (let k = 0; k < Ms; k++) { const ph = new Map(phase); ph.set(taus[d], (k + 0.5) / Ms); rec(d + 1, ph); }
    })(0, new Map());
    return total / count;
}
const exact = r => P.computeExactProbability(r).prob;
const bottomUp = r => { P.__r = r; vm.runInContext('calcBottomUp(__r, new Set())', P); return r.probability; };

// ======================================================================= [1] the ARP4761A forms
{
    const tau = 2000, l1 = 1e-5, l2 = 2e-5, l3 = 3e-5;
    const r2 = G('AND', [LAT('L1', l1, tau), LAT('L2', l2, tau)]);
    check('[1a] two latent, same interval, AND = l1 l2 tau^2 / 3 (was tau^2/4, ratio 0.767)', rel(exact(r2), l1 * l2 * tau * tau / 3) < 1e-12, String(exact(r2)));
    check('[1a] calcBottomUp (the headline on a tree with no repeated events) agrees', rel(bottomUp(r2), l1 * l2 * tau * tau / 3) < 1e-12, String(r2.probability));
    check('[1a] worker engine agrees', rel(Wk.SLFTAEngine.treeFactsForWorker(r2, []).ptop, l1 * l2 * tau * tau / 3) < 1e-12);
    const r3 = G('AND', [LAT('L1', l1, tau), LAT('L2', l2, tau), LAT('L3', l3, tau)]);
    check('[1b] three latent = l1 l2 l3 tau^3 / 4 (was tau^3/8, ratio 0.516)', rel(exact(r3), l1 * l2 * l3 * Math.pow(tau, 3) / 4) < 1e-12);
    check('[1b] calcBottomUp agrees', rel(bottomUp(r3), l1 * l2 * l3 * Math.pow(tau, 3) / 4) < 1e-12);
    let ok = true, detail = '';
    for (let n = 2; n <= 9; n++) {
        const kids = []; let prod = 1;
        for (let i = 0; i < n; i++) { const l = 1e-5 * (1 + i); kids.push(LAT('N' + i, l, tau)); prod *= l * tau; }
        const r = G('AND', kids), want = prod / (n + 1);
        if (!(rel(exact(r), want) < 1e-11 && rel(bottomUp(r), want) < 1e-11)) { ok = false; detail += ' n=' + n + ': ' + exact(r) + ' vs ' + want; }
    }
    check('[1c] n = 2..9 latent under one AND = prod(lambda_i tau) / (n+1), BDD and gate-by-gate', ok, detail);
    // The linear model is the conservative side of the exponential one: (1/tau) int prod(1 - e^-l t) dt.
    let integ = 0; const N = 200000; for (let i = 0; i < N; i++) { const t = (i + 0.5) * tau / N; integ += (1 - Math.exp(-l1 * t)) * (1 - Math.exp(-l2 * t)); } integ /= N;
    check('[1d] at or above the exponential-model joint average, within O(lambda tau)', exact(r2) >= integ && exact(r2) / integ < 1 + 2 * (l1 + l2) * tau, exact(r2) / integ);
}

// ============================================================ [2] what must NOT change stays put
{
    const tau = 3000, lL = 1e-5, lA = 1e-4;
    const lat = LAT('L', lL, tau), act = ACT('A', lA);
    const r = G('AND', [lat, act]);
    check('[2a] latent AND active per-flight: unchanged, mean x active exactly', exact(r) === lat.probability * act.probability, exact(r) + ' vs ' + lat.probability * act.probability);
    check('[2a] calcBottomUp: unchanged', bottomUp(G('AND', [LAT('L', lL, tau), ACT('A', lA)])) === lat.probability * act.probability);
    const one = G('OR', [LAT('L', lL, tau), ACT('A', lA), ACT('B', 2e-4)]);
    const old = 1 - (1 - lat.probability) * (1 - act.probability) * (1 - (-Math.expm1(-2e-4 * T)));
    check('[2b] a single periodic event anywhere: no time grid, the old number', P.computeExactProbability(one).grid === null && rel(exact(one), old) < 1e-14);
    const diff = G('AND', [LAT('L1', 1e-5, 1000), LAT('L2', 2e-5, 3000)]);
    check('[2c] different intervals stay independent: product of the means (unchanged)', rel(exact(diff), (1e-5 * 1000 / 2) * (2e-5 * 3000 / 2)) < 1e-14);
    // Allocation budgets carry no rate: a periodic label on a budget changes nothing.
    const b = G('AND', [BUD('b1', 1e-3, { repairModel: 'periodic', tau: 500 }), BUD('b2', 2e-3, { repairModel: 'periodic', tau: 500 })]);
    check('[2d] allocation budgets (probability only, no lambda) keep the plain product', exact(b) === 1e-3 * 2e-3);
    const ex = P.computeExactProbability(G('AND', [ACT('x', 1e-4), ACT('y', 1e-4)]));
    check('[2e] no periodic pair -> no time grid at all (old arithmetic path)', ex.grid === null);
}

// ================================================ [3] any structure, against the brute-force average
{
    const tau = 1200;
    const a = LAT('a', 4e-5, tau), b = LAT('b', 7e-5, tau), c = LAT('c', 2e-5, tau), x = ACT('x', 3e-4), y = ACT('y', 5e-4);
    const cases = [
        ['OR(a,b): q1 + q2 - l1 l2 tau^2/3', G('OR', [LAT('a', 4e-5, tau), LAT('b', 7e-5, tau)])],
        ['AND(a, OR(b, x)): coupling through an intermediate gate', G('AND', [LAT('a', 4e-5, tau), G('OR', [LAT('b', 7e-5, tau), ACT('x', 3e-4)])])],
        ['VOTING 2oo3(a,b,c)', G('VOTING', [LAT('a', 4e-5, tau), LAT('b', 7e-5, tau), LAT('c', 2e-5, tau)], { votingK: 2 })],
        ['OR(AND(a,b), AND(b,c), AND(x,y))', G('OR', [G('AND', [LAT('a', 4e-5, tau), LAT('b', 7e-5, tau)]), G('AND', [LAT('b2', 7e-5, tau), LAT('c', 2e-5, tau)]), G('AND', [ACT('x', 3e-4), ACT('y', 5e-4)])])],
        ['XOR(a,b,x)', G('XOR', [LAT('a', 4e-5, tau), LAT('b', 7e-5, tau), ACT('x', 3e-4)])],
    ];
    cases.forEach(([name, r]) => {
        const ref = refAvg(r);
        check('[3a] ' + name + ': BDD = brute-force cycle average', rel(exact(r), ref) < 1e-6, exact(r) + ' vs ' + ref);
        check('[3a] ' + name + ': calcBottomUp = brute-force cycle average', rel(bottomUp(r), ref) < 1e-6, r.probability + ' vs ' + ref);
    });
    // Repeated events (BDD only; the gate-by-gate number is not exact with repeats by design).
    const rr = G('OR', [G('AND', [a, b]), G('AND', [again(b), c]), G('AND', [again(a), x])]);
    check('[3b] repeated latent events: BDD = brute-force cycle average', rel(exact(rr), refAvg(rr)) < 1e-6, exact(rr) + ' vs ' + refAvg(rr));
    check('[3b] worker = page', Wk.SLFTAEngine.treeFactsForWorker(rr, []).ptop === exact(rr));
    // Two interval groups, each with a pair, in one tree: independent phases between groups.
    const two = G('OR', [G('AND', [LAT('p', 3e-5, 800), LAT('q', 6e-5, 800)]), G('AND', [LAT('r', 2e-5, 2400), LAT('s', 5e-5, 2400), LAT('p2', 3e-5, 800)])]);
    check('[3c] two interval groups in one tree: BDD = brute-force two-phase average', rel(exact(two), refAvg(two)) < 2e-5, exact(two) + ' vs ' + refAvg(two));
    check('[3c] calcBottomUp = brute-force two-phase average', rel(bottomUp(two), refAvg(two)) < 2e-5, two.probability + ' vs ' + refAvg(two));
}
{   // fuzz: random trees, three periodic events on one interval, two active events, no repeats
    let seed = 13102026; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let bad = 0, worst = 0;
    for (let trial = 0; trial < 60; trial++) {
        const pool = [LAT('a', 1e-5 + rnd() * 1e-4, 1000), LAT('b', 1e-5 + rnd() * 1e-4, 1000), LAT('c', 1e-5 + rnd() * 1e-4, 1000), ACT('x', rnd() * 1e-3), ACT('y', rnd() * 1e-3)];
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        const mk = items => { if (items.length === 1) return items[0]; const cut = 1 + Math.floor(rnd() * (items.length - 1)); const t = ['AND', 'OR'][Math.floor(rnd() * 2)]; return G(t, [mk(items.slice(0, cut)), mk(items.slice(cut))]); };
        const r = mk(pool);
        const ref = refAvg(r, 3000);
        const e1 = rel(exact(r), ref), e2 = rel(bottomUp(r), ref);
        worst = Math.max(worst, e1, e2);
        if (e1 > 1e-6 || e2 > 1e-6) bad++;
    }
    check('[3d] 60 random AND/OR trees (3 latent + 2 active): BDD and calcBottomUp = brute force', bad === 0, bad + ' bad, worst ' + worst);
}

// ========================================== [4] the other BDD consumers use the same time average
{
    const tau = 2000, l1 = 1e-5, l2 = 2e-5;
    const r = G('AND', [LAT('L1', l1, tau), LAT('L2', l2, tau)]);
    const im = P.computeImportanceMeasures(r);
    check('[4a] importance measures read the time-averaged P(top)', rel(im.pTop, l1 * l2 * tau * tau / 3) < 1e-12);
    const m1 = im.measures.find(m => m.node.logicalId === 'L1');
    // Birnbaum of L1 = P(top | L1 failed) - P(top | L1 working) averaged over the cycle = mean of q2 = l2 tau / 2.
    check('[4a] Birnbaum(L1) = cycle average of P(top|L1) - P(top|not L1) = l2 tau/2', rel(m1.birnbaum, l2 * tau / 2) < 1e-12);
    vm.runInContext('ftaConfig.exposureTime = 3;', P);
    const u = P.runUncertaintyAnalysis(r, 50, 1);
    check('[4b] uncertainty sampling (no error factor) reproduces the time-averaged point value', rel(u.median, l1 * l2 * tau * tau / 3) < 1e-12, String(u.median));
    // G.12 frequency, time-averaged the same way: w = avg over the cycle of
    // q2 l1 (1 - q1) + q1 l2 (1 - q2) with q_i = l_i t, which integrates to
    // l1 l2 [tau/2 - l1 tau^2/3 + tau/2 - l2 tau^2/3].
    vm.runInContext('switchTab = function () {};', P);
    vm.runInContext(read('fta_freq.js'), P, { filename: 'fta_freq.js' });
    const fq = P.FTA_FREQ.computeFrequency(r);
    const wRef = l1 * l2 * (tau / 2 - l1 * tau * tau / 3 + tau / 2 - l2 * tau * tau / 3);
    check('[4c] G.12 frequency is averaged over the shared cycle too', fq.ok && rel(fq.wTop, wRef) < 1e-12, fq.wTop + ' vs ' + wRef);
}

// ============================================================================ [5] mutation proof
{
    const off = s => s.replace('    const grid = _periodicGrid(varOrder, varMeta);\n', '    const grid = null;\n');
    const qm = read('fta_quant_modules.js'), eng = read('fta_engine.js');
    check('[5a] mutation applies to both engine copies', off(qm) !== qm && off(eng) !== eng);
    const M = pageContext({ 'fta_quant_modules.js': off(qm), 'fta_engine.js': off(eng) });
    const tau = 2000, l1 = 1e-5, l2 = 2e-5;
    const r = G('AND', [LAT('L1', l1, tau), LAT('L2', l2, tau)]);
    const got = M.computeExactProbability(r).prob;
    check('[5b] MUTATION: joint averaging off -> the [1a] check goes red (product of means, 0.75 of the truth)', rel(got, l1 * l2 * tau * tau / 3) > 0.2, String(got));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

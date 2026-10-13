#!/usr/bin/env node
/*
 * Regression: common cause failure, the real Multiple Greek Letter model (13 Oct 2026, fix 3).
 *
 * FOUND (math audit F3, F3b, 12 Oct 2026):
 *   - The engine called its common cause model "MGL" but computed the BETA FACTOR: one set of
 *     tier variables (q·β·(1−γ), q·β·γ·(1−δ), q·β·γ·δ) was ORed into EVERY member, so every tier
 *     failed the whole group and γ, δ never changed P(top). Against NUREG/CR-5485 MGL a 2-out-of-3
 *     failure came out 0.67 to 0.86 of the true value (non-conservative), 2-out-of-4 at 0.57.
 *   - The group took q and β from whichever member was read first: AND(a[q=1e-4, β=.1],
 *     b[q=1e-3, β=.05]) gave 1.01e-5, the same members swapped gave 5.01e-5.
 *   - The in-app benchmark B10e used the engine's own output (5.0079e-4) as its expected value.
 *
 * FIX: fta_engine.js / fta_quant_modules.js (_mgl* helpers, buildBDDFromFT, _probMapFor):
 *   one BDD variable per specific common cause event, probability
 *     Q_k^(m) = ρ1·…·ρk·(1 − ρ(k+1))·Q_t / C(m−1, k−1), ρ1 = 1, ρ2 = β, ρ3 = γ, ρ4 = δ, ρ(m+1) = 0,
 *   Q_1 = (1 − β)·Q_t on the member's own variable; β alone = MGL with γ = δ = 1 (beta factor);
 *   group parameters resolved order-independently (largest of each, flagged); each common cause
 *   event uses the largest Q_t of the members it fails (flagged); a recorded group size larger
 *   than the members in the tree is honored by projecting the absent members' events; visible
 *   common cause events in the cut sets ("CCF G: A+B" with metadata); ccfModelNotes warns on a
 *   group of 3+ under a VOTING gate with only β entered; B10e checks a hand-derived value.
 *
 * EXECUTED: loads the REAL site files in a vm (page: fta_engine + fta_quant_modules +
 *   engine_modules; worker: fta_engine alone) and compares against INDEPENDENT answers:
 *   (1) brute-force enumeration over every state of an explicitly listed set of independent
 *       events (each member's own failure and each specific common cause event, priced with the
 *       NUREG/CR-5485 formula written out again below, NOT with the engine's helpers), evaluated
 *       through an independent structure function of the tree;
 *   (2) NUREG/CR-5485 style worked numbers derived by hand in this file;
 *   (3) mutation proof: the same independent checks run against the PRE-FIX engine (git base
 *       7e1a988 = production fd6e4de) and must go red there.
 * Run: node tests/regression_ccf_mgl_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

function pageContext(src) {
    src = src || {};
    const p = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date,
        Int32Array, Float64Array, Uint32Array, Uint8Array, Promise, Error, RangeError, TypeError, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        performance: { now: () => Date.now() }, document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) },
        localStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: { userAgent: 'node' },
        SEVERITY_RANK: { Minor: 1, Major: 2, Hazardous: 4, Catastrophic: 5 }, projectConfig: {}, acFhaData: [], systemsData: [], invRegister() {} };
    p.window = p; p.globalThis = p; p.self = p;
    vm.createContext(p);
    for (const f of ['fta_engine.js', 'fta_quant_modules.js', 'engine_modules.js']) vm.runInContext(src[f] || read(f), p, { filename: f });
    vm.runInContext('var ftaPages = []; var ftaConfig = { exposureTime: 1, mode: "bottom-up" }; var activeFTAPageId = null;', p);
    return p;
}
function workerContext() {
    const w = { console, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date, Int32Array, Float64Array, Uint32Array, Uint8Array, Error, RangeError, TypeError };
    w.self = w; w.globalThis = w;
    vm.createContext(w);
    vm.runInContext(read('fta_engine.js'), w, { filename: 'fta_engine.js(worker)' });
    return w;
}

// ---------------------------------------------------------------- tree builders
let nid = 1;
const be = (lid, q, extra) => Object.assign({ id: nid++, logicalId: lid, name: 'E' + lid, displayId: String(lid), type: 'basic', probability: q, children: [] }, extra || {});
const gate = (t, kids, extra) => Object.assign({ id: nid++, displayId: 'G' + nid, type: 'gate', gateType: t, children: kids }, extra || {});

// ---------------------------------------------------------------- the INDEPENDENT reference
// NUREG/CR-5485 MGL, written out again here (not the engine's helpers).
const C = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); };
function mglQ(k, m, Qt, beta, gamma, delta) {           // one SPECIFIC k-subset of an m-group
    const rho = [0, 1, beta, gamma, delta];
    for (let i = 5; i <= m + 1; i++) rho[i] = 1;
    rho[m + 1] = 0;
    let prod = 1; for (let i = 1; i <= k; i++) prod *= rho[i];
    return prod * (1 - rho[k + 1]) * Qt / C(m - 1, k - 1);
}
function subsetsOf(arr, k) { const out = []; (function rec(s, cur) { if (cur.length === k) { out.push(cur.slice()); return; } for (let i = s; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); } })(0, []); return out; }
// Structure function of a tree over member failure states (lid -> bool). Independent of the engine.
function evalTree(n, st) {
    if (n.type !== 'gate') return !!st[String(n.logicalId)];
    const v = (n.children || []).map(c => evalTree(c, st));
    switch (n.gateType) {
        case 'AND': return v.every(Boolean);
        case 'OR': return v.some(Boolean);
        case 'VOTING': return v.filter(Boolean).length >= Math.max(1, Math.min(n.votingK || 2, v.length));
        case 'FDEP': return false;
    }
    throw new Error('gate not in reference: ' + n.gateType);
}
// Exact P(top) over an explicit list of independent events { p, fails: [lid...] }: a
// distribution over which members are failed, built one event at a time (each event either
// happens, adding its members, or does not). Exact, no cancellation, no rare-event shortcut.
function bruteP(root, events, fdeps) {
    const lids = [];
    events.forEach(e => e.fails.forEach(l => { if (lids.indexOf(String(l)) === -1) lids.push(String(l)); }));
    if (lids.length > 20) throw new Error('reference too large');
    const bit = new Map(lids.map((l, i) => [l, i]));
    let dist = new Map([[0, 1]]);
    events.forEach(e => {
        let mask = 0; e.fails.forEach(l => { mask |= (1 << bit.get(String(l))); });
        const next = new Map();
        dist.forEach((w, S) => {
            next.set(S, (next.get(S) || 0) + w * (1 - e.p));
            const S2 = S | mask; next.set(S2, (next.get(S2) || 0) + w * e.p);
        });
        dist = next;
    });
    let P = 0;
    dist.forEach((w, S) => {
        const st = {}; lids.forEach((l, i) => { if ((S >> i) & 1) st[l] = true; });
        // A functional dependency (trigger lid -> dependent lids): the trigger fails its dependents.
        (fdeps || []).forEach(([t, deps]) => { if (st[String(t)]) deps.forEach(d => { st[String(d)] = true; }); });
        if (evalTree(root, st)) P += w;
    });
    return P;
}
// The explicit event list for plain events plus ONE common cause group (members `group` with a
// common Q_t and the group's parameters). `extraMembers` = members of the group outside the tree.
function eventsFor(plain, group) {
    const ev = plain.map(([lid, q]) => ({ p: q, fails: [lid] }));
    if (!group) return ev;
    const all = group.lids.concat((group.phantoms || []).map((_, i) => 'phantom' + i));
    const m = all.length;
    for (let k = 1; k <= m; k++) {
        subsetsOf(all, k).forEach(sub => {
            const qt = Math.max.apply(null, sub.map(l => group.qOf ? group.qOf(l) : group.Qt));
            const q = k === 1 ? (1 - group.beta) * qt : mglQ(k, m, qt, group.beta, group.gamma, group.delta);
            if (q > 0) ev.push({ p: q, fails: sub });
        });
    }
    return ev;
}

const P = pageContext();
const W = workerContext();
const ENG = P.SLFTAEngine;

// ================================================================ [1] worked numbers
console.log('\n[1] NUREG/CR-5485 MGL worked numbers, derived by hand');
{
    // m = 3, Q_t = 0.01, β = 0.05, γ = 0.5 (ρ4 = ρ(m+1) = 0):
    //   Q1 = (1 − β)Q_t = 9.5e-3; Q2 = β(1 − γ)Q_t / C(2,1) = 1.25e-4 per pair; Q3 = βγQ_t / C(2,2) = 2.5e-4.
    //   Check: Q1 + 2·Q2 + Q3 = Q_t (each member's total).
    const mem = ['A', 'B', 'C'].map(l => be(l, 0.01, { ccfGroup: 'G3', beta: 0.05, gamma: 0.5, ccfModel: 'mgl' }));
    const r = P.computeExactProbability(gate('AND', mem));
    const own = [], pair = [], triple = [];
    r.varMeta.forEach((m, v) => { const p = r.probMap.get(v); if (m.type === 'indep') own.push(p); else if (m.ccfIdx.length === 2) pair.push(p); else if (m.ccfIdx.length === 3) triple.push(p); });
    check('m=3: each member\'s own variable = Q1 = 9.5e-3', own.length === 3 && own.every(p => rel(p, 9.5e-3) < 1e-12), JSON.stringify(own));
    check('m=3: three pair events, each Q2 = β(1−γ)Q_t/2 = 1.25e-4', pair.length === 3 && pair.every(p => rel(p, 1.25e-4) < 1e-12), JSON.stringify(pair));
    check('m=3: one triple event Q3 = βγQ_t = 2.5e-4', triple.length === 1 && rel(triple[0], 2.5e-4) < 1e-12, JSON.stringify(triple));
    check('m=3: a member\'s total Q1 + 2Q2 + Q3 equals Q_t', rel(9.5e-3 + 2 * 1.25e-4 + 2.5e-4, 0.01) < 1e-12);
    // All three AND-ed (hand formula, also the in-app B10e expected value):
    //   P = Q3 + (1−Q3)[(1−Q2)³Q1³ + 3Q2(1−Q2)²Q1 + 3Q2²(1−Q2) + Q2³]
    const Q1 = 9.5e-3, Q2 = 1.25e-4, Q3 = 2.5e-4;
    const hand = Q3 + (1 - Q3) * (Math.pow(1 - Q2, 3) * Q1 * Q1 * Q1 + 3 * Q2 * Math.pow(1 - Q2, 2) * Q1 + 3 * Q2 * Q2 * (1 - Q2) + Q2 * Q2 * Q2);
    check('AND of 3 (β=.05, γ=.5, q=.01) = hand-derived 2.544644e-4', rel(r.prob, hand) < 1e-12 && rel(hand, 2.544644176655e-4) < 1e-11, r.prob + ' vs ' + hand);
    // m = 4, Q_t = 1e-3, β = 0.1, γ = 0.3, δ = 0.5:
    //   Q1 = 9e-4; Q2 = β(1−γ)Q_t/C(3,1) = 2.3333e-5; Q3 = βγ(1−δ)Q_t/C(3,2) = 5e-6; Q4 = βγδQ_t = 1.5e-5.
    const m4 = ['A', 'B', 'C', 'D'].map(l => be(l + '4', 1e-3, { ccfGroup: 'G4', beta: 0.1, gamma: 0.3, delta: 0.5, ccfModel: 'mgl' }));
    const r4 = P.computeExactProbability(gate('AND', m4));
    const by = {}; r4.varMeta.forEach((m, v) => { const k = m.type === 'indep' ? 1 : m.ccfIdx.length; (by[k] = by[k] || []).push(r4.probMap.get(v)); });
    check('m=4: Q1 = 9e-4 (×4), Q2 = 2.3333e-5 (×6), Q3 = 5e-6 (×4), Q4 = 1.5e-5 (×1)',
        by[1].length === 4 && by[1].every(p => rel(p, 9e-4) < 1e-12) && by[2].length === 6 && by[2].every(p => rel(p, 0.1 * 0.7 * 1e-3 / 3) < 1e-12) &&
        by[3].length === 4 && by[3].every(p => rel(p, 5e-6) < 1e-12) && by[4].length === 1 && rel(by[4][0], 1.5e-5) < 1e-12, JSON.stringify(by));
    check('m=4: a member\'s total Q1 + 3Q2 + 3Q3 + Q4 equals Q_t', rel(9e-4 + 3 * 0.1 * 0.7 * 1e-3 / 3 + 3 * 5e-6 + 1.5e-5, 1e-3) < 1e-12);
}

// ================================================================ [2] brute force
console.log('\n[2] Engine vs brute-force enumeration over explicit MGL events');
function groupCase(name, m, kFail, Qt, beta, gamma, delta, model) {
    const lids = []; for (let i = 0; i < m; i++) lids.push(name + i);
    const extra = { ccfGroup: name, beta };
    if (model === 'mgl') { extra.ccfModel = 'mgl'; extra.gamma = gamma; extra.delta = delta; }
    const mem = lids.map(l => be(l, Qt, Object.assign({}, extra)));
    const root = kFail === m ? gate('AND', mem) : kFail === 1 ? gate('OR', mem) : gate('VOTING', mem, { votingK: kFail });
    const g = model === 'mgl' ? (gamma == null ? 1 : gamma) : 1, d = model === 'mgl' ? (delta == null ? 1 : delta) : 1;
    const ref = bruteP(root, eventsFor([], { lids, Qt, beta, gamma: g, delta: d }));
    return { root, eng: P.computeExactProbability(root).prob, ref };
}
const cases = [
    ['V23', 3, 2, 1e-4, 0.05, 0.3, 0, 'mgl', '2-out-of-3 failure (VOTING), γ=0.3'],
    ['V23b', 3, 2, 1e-4, 0.05, 0.1, 0, 'mgl', '2-out-of-3 failure, γ=0.1'],
    ['V23c', 3, 2, 0.01, 0.05, 0.5, 0, 'mgl', '2-out-of-3 failure, in-app parameters (B10f)'],
    ['V24', 4, 2, 1e-4, 0.05, 0.3, 0.5, 'mgl', '2-out-of-4 failure'],
    ['V34', 4, 3, 1e-4, 0.05, 0.3, 0.5, 'mgl', '3-out-of-4 failure'],
    ['A44', 4, 4, 1e-4, 0.05, 0.3, 0.5, 'mgl', 'all-fail AND of 4'],
    ['A33', 3, 3, 1e-4, 0.05, 0.3, 0, 'mgl', 'all-fail AND of 3'],
    ['O13', 3, 1, 1e-4, 0.05, 0.3, 0, 'mgl', 'any-fail OR of 3'],
    ['A55', 5, 5, 1e-3, 0.1, 0.4, 0.5, 'mgl', 'all-fail AND of 5 (ρ5 = 1)'],
    ['V35', 5, 3, 1e-3, 0.1, 0.4, 0.5, 'mgl', '3-out-of-5 failure'],
    ['B23', 3, 2, 1e-4, 0.05, null, null, 'beta', 'β only, 2-out-of-3: beta factor (γ = δ = 1)'],
    ['B44', 4, 4, 1e-4, 0.05, null, null, 'beta', 'β only, AND of 4: beta factor']
];
cases.forEach(([n, m, k, q, b, g, d, model, label]) => {
    const r = groupCase(n, m, k, q, b, g, d, model);
    check(label + ': engine ' + r.eng.toExponential(6) + ' = enumeration ' + r.ref.toExponential(6), rel(r.eng, r.ref) < 1e-9);
});
{
    // A mixed tree: group members in different branches, plain events alongside, one repeated event.
    const g = { ccfGroup: 'GM', beta: 0.08, gamma: 0.4, ccfModel: 'mgl' };
    const a = be('ma', 2e-3, g), b = be('mb', 2e-3, g), c = be('mc', 2e-3, g);
    const x = be('x', 5e-3), y = be('y', 1e-2), x2 = be('x', 5e-3);
    const root = gate('OR', [gate('AND', [a, x]), gate('AND', [b, gate('OR', [c, y])]), gate('VOTING', [a, c, x2], { votingK: 2 })]);
    const ref = bruteP(root, eventsFor([['x', 5e-3], ['y', 1e-2]], { lids: ['ma', 'mb', 'mc'], Qt: 2e-3, beta: 0.08, gamma: 0.4, delta: 1 }));
    const eng = P.computeExactProbability(root).prob;
    check('mixed tree (members across branches, repeated event, VOTING) = enumeration', rel(eng, ref) < 1e-9, eng + ' vs ' + ref);
}

// ================================================================ [3] defaults and legacy
console.log('\n[3] Beta factor default and stored-data meaning');
{
    const mk = (pref, extra) => ['a', 'b', 'c'].map(l => be(pref + l, 1e-4, Object.assign({ ccfGroup: pref }, extra)));
    const v = kids => P.computeExactProbability(gate('VOTING', kids, { votingK: 2 })).prob;
    const bf = groupCase('BF', 3, 2, 1e-4, 0.05, null, null, 'beta').ref;
    check('β only (no model field) = beta factor', rel(v(mk('L1', { beta: 0.05 })), bf) < 1e-12);
    check('older project: γ = 0 and δ = 0 stored, no model field = beta factor (same number as before)', rel(v(mk('L2', { beta: 0.05, gamma: 0, delta: 0 })), bf) < 1e-12);
    check('model "beta" ignores a stored γ', rel(v(mk('L3', { beta: 0.05, gamma: 0.3, ccfModel: 'beta' })), bf) < 1e-12);
    check('model "mgl" with γ left blank: γ = 1, the beta factor for m = 3', rel(v(mk('L4', { beta: 0.05, gamma: null, ccfModel: 'mgl' })), bf) < 1e-12);
    const g0 = groupCase('G0', 3, 2, 1e-4, 0.05, 0, 0, 'mgl').ref;
    check('model "mgl" with γ = 0 entered: every common cause failure is a pair (not the beta factor)', rel(v(mk('L5', { beta: 0.05, gamma: 0, ccfModel: 'mgl' })), g0) < 1e-12 && rel(g0, bf) > 0.1);
    check('older project with γ > 0 stored and no model field = MGL', rel(v(mk('L6', { beta: 0.05, gamma: 0.3 })), groupCase('G6', 3, 2, 1e-4, 0.05, 0.3, 1, 'mgl').ref) < 1e-12);
    const r1 = P.computeExactProbability(gate('AND', mk('L7', { beta: 0.05 })));
    check('a beta-only group has exactly ONE common cause event (no extra variables)', r1.varMeta.filter(m => m.type === 'group').length === 1);
}

// ================================================================ [4] mixed members, order
console.log('\n[4] Members with different q or β: defined rule, flagged, child-order invariant');
{
    const a = be('qa', 1e-4, { ccfGroup: 'H', beta: 0.10 }), b = be('qb', 1e-3, { ccfGroup: 'H', beta: 0.05 });
    const p1 = P.computeExactProbability(gate('AND', [a, b]));
    const a2 = be('qa', 1e-4, { ccfGroup: 'H', beta: 0.10 }), b2 = be('qb', 1e-3, { ccfGroup: 'H', beta: 0.05 });
    const p2 = P.computeExactProbability(gate('AND', [b2, a2])).prob;
    // Rule: the group's β is the largest entered (0.1, flagged); the common cause event uses the
    // largest Q_t of the members it fails (1e-3). Own parts: (1−0.1)·1e-4 and (1−0.1)·1e-3.
    const c = 0.1 * 1e-3, oa = 0.9 * 1e-4, ob = 0.9 * 1e-3;
    const hand = c + (1 - c) * oa * ob;
    check('AND(a[q=1e-4, β=.1], b[q=1e-3, β=.05]) = the stated rule by hand (' + hand.toExponential(4) + ')', rel(p1.prob, hand) < 1e-12, String(p1.prob));
    check('…and the same with the children swapped (was 4.97x apart)', rel(p2, p1.prob) < 1e-12, p2 + ' vs ' + p1.prob);
    const issues = (p1.ccfGroups[0] || {}).issues || [];
    check('the group reports params-differ and qt-differ (never silent)', issues.some(i => i.code === 'params-differ') && issues.some(i => i.code === 'qt-differ'), JSON.stringify(issues.map(i => i.code)));
    // Mixed q through a voting gate, against enumeration with the same rule.
    const qs = { va: 1e-4, vb: 5e-4, vc: 2e-3 };
    const g = { ccfGroup: 'HM', beta: 0.1, gamma: 0.4, ccfModel: 'mgl' };
    const kids = Object.keys(qs).map(l => be(l, qs[l], g));
    const root = gate('VOTING', kids, { votingK: 2 });
    const ref = bruteP(root, eventsFor([], { lids: Object.keys(qs), qOf: l => qs[l], beta: 0.1, gamma: 0.4, delta: 1 }));
    check('mixed-q 2-out-of-3 = enumeration under the largest-Q_t-per-event rule', rel(P.computeExactProbability(root).prob, ref) < 1e-9);
}
{
    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function tree(seed) {
        const r = rng(seed);
        const mkLeaf = i => {
            const x = r();
            if (x < 0.5) return be('g' + (i % 4), [1e-4, 3e-4, 1e-3, 2e-3][i % 4], { ccfGroup: 'R', beta: [0.05, 0.1][i % 2], gamma: 0.3, delta: 0.6, ccfModel: 'mgl' });
            return be('p' + i, 1e-3 * (1 + (i % 5)));
        };
        let i = 0;
        const mk = d => (d === 0 || r() < 0.2) ? mkLeaf(i++) : gate(['AND', 'OR', 'VOTING'][Math.floor(r() * 3)], [mk(d - 1), mk(d - 1), mk(d - 1)], { votingK: 2 });
        return mk(3);
    }
    function shuffle(n, r) { if (n.type !== 'gate') return Object.assign({}, n); const kids = n.children.map(c => shuffle(c, r)); for (let i = kids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kids[i], kids[j]] = [kids[j], kids[i]]; } return Object.assign({}, n, { children: kids }); }
    let ok = true, why = '';
    for (let s = 1; s <= 25; s++) {
        const t = tree(s), base = P.computeExactProbability(t).prob;
        const r = rng(1000 + s);
        for (let k = 0; k < 4; k++) { const p = P.computeExactProbability(shuffle(t, r)).prob; if (rel(p, base) > 1e-12) { ok = false; why = 'seed ' + s + ': ' + p + ' vs ' + base; } }
    }
    check('child order never changes P(top): 25 trees with a mixed-q, mixed-β MGL group, 4 shuffles each', ok, why);
}

// ================================================================ [5] group size
console.log('\n[5] Recorded group size larger than the members in this tree');
{
    // A 4-member group (ccfGroupSize = 4) with only A and B in this tree. Reference: the full
    // 4-member MGL event set, members C and D simply never appear in the structure function.
    const g = { ccfGroup: 'S', beta: 0.1, gamma: 0.3, delta: 0.5, ccfModel: 'mgl', ccfGroupSize: 4 };
    const root = gate('AND', [be('sa', 1e-3, g), be('sb', 1e-3, g)]);
    const ref = bruteP(root, eventsFor([], { lids: ['sa', 'sb'], phantoms: [1, 2], Qt: 1e-3, beta: 0.1, gamma: 0.3, delta: 0.5 }));
    const eng = P.computeExactProbability(root).prob;
    check('2 of a recorded 4-member group, AND: engine = enumeration over the full group', rel(eng, ref) < 1e-9, eng + ' vs ' + ref);
    const g2 = Object.assign({}, g, { ccfGroupSize: undefined });
    const eng2 = P.computeExactProbability(gate('AND', [be('sa2', 1e-3, g2), be('sb2', 1e-3, g2)])).prob;
    check('…which differs from treating the two as the whole group (size matters in MGL)', rel(eng2, eng) > 0.1, eng2 + ' vs ' + eng);
    const gb = { ccfGroup: 'SB', beta: 0.1, ccfGroupSize: 4 };
    const engB = P.computeExactProbability(gate('AND', [be('sc', 1e-3, gb), be('sd', 1e-3, gb)])).prob;
    check('beta factor: group size does not matter (β·Q_t fails every member either way)', rel(engB, 0.1e-3 + (1 - 0.1e-3) * 0.9e-3 * 0.9e-3) < 1e-12);
}

// ================================================================ [6] cut sets
console.log('\n[6] Each common cause event is explicit in the cut sets, with metadata');
{
    const g = { ccfGroup: 'PUMPS', beta: 0.05, gamma: 0.5, ccfModel: 'mgl', ccfParamSource: 'NUREG/CR-5485 generic' };
    const A = be('PA', 0.01, Object.assign({ displayId: 'A' }, g)), B = be('PB', 0.01, Object.assign({ displayId: 'B' }, g)), Cc = be('PC', 0.01, Object.assign({ displayId: 'C' }, g));
    const mcs = P.bddMinimalCutsets(gate('VOTING', [A, B, Cc], { votingK: 2 }));
    const names = mcs.map(cs => cs.map(e => e.name || e.displayId).sort().join(' & ')).sort();
    // Expected minimal cut sets of 2-of-3 over {A,B,C own; AB, AC, BC; ABC}: the 3 own pairs,
    // each single pair event, the triple event, and each pair event with the third member's own
    // failure is NOT minimal (the pair alone already fails 2). So: 3 + 3 + 1 = 7.
    const pairEv = mcs.filter(cs => cs.length === 1 && cs[0].isCCF && cs[0].ccf.k === 2);
    const triple = mcs.find(cs => cs.length === 1 && cs[0].isCCF && cs[0].ccf.k === 3);
    check('2-of-3: 7 minimal cut sets (3 own pairs, 3 pair events, 1 triple event)', mcs.length === 7 && pairEv.length === 3 && !!triple, names.join(' | '));
    const ev = pairEv.map(cs => cs[0]).find(e => e.ccf.memberDisplayIds.join('+') === 'A+B');
    check('a common cause event reads "CCF PUMPS: A+B"', !!ev && ev.name === 'CCF PUMPS: A+B', ev && ev.name);
    check('…and carries group, members, k, group size and parameters', !!ev && ev.ccf.group === 'PUMPS' && ev.ccf.k === 2 && ev.ccf.groupSize === 3 &&
        JSON.stringify(ev.ccf.memberIds) === JSON.stringify([A.id, B.id]) && ev.ccf.beta === 0.05 && ev.ccf.gamma === 0.5 && ev.ccf.model === 'mgl' &&
        ev.ccf.paramSource === 'NUREG/CR-5485 generic' && ev.isCCF === true && ev.sourceGroup === 'PUMPS' && ev.ccfGroup === undefined);
    const snap = P.cutsetSnapshot(ev);
    check('the worker cut-set snapshot keeps the common cause metadata', snap.isCCF === true && snap.ccf && snap.ccf.k === 2 && snap.sourceGroup === 'PUMPS');
    const built = P.buildBDDFromFT(gate('AND', [be('S1', 1e-3, { ccfGroup: 'SG', beta: 0.1 }), be('S2', 1e-3, { ccfGroup: 'SG', beta: 0.1 })]));
    check('a modeled common cause event is not reported as an unaccepted single failure', ENG.singleFailureEvents(built).length === 0);
}
{
    // Classic cut-set expansion (the cut-set table and exports): rows priced by the same model.
    const g = { ccfGroup: 'EX', beta: 0.05, gamma: 0.5, ccfModel: 'mgl' };
    const kids = ['xa', 'xb', 'xc'].map(l => be(l, 0.01, g));
    const root = gate('VOTING', kids, { votingK: 2 });
    const raw = P.getCutsets(root);
    const rows = P.expandCCFCutsets(ENG.minimalCutsets(raw), root);
    const sum = rows.reduce((s, cs) => s + cs.reduce((p, e) => p * e.probability, 1), 0);
    const exact = bruteP(root, eventsFor([], { lids: ['xa', 'xb', 'xc'], Qt: 0.01, beta: 0.05, gamma: 0.5, delta: 1 }));
    check('cut-set table rows: the rare-event sum is within 1% of the exact 2-of-3 MGL value', rel(sum, exact) < 0.01, sum + ' vs ' + exact);
    const kids2 = ['xa', 'xb', 'xc'].map(l => be(l, 0.01, g));
    const rows2 = P.expandCCFCutsets(ENG.minimalCutsets(P.getCutsets(gate('VOTING', [kids2[2], kids2[0], kids2[1]], { votingK: 2 }))), gate('VOTING', kids2, { votingK: 2 }));
    const sum2 = rows2.reduce((s, cs) => s + cs.reduce((p, e) => p * e.probability, 1), 0);
    check('…and does not depend on member order', rel(sum2, sum) < 1e-12);
    check('…rows name each common cause event (isCCF, sourceGroup)', rows.some(cs => cs.some(e => e.isCCF && e.sourceGroup === 'EX' && /^CCF EX: /.test(e.name))));
}

// ================================================================ [7] warnings
console.log('\n[7] Warnings');
{
    const mk = (grp, extra) => ['a', 'b', 'c'].map(l => be(grp + l, 1e-4, Object.assign({ ccfGroup: grp, beta: 0.05 }, extra || {})));
    const n1 = ENG.ccfModelNotes(gate('VOTING', mk('W1'), { votingK: 2, displayId: 'G-V' }));
    const w = n1.find(n => n.code === 'voting-beta-only');
    check('3 members under a VOTING gate with only β: plain warning that 2 of 3 is not modeled until γ is given', !!w && /only beta is entered/.test(w.message) && /2 of 3/.test(w.message) && /Enter gamma/.test(w.message), w && w.message);
    check('…not raised once γ is entered', !ENG.ccfModelNotes(gate('VOTING', mk('W2', { gamma: 0.3, ccfModel: 'mgl' }), { votingK: 2 })).some(n => n.code === 'voting-beta-only'));
    check('…not raised for an AND gate (all-fail is what the beta factor models)', !ENG.ccfModelNotes(gate('AND', mk('W3'))).some(n => n.code === 'voting-beta-only'));
    check('…not raised for 2 members under a voting gate', !ENG.ccfModelNotes(gate('VOTING', mk('W4').slice(0, 2).concat([be('w4x', 1e-3)]), { votingK: 2 })).some(n => n.code === 'voting-beta-only'));
    check('members with different β are reported by ccfModelNotes', ENG.ccfModelNotes(gate('AND', [be('d1', 1e-3, { ccfGroup: 'D', beta: 0.1 }), be('d2', 1e-3, { ccfGroup: 'D', beta: 0.2 })])).some(n => n.code === 'params-differ'));
    let err = null;
    try { P.computeExactProbability(gate('OR', Array.from({ length: 30 }, (_, i) => be('big' + i, 1e-4, { ccfGroup: 'BIG', beta: 0.1, gamma: 0.3, delta: 0.5, ccfModel: 'mgl' })))); } catch (e) { err = e; }
    check('a group too large to expand is refused by name, never truncated', !!err && err.name === 'CCFGroupTooLargeError', err && err.message);
    const t0 = Date.now();
    const r8 = groupCase('M8', 8, 4, 1e-3, 0.1, 0.3, 0.5, 'mgl');
    check('a group of 8 under a 4-of-8 voting gate quantifies quickly (' + (Date.now() - t0) + ' ms)', Date.now() - t0 < 5000 && r8.eng > 0);
}

// ================================================================ [8] uncertainty, worker
console.log('\n[8] Uncertainty sampling and the worker use the same model');
{
    const g = { ccfGroup: 'U', beta: 0.05, gamma: 0.5, ccfModel: 'mgl' };
    const lam = -Math.log1p(-0.01);
    const kids = ['ua', 'ub', 'uc'].map(l => be(l, 0.01, Object.assign({ lambda: lam }, g)));
    const root = gate('VOTING', kids, { votingK: 2 });
    const exact = P.computeExactProbability(root).prob;
    const unc = P.runUncertaintyAnalysis(root, 32);
    check('EF = 1: every uncertainty sample equals the exact MGL value', unc.samples.every(s => rel(s, exact) < 1e-9), unc.median + ' vs ' + exact);
    const clone = JSON.parse(JSON.stringify(root));
    const f = W.SLFTAEngine.treeFactsForWorker(clone, []);
    check('worker P(top) equals the page, bit for bit, on an MGL tree', f.ptop === exact, f.ptop + ' vs ' + exact);
    check('worker cut sets carry the same common cause events', JSON.stringify(f.mcs) === JSON.stringify(P.minimalCutsetSnapshots(root)));
}

// ================================================================ [8b] with F4/F5 (merged engine v1.9)
console.log('\n[8b] Common cause together with FDEP and shared-interval latent events (engine v1.9)');
{
    // FDEP: trigger T forces member A of a 3-member MGL group; plain event x is also a dependent.
    const g = { ccfGroup: 'FD', beta: 0.08, gamma: 0.4, ccfModel: 'mgl' };
    const A = be('fa', 2e-3, g), B = be('fb', 2e-3, g), Cc = be('fc', 2e-3, g);
    const T = be('ft', 1e-3), x = be('fx', 4e-3);
    const root = gate('OR', [gate('VOTING', [A, B, Cc], { votingK: 2 }), gate('AND', [x, be('fy', 5e-2)]),
        gate('FDEP', [be('ft', 1e-3), be('fa', 2e-3, g), be('fx', 4e-3)])]);
    const ev = eventsFor([['ft', 1e-3], ['fx', 4e-3], ['fy', 5e-2]], { lids: ['fa', 'fb', 'fc'], Qt: 2e-3, beta: 0.08, gamma: 0.4, delta: 1 });
    const ref = bruteP(root, ev, [['ft', ['fa', 'fx']]]);
    const r = P.computeExactProbability(root);
    check('MGL group + FDEP (trigger forces a member and a plain event) = enumeration', rel(r.prob, ref) < 1e-9, r.prob + ' vs ' + ref);
    check('…and the FDEP is counted (fdepCount 1) with the common cause events present', r.fdepCount === 1 && r.varMeta.some(m => m.type === 'group'));
    const refNoF = bruteP(root, ev, []);
    check('…the trigger really changes the answer (the check is not vacuous)', rel(ref, refNoF) > 1e-3, ref + ' vs ' + refNoF);
    void T; void x;
    const fw = W.SLFTAEngine.treeFactsForWorker(JSON.parse(JSON.stringify(root)), []);
    check('…and the worker gives the same number, bit for bit', fw.ptop === r.prob, fw.ptop + ' vs ' + r.prob);
}
{
    // Periodic latent members sharing one inspection interval: q_i(t) = λ t over the cycle; the
    // static number is the cycle average of P(top). Reference: the explicit MGL event set priced at
    // Q_t(t) = λ t, enumerated exactly at each t, integrated by composite Simpson (4000 panels).
    const lam = 1e-5, tau = 1000;
    function latentCase(label, m, kFail, beta, gamma, model) {
        const lids = []; for (let i = 0; i < m; i++) lids.push(label + i);
        const extra = { ccfGroup: label, beta, lambda: lam, repairModel: 'periodic', tau };
        if (model === 'mgl') { extra.ccfModel = 'mgl'; extra.gamma = gamma; }
        const mem = lids.map(l => be(l, lam * tau / 2, Object.assign({}, extra)));
        const root = kFail === m ? gate('AND', mem) : gate('VOTING', mem, { votingK: kFail });
        const g = model === 'mgl' ? gamma : 1;
        const at = t => bruteP(root, eventsFor([], { lids, Qt: lam * t, beta, gamma: g, delta: 1 }));
        const N = 4000, h = tau / N; let sum = at(0) + at(tau);
        for (let i = 1; i < N; i++) sum += (i % 2 ? 4 : 2) * at(i * h);
        const ref = sum * h / 3 / tau;
        const r = P.computeExactProbability(root);
        return { r, ref };
    }
    const c1 = latentCase('LA', 2, 2, 0.1, null, 'beta');
    check('beta group of 2 periodic latent members (one interval), AND = cycle average by Simpson', rel(c1.r.prob, c1.ref) < 1e-7 && !!c1.r.grid, c1.r.prob + ' vs ' + c1.ref);
    const c2 = latentCase('LV', 3, 2, 0.08, 0.4, 'mgl');
    check('MGL group of 3 periodic latent members, 2-out-of-3 = cycle average by Simpson', rel(c2.r.prob, c2.ref) < 1e-7, c2.r.prob + ' vs ' + c2.ref);
    const c3 = latentCase('LM', 3, 3, 0.08, 0.4, 'mgl');
    check('MGL group of 3 periodic latent members, AND = cycle average by Simpson', rel(c3.r.prob, c3.ref) < 1e-7, c3.r.prob + ' vs ' + c3.ref);
    const ev = c2.r.varMeta.filter(m => m.type === 'group');
    check('…the common cause events take part in the shared-interval average (in the grid)', c2.r.grid && c2.r.grid.groups.some(gr => gr.count === 3 + ev.length));
}

// ================================================================ [9] benchmark + UI wiring
console.log('\n[9] In-app benchmark and screens');
{
    const B = read('bindings_modules.js');
    const blk = B.slice(B.indexOf("id: 'B10e-mgl-ccf-engine'"), B.indexOf("id: 'B10f-mgl-2oo3-engine'"));
    check('B10e expects the hand-derived 2.544644176655e-4, not the old engine output 5.0079e-4', /expected: 2\.544644176655e-4/.test(blk) && !/expected: 5\.007944/.test(blk));
    check('B10f (2-of-3 voting) expects the enumerated 8.937265294695e-4', /id: 'B10f-mgl-2oo3-engine'[\s\S]{0,1600}expected: 8\.937265294695e-4/.test(B));
    const r = groupCase('B10f', 3, 2, 0.01, 0.05, 0.5, 0, 'mgl');
    check('…and the engine meets B10f', rel(r.eng, 8.937265294695e-4) < 1e-12, String(r.eng));
    const H = read('index.html');
    check('node panel offers the model choice, γ/δ blank = 1, NUREG starting values and a source field',
        /id="config-ccf-model"/.test(H) && /id="config-ccf-preset"/.test(H) && /id="config-ccf-source"/.test(H) && /Beta only = beta factor: every common cause failure fails the whole group/.test(H));
    const HM = read('helpers_modules.js');
    check('group parameters are written to every member (ccfApplyGroupParams) and the popover has no per-member choice',
        /function ccfApplyGroupParams\(/.test(HM) && !/ccf-pop-all/.test(HM) && /These parameters belong to the group and apply to every member/.test(HM));
}

// ================================================================ [9b] group-level writes
console.log('\n[9b] The screens write parameters to the GROUP (real helpers_modules.js functions)');
{
    const HM = read('helpers_modules.js');
    const fnText = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return null; let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } } return null; };
    const names = ['_ftaCcfMembers', 'ccfGroupDistinctMembers', 'ccfReadGroupParams', 'ccfApplyGroupParams', 'ccfSyncGroup', 'ccfBetaPresets', 'ccfGroupNotes', 'ccfNotesHtml', 'ccfFillConfigPanel', 'ccfRefreshConfigPanelState', 'ccfConfigPanelCommit'];
    const code = names.map(n => fnText(HM, n)).join('\n');
    const fields = {};
    const el = id => (fields[id] = fields[id] || { value: '', disabled: false, placeholder: '', style: {}, innerHTML: '' });
    P.document = { getElementById: id => el(id), readyState: 'complete', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
    vm.runInContext(code + '\nthis.__ccf = { ' + names.join(', ') + ' };', P);
    const F = P.__ccf;
    const a = be('ga', 1e-3, { ccfGroup: 'GRP', beta: 0.1 }), b = be('gb', 1e-3, { ccfGroup: 'GRP', beta: 0.1 });
    const a2 = be('ga', 1e-3, { ccfGroup: 'GRP', beta: 0.1 });   // the same event repeated on page 2
    const c = be('gc', 2e-3, { ccfGroup: 'GRP', beta: 0.1 }), d = be('gd', 1e-3);
    P.ftaPages.length = 0;
    P.ftaPages.push({ id: 'p1', name: 'one', root: gate('AND', [a, b]) }, { id: 'p2', name: 'two', root: gate('VOTING', [a2, c, d], { votingK: 2 }) });
    F.ccfApplyGroupParams('GRP', { beta: 0.07, model: 'mgl', gamma: '', delta: 0.4, source: 'NUREG/CR-5485 generic' });
    const occ = [a, b, a2, c];
    check('a group write reaches every member on every page, repeats included', occ.every(n => n.beta === 0.07 && n.ccfModel === 'mgl' && n.gamma === null && n.delta === 0.4 && n.ccfParamSource === 'NUREG/CR-5485 generic'));
    check('…and records the project-wide group size (3 distinct members)', occ.every(n => n.ccfGroupSize === 3));
    // An event joins through the node panel: it adopts the group's parameters, whatever it had.
    const e = be('ge', 5e-3, { ccfGroup: '', beta: 0.3 });
    P.ftaPages[1].root.children.push(e);
    el('config-ccf-group').value = 'GRP'; el('config-beta').value = '0.3'; el('config-ccf-model').value = 'beta'; el('config-gamma').value = ''; el('config-delta').value = ''; el('config-ccf-source').value = '';
    e.ccfGroup = 'GRP';
    F.ccfConfigPanelCommit(e, '');
    check('joining an existing group adopts its parameters (β 0.07, MGL), not the typed 0.3', e.beta === 0.07 && e.ccfModel === 'mgl' && e.delta === 0.4);
    check('…and every member re-counts the size (4)', occ.concat([e]).every(n => n.ccfGroupSize === 4));
    check('the panel shows the group\'s values after joining', el('config-beta').value === 0.07 && el('config-ccf-model').value === 'mgl' && el('config-gamma').value === '');
    // Editing β in the panel for a member writes the whole group.
    el('config-beta').value = '0.12'; el('config-ccf-model').value = 'beta';
    F.ccfConfigPanelCommit(b, 'GRP');
    check('editing one member\'s panel changes the GROUP (all 5 occurrences now β 0.12, beta factor)', occ.concat([e]).every(n => n.beta === 0.12 && n.ccfModel === 'beta' && n.gamma === null));
    // Leaving the group re-counts the rest.
    c.ccfGroup = '';
    F.ccfConfigPanelCommit(c, 'GRP');
    check('leaving the group re-counts the remaining members (3)', [a, b, a2, e].every(n => n.ccfGroupSize === 3) && c.ccfGroupSize === undefined);
    const notes = F.ccfGroupNotes('GRP');
    check('ccfGroupNotes runs on the live project without error', Array.isArray(notes));
    P.ftaPages.length = 0;
}

// ================================================================ [10] mutation proof
console.log('\n[10] Mutation proof: the same independent checks against the PRE-FIX engine');
{
    let base = null;
    try {
        const g = f => cp.execSync('git show 7e1a988:site/' + f, { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        base = { 'fta_engine.js': g('fta_engine.js'), 'fta_quant_modules.js': g('fta_quant_modules.js') };
    } catch (_) { base = null; }
    if (!base) {
        console.log('  (git base 7e1a988 not available here: mutation proof skipped)');
    } else {
        const Pb = pageContext(base);
        const Psave = P.computeExactProbability;
        const run = (fn) => { const keep = P.computeExactProbability; P.computeExactProbability = Pb.computeExactProbability; try { return fn(); } finally { P.computeExactProbability = keep; } };
        const red2oo3 = run(() => { const r = groupCase('MU1', 3, 2, 1e-4, 0.05, 0.3, 0, 'mgl'); return rel(r.eng, r.ref) > 1e-3; });
        check('pre-fix engine FAILS the 2-out-of-3 MGL enumeration check', red2oo3);
        const redOrder = (() => {
            const a = be('ma1', 1e-4, { ccfGroup: 'MU', beta: 0.1 }), b = be('mb1', 1e-3, { ccfGroup: 'MU', beta: 0.05 });
            const a2 = be('ma1', 1e-4, { ccfGroup: 'MU', beta: 0.1 }), b2 = be('mb1', 1e-3, { ccfGroup: 'MU', beta: 0.05 });
            return rel(Pb.computeExactProbability(gate('AND', [a, b])).prob, Pb.computeExactProbability(gate('AND', [b2, a2])).prob) > 1e-3;
        })();
        check('pre-fix engine FAILS the child-order invariance check', redOrder);
        const redB10e = (() => {
            const mem = ['A', 'B', 'C'].map(l => be('mu' + l, 0.01, { ccfGroup: 'MUB', beta: 0.05, gamma: 0.5 }));
            return rel(Pb.computeExactProbability(gate('AND', mem)).prob, 2.544644176655e-4) > 1e-3;
        })();
        check('pre-fix engine FAILS the hand-derived B10e value', redB10e);
        P.computeExactProbability = Psave;
    }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

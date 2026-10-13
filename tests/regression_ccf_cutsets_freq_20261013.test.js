#!/usr/bin/env node
/*
 * Regression: common cause events are explicit in the minimal cut sets, and the cut-set
 * frequency w_TE includes them (13 Oct 2026, fix 6 part A, math audit F6).
 *
 * FOUND: the BDD models a common cause group with extra variables ORed into every member they
 * fail, but the cut set panel worked from the classic enumerator, which never sees those
 * variables. The panel showed {A,B} for a beta group (the old expandCCFCutsets then repeated a
 * "CCF" row inside every cut set holding two members, reading the numbers from whichever member
 * came first), and the Vesely-Goldberg frequency w_TE on the panel left common cause out with no
 * flag: AND(A,B), beta = 0.05 gave 0.47 of the exact dQ/dt (audit script math/t8_freq.js).
 *
 * FIX: SLFTAEngine.ccfCatalog reads the group variables from the BDD build itself (varMeta type
 * 'group', so it works for today's tiers and for one variable per common cause subset under
 * MGL); explicitCCFCutsets substitutes each member by (independent part OR each common cause
 * event failing it) and minimizes. expandCCFCutsets (page) and computeFailureFrequency use it.
 *
 * EXECUTED: the REAL site/fta_engine.js (and the page stack fta_engine + fta_quant_modules +
 * engine_modules for the panel's expandCCFCutsets) in vm. Every expected answer is INDEPENDENT
 * of the engine:
 *   C1  minimal cut sets by brute-force enumeration of a structure function written here over
 *       the explicit variables (A_ind, B_ind, ..., CCF), compared with the engine's sets
 *   C2  each common cause event appears in exactly one minimal cut set where it alone fails an
 *       AND / 2oo3 of its members (a cut set of one), with a readable label
 *   C3  probabilities: CCF event = q*beta, independent part = q*(1-beta) (beta-factor definition)
 *   C4  w_TE against the closed-form exact dQ/dt of the beta-factor model with rates
 *       (independent rate lambda*(1-beta), common cause rate lambda*beta): ratio in [0.98, 1.05]
 *       (it was 0.47); the shared-event case stays at about 1.005; a tree without groups is
 *       unchanged (App G Fig G29, 3.75e-14)
 *   C5  generic group variables: a hand-built per-subset MGL variable set (AB, AC, BC, ABC with
 *       members metadata) passed as the exact provider gives the brute-force MCS of 2oo3
 *   C6  the panel's expandCCFCutsets (page copy) gives the same explicit sets, CCF row once
 *   C8  real MGL (fix 3): MCS of a 2oo3 MGL group = brute force, labels "CCF P: A+B", w_TE vs the
 *       exact dQ/dt of an independent MGL model (Q1, Q2, Q3 of NUREG/CR-5485)
 *   C9  periodic latent events sharing an interval (fix 5): w_TE vs the exact mean frequency over
 *       the cycle, Q(tau)/tau, for two and three events (joint time average, not product of averages)
 *   C10 PAND and cold SPARE solved exactly (fix 4): w_TE vs the closed-form failure density
 *   C7  mutation proofs: the old computeFailureFrequency body and the old expandCCFCutsets
 *       behavior, put back, turn C2 / C4 red
 *
 * Run: node tests/regression_ccf_cutsets_freq_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

function engineCtx(src) {
    const ctx = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, Error };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src || read('fta_engine.js'), ctx, { filename: 'fta_engine.js' });
    return ctx.SLFTAEngine;
}
function pageCtx() {
    const p = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date,
        Int32Array, Float64Array, Uint32Array, Uint8Array, Promise, Error, RangeError, TypeError, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        performance: { now: () => Date.now() }, document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) },
        localStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: { userAgent: 'node' },
        SEVERITY_RANK: { Minor: 1, Major: 2, Hazardous: 4, Catastrophic: 5 }, projectConfig: {}, acFhaData: [], systemsData: [], invRegister() {} };
    p.window = p; p.globalThis = p; p.self = p;
    vm.createContext(p);
    for (const f of ['fta_engine.js', 'fta_quant_modules.js', 'engine_modules.js']) vm.runInContext(read(f), p, { filename: f });
    vm.runInContext('var ftaPages = []; var ftaConfig = { exposureTime: 1, mode: "bottom-up" }; var activeFTAPageId = null;', p);
    return p;
}

let _id = 1;
const q = (lam, t) => -Math.expm1(-lam * t);
const be = (lid, lam, t, extra) => Object.assign({ id: _id++, logicalId: lid, displayId: lid, name: 'Event ' + lid, type: 'basic', lambda: lam, probability: q(lam, t), children: [] }, extra || {});
const gate = (gt, kids, extra) => Object.assign({ id: _id++, displayId: 'G' + _id, type: 'gate', gateType: gt, probability: 0, children: kids }, extra || {});
const label = e => e.isCCF ? 'CCF' + (e.members && e.members.length < 99 ? '(' + e.members.slice().sort().join('') + ')' : '') : String(e.logicalId) + (e.isCCFIndependent ? 'i' : '');
const keyset = sets => sets.map(s => s.map(label).sort().join('+')).sort();

// Independent brute force: minimal true assignments of a monotone structure function f(state).
function bruteMCS(vars, f) {
    const n = vars.length, trues = [];
    for (let m = 0; m < (1 << n); m++) { const st = {}; for (let i = 0; i < n; i++) st[vars[i]] = !!((m >> i) & 1); if (f(st)) trues.push(m); }
    const S = new Set(trues);
    return trues.filter(m => { for (let i = 0; i < n; i++) if ((m >> i) & 1) { if (S.has(m & ~(1 << i))) return false; } return true; })
        .map(m => vars.filter((_, i) => (m >> i) & 1).sort().join('+')).sort();
}

const E = engineCtx();
check('SLFTAEngine exports ccfCatalog and explicitCCFCutsets', typeof E.ccfCatalog === 'function' && typeof E.explicitCCFCutsets === 'function');

// ---------------------------------------------------------------- C1 / C2 / C3
console.log('\n[C1-C3] explicit common cause events in the minimal cut sets (beta model)');
const T = 10, LAM = 1e-3, BETA = 0.05;
function mcsOf(root) { return E.explicitCCFCutsets(E.minimalCutsets(E.getCutsets(root)), root); }
{
    _id = 1;
    const A = be('A', LAM, T, { ccfGroup: 'G', beta: BETA }), B = be('B', LAM, T, { ccfGroup: 'G', beta: BETA });
    const root = gate('AND', [A, B]);
    const sets = mcsOf(root);
    const brute = bruteMCS(['Ai', 'Bi', 'CCF(AB)'], s => (s.Ai || s['CCF(AB)']) && (s.Bi || s['CCF(AB)']));
    const got = keyset(sets).map(k => k.replace(/^A(i?)/, 'A$1'));
    check('C1 AND(A,B), beta group: MCS = brute force {CCF}, {A_ind, B_ind}', JSON.stringify(keyset(sets)) === JSON.stringify(brute), 'engine ' + JSON.stringify(got) + ' brute ' + JSON.stringify(brute));
    const ccfRows = sets.filter(s => s.some(e => e.isCCF));
    check('C2 the common cause event is ONE cut set of one', ccfRows.length === 1 && ccfRows[0].length === 1, JSON.stringify(keyset(sets)));
    const ev = ccfRows[0] && ccfRows[0][0];
    check('C2 readable label names the group and its members', ev && /CCF/.test(ev.displayId) && /G/.test(ev.displayId) && /A/.test(ev.name) && /B/.test(ev.name) && ev.sourceGroup === 'G', ev && (ev.displayId + ' / ' + ev.name));
    const qa = q(LAM, T);
    check('C3 CCF event probability = q*beta', ev && Math.abs(ev.probability - qa * BETA) <= 1e-12 * qa, ev && ev.probability + ' vs ' + qa * BETA);
    const ind = sets.find(s => !s.some(e => e.isCCF)) || [];
    check('C3 independent parts carry q*(1-beta) and are labeled (Ind)', ind.length === 2 && ind.every(e => Math.abs(e.probability - qa * (1 - BETA)) <= 1e-12 && / \(Ind\)$/.test(e.displayId)), JSON.stringify(ind.map(e => [e.displayId, e.probability])));
}
{
    _id = 1;
    const mk = id => be(id, LAM, T, { ccfGroup: 'G', beta: BETA });
    const A = mk('A'), B = mk('B'), C = mk('C'), A2 = Object.assign({}, A, { id: 999 });
    const root = gate('OR', [gate('AND', [A, B]), gate('AND', [A2, C])]);
    const sets = mcsOf(root);
    const brute = bruteMCS(['Ai', 'Bi', 'Ci', 'CCF(ABC)'], s => { const a = s.Ai || s['CCF(ABC)'], b = s.Bi || s['CCF(ABC)'], c = s.Ci || s['CCF(ABC)']; return (a && b) || (a && c); });
    check('C1 OR(AND(A,B),AND(A,C)), group {A,B,C}: MCS = brute force', JSON.stringify(keyset(sets)) === JSON.stringify(brute), JSON.stringify(keyset(sets)) + ' vs ' + JSON.stringify(brute));
    check('C2 the common cause event shows once (the old expansion repeated it per cut set)', sets.filter(s => s.some(e => e.isCCF)).length === 1);
}
{
    _id = 1;
    const mk = id => be(id, LAM, T, { ccfGroup: 'V', beta: BETA });
    const root = gate('VOTING', [mk('A'), mk('B'), mk('C')], { votingK: 2 });
    const sets = mcsOf(root);
    const brute = bruteMCS(['Ai', 'Bi', 'Ci', 'CCF(ABC)'], s => [s.Ai || s['CCF(ABC)'], s.Bi || s['CCF(ABC)'], s.Ci || s['CCF(ABC)']].filter(Boolean).length >= 2);
    check('C1 2oo3 voting over a beta group: MCS = brute force', JSON.stringify(keyset(sets)) === JSON.stringify(brute), JSON.stringify(keyset(sets)) + ' vs ' + JSON.stringify(brute));
}
{
    _id = 1;
    const root = gate('AND', [be('X', LAM, T), be('Y', LAM, T)]);
    const raw = E.minimalCutsets(E.getCutsets(root));
    const sets = E.explicitCCFCutsets(raw, root);
    check('C1 a tree without common cause groups comes back unchanged', sets.length === 1 && sets[0] === raw[0]);
}

// ---------------------------------------------------------------- C4
console.log('\n[C4] Vesely-Goldberg w_TE against the closed-form exact dQ/dt');
// Beta-factor model with rates: independent part rate lam*(1-b), common cause rate lam*b.
// Q(t) = Pc + (1-Pc) * Pi^2, Pi = 1-exp(-lam(1-b)t), Pc = 1-exp(-lam b t). dQ/dt analytic.
function exactAndBeta(lam, b, t) {
    const li = lam * (1 - b), lc = lam * b;
    const Pi = q(li, t), Pc = q(lc, t), dPi = li * Math.exp(-li * t), dPc = lc * Math.exp(-lc * t);
    return dPc * (1 - Pi * Pi) + (1 - Pc) * 2 * Pi * dPi;
}
function ratioAndBeta(Eng, lam, b, t) {
    _id = 1;
    const root = gate('AND', [be('A', lam, t, { ccfGroup: 'G', beta: b }), be('B', lam, t, { ccfGroup: 'G', beta: b })]);
    const ff = Eng.computeFailureFrequency(root);
    return { r: ff.wTE / exactAndBeta(lam, b, t), ff };
}
{
    const { r, ff } = ratioAndBeta(E, 1e-3, 0.05, 10);
    check('C4 AND(A,B), beta=0.05: w_TE / exact in [0.98, 1.05] (was 0.47)', r >= 0.98 && r <= 1.05, 'ratio ' + r.toFixed(4));
    check('C4 the result says it includes common cause', ff.includesCCF === true && ff.ccfEvents === 1, JSON.stringify(ff));
    const r2 = ratioAndBeta(E, 1e-5, 0.1, 100).r;
    check('C4 AND(A,B), beta=0.1, lambda=1e-5, t=100: ratio in [0.98, 1.05]', r2 >= 0.98 && r2 <= 1.05, 'ratio ' + r2.toFixed(4));
}
{
    // Shared event: AND(OR(S,A),OR(S,B)); Q = Ps + (1-Ps)PaPb.
    _id = 1;
    const t = 10, ls = 1e-4, la = 1e-3, lb = 2e-3;
    const S1 = be('S', ls, t), S2 = Object.assign({}, S1, { id: 777 });
    const root = gate('AND', [gate('OR', [S1, be('A', la, t)]), gate('OR', [S2, be('B', lb, t)])]);
    const Ps = q(ls, t), Pa = q(la, t), Pb = q(lb, t);
    const dQ = ls * Math.exp(-ls * t) * (1 - Pa * Pb) + (1 - Ps) * (la * Math.exp(-la * t) * Pb + Pa * lb * Math.exp(-lb * t));
    const r = E.computeFailureFrequency(root).wTE / dQ;
    check('C4 shared-event case kept: w_TE / exact about 1.005 (within [1.0, 1.01])', r >= 1.0 && r <= 1.01, 'ratio ' + r.toFixed(4));
}
{
    _id = 1;
    const t = 5, mk = (id, lam) => ({ id, logicalId: id, type: 'basic', lambda: lam, probability: -Math.expm1(-lam * t) });
    const ff = E.computeFailureFrequency({ id: 100, type: 'gate', gateType: 'AND', children: [mk(1, 1e-5), mk(2, 1e-6), mk(3, 5e-5)] });
    check('C4 no groups: ARP4761A App G Fig G29 still 3.75e-14 and no CCF flag', Math.abs(ff.wTE - 3.75e-14) <= 0.02 * 3.75e-14 && ff.ccfEvents === 0, JSON.stringify(ff));
}

// ---------------------------------------------------------------- C5
console.log('\n[C5] generic group variables (one per common cause subset, MGL style metadata)');
{
    _id = 1;
    const mk = id => be(id, LAM, T, { ccfGroup: 'M', beta: BETA });
    const A = mk('A'), B = mk('B'), C = mk('C');
    const root = gate('VOTING', [A, B, C], { votingK: 2 });
    // A hand-built provider: independent variables plus one variable per specific subset.
    const subsets = [['A', 'B'], ['A', 'C'], ['B', 'C'], ['A', 'B', 'C']];
    const fake = () => {
        const varOrder = [A, B, C], varMeta = [{ type: 'indep', node: A }, { type: 'indep', node: B }, { type: 'indep', node: C }], probMap = new Map([[0, 1e-3], [1, 1e-3], [2, 1e-3]]);
        subsets.forEach((s, i) => { varOrder.push(A); varMeta.push({ type: 'group', group: 'M', members: s, k: s.length, label: 'CCF ' + s.join('') }); probMap.set(3 + i, 1e-5 * (i + 1)); });
        return { varOrder, varMeta, probMap, lidToVar: new Map([['A', 0], ['B', 1], ['C', 2]]) };
    };
    const sets = E.explicitCCFCutsets(E.minimalCutsets(E.getCutsets(root)), root, { computeExact: fake });
    const v = ['Ai', 'Bi', 'Ci', 'CCF(AB)', 'CCF(AC)', 'CCF(BC)', 'CCF(ABC)'];
    const brute = bruteMCS(v, s => {
        const a = s.Ai || s['CCF(AB)'] || s['CCF(AC)'] || s['CCF(ABC)'], b = s.Bi || s['CCF(AB)'] || s['CCF(BC)'] || s['CCF(ABC)'], c = s.Ci || s['CCF(AC)'] || s['CCF(BC)'] || s['CCF(ABC)'];
        return [a, b, c].filter(Boolean).length >= 2;
    });
    check('C5 per-subset variables: MCS = brute force (each subset event a cut set of one)', JSON.stringify(keyset(sets)) === JSON.stringify(brute), JSON.stringify(keyset(sets)) + ' vs ' + JSON.stringify(brute));
    const labels = sets.filter(s => s.length === 1 && s[0].isCCF).map(s => s[0].displayId).sort();
    check('C5 the variable\'s own label is used', JSON.stringify(labels) === JSON.stringify(['CCF AB', 'CCF ABC', 'CCF AC', 'CCF BC']), JSON.stringify(labels));
    const ab = sets.find(s => s.length === 1 && s[0].displayId === 'CCF AB');
    check('C5 the event takes the variable\'s own probability', ab && ab[0].probability === 1e-5);
}

// ---------------------------------------------------------------- C6
console.log('\n[C6] the panel\'s expandCCFCutsets (page stack)');
{
    const P = pageCtx();
    _id = 1;
    const A = be('A', LAM, T, { ccfGroup: 'G', beta: BETA }), B = be('B', LAM, T, { ccfGroup: 'G', beta: BETA }), X = be('X', 2e-3, T);
    const root = gate('OR', [gate('AND', [A, B]), gate('AND', [A, X])]);
    P.__root = root;
    const sets = vm.runInContext('expandCCFCutsets(SLFTAEngine.minimalCutsets(getCutsets(__root)), __root)', P);
    const brute = bruteMCS(['Ai', 'Bi', 'X', 'CCF(AB)'], s => ((s.Ai || s['CCF(AB)']) && (s.Bi || s['CCF(AB)'])) || ((s.Ai || s['CCF(AB)']) && s.X));
    check('C6 page expandCCFCutsets = brute force MCS', JSON.stringify(keyset(sets)) === JSON.stringify(brute), JSON.stringify(keyset(sets)) + ' vs ' + JSON.stringify(brute));
    check('C6 CCF row appears once', sets.filter(s => s.some(e => e.isCCF)).length === 1);
    // Rare-event sum over the explicit sets vs the exact P(top) of the page BDD: same model.
    const exact = vm.runInContext('computeExactProbability(__root).prob', P);
    const sum = sets.reduce((acc, s) => acc + s.reduce((a, e) => a * e.probability, 1), 0);
    check('C6 the MCS sum is an upper bound within 1% of the exact P(top) (the CCF term is in it)', sum >= exact && sum <= exact * 1.01, 'sum ' + sum + ' exact ' + exact);
}

// ---------------------------------------------------------------- C7
console.log('\n[C7] mutation proofs');
{
    const src = read('fta_engine.js');
    const mutated = src.replace('cutsets = explicitCCFCutsets(minimalCutsets(getCutsets(rootNode)), rootNode, opts);', 'cutsets = minimalCutsets(getCutsets(rootNode));');
    check('C7 mutation applied (old w_TE body)', mutated !== src);
    const M = engineCtx(mutated);
    const r = ratioAndBeta(M, 1e-3, 0.05, 10).r;
    check('C7 with the old body, C4 goes red (ratio about 0.47)', !(r >= 0.98 && r <= 1.05) && r < 0.6, 'ratio ' + r.toFixed(4));
    const m2 = src.replace('var cat = ccfCatalog(rootNode, { computeExact: opts.computeExact, sets: sets });', 'var cat = null;');
    check('C7 mutation applied (no explicit expansion)', m2 !== src);
    const M2 = engineCtx(m2);
    _id = 1;
    const root = gate('AND', [be('A', LAM, T, { ccfGroup: 'G', beta: BETA }), be('B', LAM, T, { ccfGroup: 'G', beta: BETA })]);
    const sets = M2.explicitCCFCutsets(M2.minimalCutsets(M2.getCutsets(root)), root);
    check('C7 without the expansion, C2 goes red (no common cause event in the cut sets)', !sets.some(s => s.some(e => e.isCCF)));
}

// ---------------------------------------------------------------- C8-C10 (merged with fixes 3, 4, 5)
console.log('\n[C8] real MGL (fix 3): per-subset common cause events, labels, w_TE');
{
    // 2-of-3 MGL group, m = 3: Q1 = (1-b)Qt, Q2 = b(1-g)/2 Qt (each pair), Q3 = b g Qt (NUREG/CR-5485).
    const b = 0.1, gm = 0.4, lam = 1e-3;
    const tree = t => { _id = 1; const G = { ccfGroup: 'P', beta: b, gamma: gm, ccfModel: 'mgl' }; return gate('VOTING', ['A', 'B', 'C'].map(x => be(x, lam, t, G)), { votingK: 2 }); };
    const root = tree(10);
    const sets = mcsOf(root);
    const v = ['Ai', 'Bi', 'Ci', 'CCF(AB)', 'CCF(AC)', 'CCF(BC)', 'CCF(ABC)'];
    const fail = s => { const a = s.Ai || s['CCF(AB)'] || s['CCF(AC)'] || s['CCF(ABC)'], bb = s.Bi || s['CCF(AB)'] || s['CCF(BC)'] || s['CCF(ABC)'], c = s.Ci || s['CCF(AC)'] || s['CCF(BC)'] || s['CCF(ABC)']; return [a, bb, c].filter(Boolean).length >= 2; };
    check('C8 MGL 2oo3: MCS = brute force (4 subset events alone, 3 independent pairs)', JSON.stringify(keyset(sets)) === JSON.stringify(bruteMCS(v, fail)), JSON.stringify(keyset(sets)));
    const ab = sets.find(s => s.length === 1 && s[0].isCCF && JSON.stringify(s[0].members) === '["A","B"]');
    check('C8 the event reads "CCF P: A+B" and keeps the model metadata', ab && ab[0].name === 'CCF P: A+B' && ab[0].ccf && ab[0].ccf.k === 2, ab && ab[0].name);
    const P = (t) => { const Qt = q(lam, t), pr = { Ai: (1 - b) * Qt, Bi: (1 - b) * Qt, Ci: (1 - b) * Qt, 'CCF(AB)': b * (1 - gm) / 2 * Qt, 'CCF(AC)': b * (1 - gm) / 2 * Qt, 'CCF(BC)': b * (1 - gm) / 2 * Qt, 'CCF(ABC)': b * gm * Qt };
        let tot = 0; for (let m = 0; m < 128; m++) { const st = {}; let w = 1; v.forEach((k, i) => { const on = !!((m >> i) & 1); st[k] = on; w *= on ? pr[k] : 1 - pr[k]; }); if (fail(st)) tot += w; } return tot; };
    check('C8 independent MGL model agrees with the engine P(top) (sanity of the reference)', Math.abs(E.computeExactProbability(root).prob / P(10) - 1) < 1e-9, E.computeExactProbability(root).prob + ' vs ' + P(10));
    const dQ = (P(10 + 1e-3) - P(10 - 1e-3)) / 2e-3;
    const ff = E.computeFailureFrequency(root);
    check('C8 w_TE / exact dQ/dt in [0.98, 1.05] with 4 common cause events', ff.ccfEvents === 4 && ff.wTE / dQ >= 0.98 && ff.wTE / dQ <= 1.05, (ff.wTE / dQ).toFixed(4));
}
console.log('\n[C9] periodic latent events sharing an interval (fix 5): joint time average in w_TE');
function latentRatio(Eng, n) {
    _id = 1; const lam = 1e-4, tau = 1000;
    const per = i => ({ id: _id++, logicalId: 'L' + i, displayId: 'L' + i, type: 'basic', lambda: lam, repairModel: 'periodic', tau: tau, probability: 1 - (-Math.expm1(-lam * tau)) / (lam * tau), children: [] });
    const root = gate('AND', Array.from({ length: n }, (_, i) => per(i)));
    return Eng.computeFailureFrequency(root).wTE / (Math.pow(q(lam, tau), n) / tau);   // exact mean frequency over the cycle: Q(tau)/tau
}
{
    const r2 = latentRatio(E, 2), r3 = latentRatio(E, 3);
    check('C9 two latent events, one interval: w_TE / exact mean frequency in [0.98, 1.1]', r2 >= 0.98 && r2 <= 1.1, r2.toFixed(4));
    check('C9 three latent events: in [0.98, 1.12] (the product of averages gave 0.81)', r3 >= 0.98 && r3 <= 1.12, r3.toFixed(4));
}
console.log('\n[C10] PAND and cold SPARE solved exactly (fix 4): ordered frequency');
{
    const lx = 1e-3, ly = 2e-3, t = 10;
    _id = 1;
    const pand = gate('PAND', [be('X', lx, t), be('Y', ly, t)]);
    const exactP = ly * Math.exp(-ly * t) * q(lx, t);                       // X already failed when Y fails
    const rp = E.computeFailureFrequency(pand).wTE / exactP;
    check('C10 PAND(X,Y): w_TE / exact in [0.98, 1.05] (the AND treatment gave 2.04)', rp >= 0.98 && rp <= 1.05, rp.toFixed(4));
    _id = 1;
    const spare = gate('SPARE', [be('X', lx, t), be('Y', ly, t)]);
    const exactS = lx * ly / (ly - lx) * (Math.exp(-lx * t) - Math.exp(-ly * t));   // density of TX + TY
    const rs = E.computeFailureFrequency(spare).wTE / exactS;
    check('C10 cold SPARE(X,Y): w_TE / exact in [0.98, 1.05]', rs >= 0.98 && rs <= 1.05, rs.toFixed(4));
}
{
    const src = read('fta_engine.js');
    const m3 = src.replace("if (byTau) for (var tk in byTau) { var c = byTau[tk]; if (c >= 2) prod *= Math.pow(2, c) / (c + 1); }", '');
    check('C9 mutation applied (joint average removed)', m3 !== src);
    const r3 = latentRatio(engineCtx(m3), 3);
    check('C9 mutation: with the product of averages, three latent events go red (non-conservative)', r3 < 0.98, r3.toFixed(4));
    const m4 = src.replace('if (pos && pj != null && pj < maxPos) continue;', '');
    const M4 = engineCtx(m4); _id = 1;
    const r4 = M4.computeFailureFrequency(gate('PAND', [be('X', 1e-3, 10), be('Y', 2e-3, 10)])).wTE / (2e-3 * Math.exp(-2e-3 * 10) * q(1e-3, 10));
    check('C10 mutation: counting an earlier input as completing the sequence goes red', m4 !== src && r4 > 1.05, r4.toFixed(4));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

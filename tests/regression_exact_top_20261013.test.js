#!/usr/bin/env node
/*
 * Regression: one EXACT top-event number on every pass/fail screen
 * (fault tree math audit 12 Oct 2026, finding F1; agreed fix 1).
 *
 * FOUND: calculateAllProbabilities swapped the exact BDD top into root.probability
 *   only on the ACTIVE page and only when the tree had repeated logicalIds. A
 *   common cause (beta) group has no repeated ids, so its term never reached
 *   root.probability on any page, and every page that was not open kept the
 *   independent gate-by-gate roll-up even with shared events. Screens that make
 *   pass/fail statements read root.probability: the FHA requirement verification
 *   lane, INV-03, the SSA page budget pairs, the safety-significant events export,
 *   the MMEL dispatch check and the canvas top label. Audit T4: AND(A,B) with
 *   lambda 1e-4/h and beta 0.05 showed 1.0e-8 against an exact 5.0e-6, and the
 *   requirement check said "PASS 1.00e-8/hr" on a Hazardous (1e-7/FH) condition
 *   while the Budget Ledger said EXCEEDS.
 *
 * FIX: top_basis.js (SLTopBasis.exactTop) is the ONE exact top-event function,
 *   the cached BDD (common cause and shared events included) on any page. Every
 *   pass/fail consumer calls it. calculateAllProbabilities puts that same value on
 *   root.probability of every RESULT page (open or not); ALLOCATION pages keep the
 *   engineer's budget, with the exact reconstruction on _bddActualProb. Gate-by-gate
 *   values stay on intermediate gates, for display only. A BDD refusal withholds the
 *   verdict instead of falling back to the independent roll-up.
 *
 * EXECUTED: the REAL site files in a vm (fta_engine, top_basis, fta_quant_modules,
 *   engine_modules, the real helper / view / support functions, safety_targets,
 *   budget_ledger, invariants, pssa_ssa_pages, sse_export, mmel_module). Every
 *   expected number is INDEPENDENT of the engine: full enumeration of the Boolean
 *   structure over the textbook beta-factor model (each member = independent part
 *   (1-beta)q OR the shared common cause event beta*q, NUREG/CR-5485 with two
 *   members) and of shared events (one variable per physical event).
 *   Mutation proofs: the same scenarios with the fix reverted (the old active-page /
 *   repeated-id-only swap, and consumers reading root.probability) go red.
 *
 * Run: node tests/regression_exact_top_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function fnText(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing function ' + name);
    let d = 0; const j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
    throw new Error('unbalanced ' + name);
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

// ---- the page, from the real files ----------------------------------------------------------
function page() {
    const p = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date,
        Int32Array, Float64Array, Uint32Array, Uint8Array, Promise, Error, RangeError, TypeError, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        performance: { now: () => Date.now() },
        document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) },
        localStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: { userAgent: 'node' },
        SEVERITY_RANK: { Minor: 1, Major: 2, Hazardous: 4, Catastrophic: 5 } };
    p.window = p; p.globalThis = p; p.self = p;
    vm.createContext(p);
    const run = (s, f) => vm.runInContext(s, p, { filename: f || 'inline' });
    run(`var projectConfig = { regulation: 'Part 25', missionDuration: 1 }; var acFhaData = []; var systemsData = []; var flightPhasesData = [];
         var ftaPages = []; var ftaConfig = { exposureTime: 1, mode: 'bottom-up', linkedFhaId: '' }; var activeFTAPageId = null;`);
    for (const f of ['fta_engine.js', 'top_basis.js', 'fta_quant_modules.js', 'engine_modules.js']) run(read(f), f);
    const H = read('helpers_modules.js'), S = read('support_modules.js'), V = read('fta_view_modules.js'), B = read('bindings_modules.js');
    run(H, 'helpers_modules.js');   // pure runtime declarations (allocator, shared-event helpers, populated rule)
    ['getSafetyTarget', 'parseDurationToHours', '_missionProfiles', '_missionProfilePhases', '_activeTreeMissionPhases', '_phaseIsSpecial'].forEach(n => run(fnText(S, n)));
    ['_findVerificationMirror', '_missionHoursForNormalization', 'getAutoReqVerificationEvidence', 'getRootAncestorPageOfActive', 'getRootAncestorPage'].forEach(n => run(fnText(V, n)));
    run(fnText(B, 'isSpecialPhase').replace('_SPECIAL_PHASE_NAMES[n]', 'false'));
    run(read('safety_targets.js').replace(/^const /gm, 'var '), 'safety_targets.js');
    run('function canonRegulation(r){ return r; } function getAllSysFha(){ return []; }');
    for (const f of ['budget_ledger.js', 'invariants.js', 'pssa_ssa_pages.js', 'sse_export.js']) run(read(f), f);
    p.run = run;
    return p;
}

// ---- independent reference: enumeration over the beta-factor model --------------------------
// vars: one per physical event (logicalId) for its INDEPENDENT part, one per common cause group.
function reference(root, t) {
    const vars = new Map();      // name -> probability
    const leafOf = [];
    (function walk(n) {
        if (n.type === 'gate') { (n.children || []).forEach(walk); return; }
        const q = n.lambda != null ? -Math.expm1(-n.lambda * t) : n.probability;
        const b = n.ccfGroup ? n.beta : 0;
        vars.set('ind:' + n.logicalId, q * (1 - b));
        if (n.ccfGroup) vars.set('ccf:' + n.ccfGroup, q * b);
    })(root);
    const names = [...vars.keys()], N = names.length;
    function ev(n, st) {
        if (n.type !== 'gate') return st['ind:' + n.logicalId] || (n.ccfGroup ? st['ccf:' + n.ccfGroup] : false);
        const v = n.children.map(c => ev(c, st));
        if (n.gateType === 'AND') return v.every(Boolean);
        if (n.gateType === 'OR') return v.some(Boolean);
        if (n.gateType === 'VOTING') return v.filter(Boolean).length >= n.votingK;
        throw new Error('gate ' + n.gateType);
    }
    let P = 0;
    for (let m = 0; m < (1 << N); m++) {
        const st = {}; let w = 1;
        for (let i = 0; i < N; i++) { const on = !!((m >> i) & 1); st[names[i]] = on; const pv = vars.get(names[i]); w *= on ? pv : 1 - pv; }
        if (ev(root, st)) P += w;
    }
    return P;
}

let _id = 1;
const L = (lid, lam, extra) => Object.assign({ id: _id++, logicalId: lid, name: 'E' + lid, displayId: 'BE-' + lid, type: 'basic', lambda: lam, children: [] }, extra || {});
const G = (gt, kids, extra) => Object.assign({ id: _id++, type: 'gate', gateType: gt, name: 'G', displayId: 'G-' + _id, probability: 0, children: kids }, extra || {});
const ccfTree = () => G('AND', [L('A', 1e-4, { ccfGroup: 'CG', beta: 0.05 }), L('B', 1e-4, { ccfGroup: 'CG', beta: 0.05 })]);
const sharedTree = () => G('AND', [G('OR', [L('S', 1e-5), L('A2', 1e-4)]), G('OR', [L('S', 1e-5), L('B2', 1e-4)])]);
const mixedTree = () => G('OR', [G('AND', [L('C', 2e-4, { ccfGroup: 'K', beta: 0.1 }), L('D', 2e-4, { ccfGroup: 'K', beta: 0.1 })]),
    G('AND', [G('OR', [L('S3', 3e-6), L('E', 5e-5)]), G('OR', [L('S3', 3e-6), L('F', 5e-5)])]), L('H', 1e-9)]);

// ---- E1 the open page shows the exact top; a page not on screen is exact on demand ----------------
console.log('\n[E1] root.probability on the open page, SLTopBasis.exactTop on every page');
{
    for (const [label, mk] of [['common cause AND (beta 0.05)', ccfTree], ['shared event AND(OR(S,A),OR(S,B))', sharedTree], ['common cause + shared events + independent leaf', mixedTree]]) {
        for (const active of [true, false]) {
            const P = page();
            P.__t = mk();
            P.run(`ftaPages = [ { id: 'X', name: 'other', mode: 'bottom-up', root: { id: 9001, type: 'gate', gateType: 'OR', children: [ { id: 9002, logicalId: 'z', type: 'basic', lambda: 1e-6, children: [] } ] } },
                                { id: 'M', name: 'tree', mode: 'bottom-up', root: __t } ]; activeFTAPageId = ${active ? "'M'" : "'X'"};`);
            P.run('calculateAllProbabilities()');
            const want = reference(P.__t, 1);
            if (active) check(`E1: ${label}, page open: root.probability equals enumeration (rel < 1e-9)`, rel(P.__t.probability, want) < 1e-9, P.__t.probability + ' vs ' + want);
            else check(`E1: ${label}, page NOT open: lazily left uncomputed, marked as a roll-up, and SLTopBasis.exactTop equals enumeration`,
                P.__t._topIsRollup === true && rel(P.SLTopBasis.exactTop(P.__t), want) < 1e-9, P.__t._topIsRollup + ' ' + P.SLTopBasis.exactTop(P.__t) + ' vs ' + want);
        }
    }
    // the gate-by-gate value stays on intermediate gates (display) and on _bddBottomUpProb for transparency
    const P = page(); P.__t = ccfTree();
    P.run(`ftaPages = [ { id: 'M', name: 'tree', mode: 'bottom-up', root: __t } ]; activeFTAPageId = 'M';`);
    P.run('calculateAllProbabilities()');
    const q = -Math.expm1(-1e-4);
    check('E1: the independent roll-up is kept on root._bddBottomUpProb (q^2), the exact value on root.probability', rel(P.__t._bddBottomUpProb, q * q) < 1e-9 && rel(P.__t.probability, reference(P.__t, 1)) < 1e-9, P.__t._bddBottomUpProb);
    const Pm = page(); Pm.__t = mixedTree();
    Pm.run(`ftaPages = [ { id: 'M', name: 'tree', mode: 'bottom-up', root: __t } ]; activeFTAPageId = 'M';`);
    Pm.run('calculateAllProbabilities()');
    const inner = Pm.__t.children[0], qc = -Math.expm1(-2e-4);
    check('E1: an intermediate gate keeps its gate-by-gate display value (not replaced)', rel(inner.probability, qc * qc) < 1e-9, inner.probability);
}

// ---- E2 allocation pages keep the engineer's budget; transfer subtrees are not overwritten ---------
console.log('\n[E2] allocation role');
{
    const P = page();
    P.__a = G('AND', [L('p', null, { probability: 3.16e-5 }), L('q', null, { probability: 3.16e-5 }), G('TRANSFER', [], { transferOutTo: 'SUB' })]);
    P.__a.children.forEach(c => { if (c.lambda === null) delete c.lambda; });
    P.__sub = G('OR', [L('s1', null, { probability: 1e-3 })]); delete P.__sub.children[0].lambda;
    P.__m = ccfTree();
    // The mirror was last quantified while open in bottom-up (top-down mode recomputes only the
    // allocation chain, as before; the leaves of other pages keep their last computed values).
    P.run(`ftaPages = [ { id: 'M', name: 'mirror', verifies: 'A', mode: 'bottom-up', root: __m } ]; activeFTAPageId = 'M'; calculateAllProbabilities();`);
    P.run(`ftaConfig = { exposureTime: 1, mode: 'top-down', targetP: 1e-9, linkedFhaId: '', apportion: 'equal' };
           ftaPages = [ { id: 'A', name: 'alloc', mode: 'top-down', root: __a }, { id: 'SUB', name: 'sub', mode: 'top-down', root: __sub },
                        { id: 'M', name: 'mirror', verifies: 'A', mode: 'bottom-up', root: __m } ]; activeFTAPageId = 'A';
           function _fhaExposureContext(){ return null; }`);
    P.run('calculateAllProbabilities()');
    const budget = -Math.expm1(-1e-9 * 1);
    check('E2: the open allocation tree keeps the engineer\'s budget on its root', rel(P.__a.probability, budget) < 1e-9, P.__a.probability);
    check('E2: the transfer subtree page keeps its allocated budget (not replaced by an exact recomposition)', P.__sub.probability > 0 && P.__sub._bddExactProb === undefined, JSON.stringify({ p: P.__sub.probability, x: P.__sub._bddExactProb }));
    check('E2: the open allocation tree carries the exact reconstruction on _bddActualProb', typeof P.__a._bddActualProb === 'number' && P.__a._bddActualProb > 0);
    check('E2: the verification mirror (not open) answers the exact top with its common cause term through SLTopBasis.exactTop', rel(P.SLTopBasis.exactTop(P.__m), reference(P.__m, 1)) < 1e-9);
}

// ---- E3 every pass/fail consumer reads the exact number ------------------------------------------
console.log('\n[E3] pass/fail consumers');
function project() {
    const P = page();
    // Hazardous objective 1e-7/FH, 1 h flight. Allocation leaves recompose to 1e-7 (independent, no CCF).
    P.__a = G('AND', [L('A', null, { probability: Math.sqrt(1e-7) }), L('B', null, { probability: Math.sqrt(1e-7) })]);
    P.__a.children.forEach(c => delete c.lambda);
    P.__m = ccfTree();
    P.run(`acFhaData = [{ internalId: 9, fcId: 'FC-9', fcDesc: 'Loss of pitch', severity: 'Hazardous' }];
           ftaPages = [ { id: 'A', name: 'alloc', mode: 'top-down', linkedFhaIds: ['9', 'AC_9'], root: __a },
                        { id: 'M', name: 'mirror', verifies: 'A', mode: 'bottom-up', linkedFhaIds: ['9'], root: __m } ];
           activeFTAPageId = 'A'; ftaConfig = { exposureTime: 1, mode: 'bottom-up', linkedFhaId: '' };`);
    P.run('calculateAllProbabilities()');
    return P;
}
{
    const P = project();
    const exact = reference(P.__m, 1);                        // ≈ 5.009e-6, independent
    const ev = P.run(`getAutoReqVerificationEvidence({ reqSource: { generator: 'fha', context: { fcId: 'FC-9', severity: 'Hazardous' } } })`);
    check('E3: requirement verification FAILS a Hazardous 1e-7/FH condition (exact 5.0e-6 incl. common cause)', ev.state === 'fail' && rel(ev.actual, exact) < 1e-9, ev.label);
    const led = P.run('budgetLedgerRows()')[0];
    check('E3: the Budget Ledger agrees (EXCEEDS, same exact number)', led.status === 'EXCEEDS-objective' && rel(led.achievedPerFlight, exact) < 1e-9, led.status + ' ' + led.achievedPerFlight);
    // INV-03: allocated (exact recomposition 1e-7) vs achieved (exact 5.0e-6) must FAIL; the old naive mirror value (1e-8) passed.
    const inv = P.run('invRun()').results.find(r => r.id === 'INV-03');
    check('E3: INV-03 flags the mirror above its allocated budget (exact both sides)', inv && !inv.pass && inv.checked === 1, JSON.stringify(inv));
    // pin the root of a page that is NOT open to its stale independent value: consumers must not read it
    P.__m.probability = 1e-12;
    const inv2 = P.run('invRun()').results.find(r => r.id === 'INV-03');
    const ev2 = P.run(`getAutoReqVerificationEvidence({ reqSource: { generator: 'fha', context: { fcId: 'FC-9', severity: 'Hazardous' } } })`);
    check('E3: a stale root.probability changes no verdict (INV-03 and the requirement lane read the exact function)', !inv2.pass && ev2.state === 'fail' && rel(ev2.actual, exact) < 1e-9);
    // SSA page pairs
    P.run(`systemsData = [{ id: 'S1', name: 'Pitch', fha: [] }]; ftaPages.forEach(p => p.systemId = 'S1');`);
    const ssa = P.run('ssaPageData()')[0];
    check('E3: the SSA page budget pair is NOT ok (exact mirror 5.0e-6 over 1e-7 allocated)', ssa.pairs.length === 1 && ssa.pairs[0].ok === false && rel(ssa.pairs[0].actual, exact) < 1e-9, JSON.stringify(ssa.pairs));
    // safety-significant events export: the argued rate is the exact top of the allocation tree per flight hour
    const sse = P.run('sseRows()').find(r => r.id === 'FC-9');
    const allocExact = reference(P.__a, 1), allocRate = -Math.log1p(-allocExact) / 1;
    check('E3: the SSE export argues the exact allocation top per flight hour', sse && new RegExp('argued ' + allocRate.toExponential(2).replace('.', '\\.') + '/FH').test(sse.expectation), sse && sse.expectation);
}

// ---- E4 a refusal withholds the verdict ---------------------------------------------------------
console.log('\n[E4] BDD refusal');
{
    const P = project();
    P.run(`exactTopProbability = function () { const e = new Error('too big'); e.name = 'BDDExplosionError'; throw e; };`);
    const ev = P.run(`getAutoReqVerificationEvidence({ reqSource: { generator: 'fha', context: { fcId: 'FC-9', severity: 'Hazardous' } } })`);
    check('E4: the requirement lane states no PASS or FAIL when the exact engine refuses', ev.state === 'awaiting' && /unavailable/i.test(ev.label), ev.label);
    const led = P.run('budgetLedgerRows()')[0];
    check('E4: the Budget Ledger shows the row as unverified, not as a pass from the roll-up', led.status === 'unverified', led.status);
    P.run(`activeFTAPageId = 'M'; calculateAllProbabilities();`);
    check('E4: calculateAllProbabilities survives a refusal on the open page and marks the root', P.__m._exactTopRefused === true && P.__m._topIsRollup === true);
}

// ---- E5 MMEL dispatch check uses the exact top ---------------------------------------------------
console.log('\n[E5] MMEL');
{
    const P = page();
    // Hazardous FC; tree AND(A,B) with a common cause group, plus the MMEL item M in an OR.
    P.__t = G('OR', [G('AND', [L('A', 1e-4, { ccfGroup: 'CG', beta: 0.05 }), L('B', 1e-4, { ccfGroup: 'CG', beta: 0.05 })]), G('AND', [L('M', 1e-3, { displayId: 'MM-1' }), L('N', 1e-6)])]);
    P.run(`acFhaData = [{ internalId: 3, fcId: 'FC-3', severity: 'Hazardous' }];
           ftaPages = [ { id: 'T', name: 'tree', mode: 'bottom-up', linkedFhaId: 3, root: __t } ]; activeFTAPageId = 'T';
           projectConfig.mmel = { items: [], budgetShare: 0.1 };
           // the RAM-thread lookups the MMEL module reads (stubs: find the event by displayId, page -> FC map)
           function _fmesFindBe(ref) { let hit = null; (function w(n) { if (!n || hit) return; if (n.displayId === ref) hit = n; (n.children || []).forEach(w); })(ftaPages[0].root); return hit ? { node: hit } : null; }
           window._ramPageFcMap = () => new Map([['T', new Set(['3'])]]);`);
    P.run(read('mmel_module.js'), 'mmel_module.js');
    P.run('calculateAllProbabilities()');
    let quant = null;
    try { quant = P.run(`_mmelQuantitative('MM-1')`); } catch (e) { quant = { err: String(e) }; }
    // independent: dispatched = M certain -> top = OR(AND_ccf(A,B), N)
    const base = reference(P.__t, 1);
    const disp = reference(G('OR', [G('AND', [L('A', 1e-4, { ccfGroup: 'CG', beta: 0.05 }), L('B', 1e-4, { ccfGroup: 'CG', beta: 0.05 })]), L('N', 1e-6)]), 1);
    check('E5: MMEL baseline and dispatched tops are the exact values (common cause included)', quant && rel(quant.base, base) < 1e-9 && rel(quant.dispatched, disp) < 1e-9, JSON.stringify(quant));
    check('E5: MMEL dispatched state is judged against the per-flight budget of 1e-7/FH (exceeds)', quant && quant.withinTarget === false, JSON.stringify(quant));
}

// ---- E6 performance: cached, an unchanged page is not rebuilt -----------------------------------
console.log('\n[E6] cost on a large project');
{
    const P = page();
    let s = 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const mk = (d, pg) => {
        if (d === 0) { const r = rnd(); return r < 0.15 ? L('S' + (pg % 7), 1e-5) : r < 0.25 ? L('c' + pg + '_' + _id, 1e-4, { ccfGroup: 'K' + pg, beta: 0.05 }) : L('u' + _id, 1e-5 * (1 + rnd())); }
        const kids = []; for (let i = 0; i < 3; i++) kids.push(mk(d - 1, pg));
        return G(rnd() < 0.5 ? 'AND' : 'OR', kids);
    };
    P.__pages = []; for (let i = 0; i < 150; i++) P.__pages.push({ id: 'P' + i, name: 'T' + i, mode: 'bottom-up', root: mk(4, i) });   // 150 trees x 121 nodes
    // The open page (P0) is plain: the open page's existing intermediate-gate normalization
    // (Phase 56.44, its own uncached subtree diagrams) is not what this measures.
    P.__pages[0].root = G('OR', [L('o1', 1e-5), L('o2', 1e-5)]);
    P.run(`ftaPages = __pages; activeFTAPageId = 'P0';`);
    let builds = 0; const real = P.buildBDDFromFT; P.buildBDDFromFT = function () { builds++; return real.apply(this, arguments); };
    let t0 = Date.now(); P.run('calculateAllProbabilities()'); const first = Date.now() - t0;
    check('E6: a recompute computes the exact top only for the page on screen (lazy compute)', builds <= 1, 'builds=' + builds + ' in ' + first + ' ms');
    // the verdict screens ask for every tree: computed once, then cached
    builds = 0;
    const tops = () => P.__pages.map(pg => P.SLTopBasis.exactTop(pg.root));
    t0 = Date.now(); tops(); const sweep1 = Date.now() - t0; const b1 = builds; builds = 0;
    t0 = Date.now(); const again = tops(); const sweep2 = Date.now() - t0;
    check('E6: a verdict sweep over 150 trees builds each tree once', b1 === 149, 'builds=' + b1 + ' in ' + sweep1 + ' ms');
    check('E6: the same sweep again builds NO decision diagram (cache)', builds === 0, 'builds=' + builds + ' in ' + sweep2 + ' ms');
    builds = 0;
    (function f(n) { if (n.type !== 'gate') { n.lambda = n.lambda * 2; return true; } return n.children.some(f); })(P.__pages[37].root);
    P.run('calculateAllProbabilities()'); builds = 0; tops();
    check('E6: after an edit to one tree only that tree is rebuilt', builds === 1, 'builds=' + builds);
    check('E6: a cached sweep of 150 trees stays fast (< 1.5 s)', sweep2 < 1500, sweep2 + ' ms');
    void again;
}

// ---- mutation proofs: revert the fix and the scenarios go red ------------------------------------
console.log('\n[M] mutation proofs');
{
    // M1: the OLD swap (active page only, repeated logicalIds only).
    const P = page();
    P.run(`_slApplyExactTops = function () {
        const activePage = ftaPages.find(p => p.id === activeFTAPageId);
        if (activePage && activePage.root && _hasRepeatedLogicalIds(activePage.root)) {
            const exact = computeExactProbability(activePage.root);
            activePage.root.probability = exact.prob;
        }
    };`);
    P.__t = ccfTree();
    P.run(`ftaPages = [ { id: 'M', name: 'tree', mode: 'bottom-up', root: __t } ]; activeFTAPageId = 'M';`);
    P.run('calculateAllProbabilities()');
    check('M1: with the old swap the common cause tree shows the independent value (the test above would fail)', rel(P.__t.probability, reference(P.__t, 1)) > 0.5, P.__t.probability);
    // M2: a consumer reading root.probability (the old requirement lane) on a stale root
    const Q = project();
    Q.__m.probability = 1e-8;   // what the old roll-up held
    Q.run(`SLTopBasis.exactTop = function (r) { return r ? r.probability : null; };`);
    const ev = Q.run(`getAutoReqVerificationEvidence({ reqSource: { generator: 'fha', context: { fcId: 'FC-9', severity: 'Hazardous' } } })`);
    check('M2: a requirement lane fed root.probability says PASS on a 5.0e-6 tree (the test above would fail)', ev.state === 'pass', ev.label);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

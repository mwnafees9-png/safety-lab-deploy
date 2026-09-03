#!/usr/bin/env node
/*
 * Regression — markov_ctmc.js v1.0 (ARP-G3: full CTMC — transient +
 * refusals + cited benchmarks).
 *
 * Loads the REAL quant lane (fta_quant_modules.js) and the REAL module in
 * one shared eval scope and locks:
 *   [1] closed forms to 1e-12: pure death 1−e^{−λt}; repairable
 *       λ/(λ+μ)·(1−e^{−(λ+μ)t}); Σπ(t) = 1; the receipt states method,
 *       Λ, term count and tolerance.
 *   [2] underflow-proof: Λt ≈ 2·10⁴ (e^{−Λt} = 0 in doubles) still agrees
 *       with the steady solver to 1e-9 via mode-centred weights.
 *   [3] refusals with names: unknown state, non-positive rate, duplicate
 *       names, self-loop, < 2 states, bad initial, term-cap exceeded —
 *       never a silent degrade. Λ=0 and t=0 return π(0) honestly.
 *   [4] the mission-time wire-in: a VALID Markov-attached event now
 *       quantifies TRANSIENT at exposure time (less than steady for a
 *       repairable chain); an INVALID model keeps the previous steady
 *       behavior (numbers never change silently under an error);
 *       non-Markov nodes are untouched.
 *   [5] benchmarks all pass WITH the steady solver present; citations
 *       carried; renderMarkovModels + effectiveProb wrapped exactly once.
 *   [6] wiring: index.html loads the module after fta_quant_modules.
 *
 * Run:  node tests/regression_markov_ctmc.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const approx = (a, b, tol) => Math.abs(a - b) <= tol;
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- shared-scope load ------------------------------------------------------
globalThis.window = globalThis;
globalThis.esc = s => String(s);
globalThis.ftaConfig = { exposureTime: 10 };
globalThis.projectConfig = { markovModels: [] };
globalThis.acFhaData = []; globalThis.systemsData = []; globalThis.flightPhasesData = [];
globalThis.getAllSysFha = () => [];
(0, eval)(['engine_modules.js', 'fta_quant_modules.js', 'markov_ctmc.js'].map(f => S(f)).join('\n;\n'));
const G = globalThis;

const REP = (lam, mu) => ({ states: [{ name: 'Up' }, { name: 'Down', isFailed: true }],
    transitions: [{ from: 'Up', to: 'Down', rate: lam }].concat(mu ? [{ from: 'Down', to: 'Up', rate: mu }] : []) });

console.log('\n[1] closed forms');
const lam = 1.7e-4, t1 = 350;
let r = G.solveMarkovTransient(REP(lam, 0), t1);
check('pure death: P(t) = 1 − e^{−λt} to 1e-12', r.ok && approx(r.pFailed, 1 - Math.exp(-lam * t1), 1e-12), r.ok ? String(r.pFailed) : r.reason);
const l2 = 4e-3, m2 = 0.25, t2 = 18;
r = G.solveMarkovTransient(REP(l2, m2), t2);
const wantRep = (l2 / (l2 + m2)) * (1 - Math.exp(-(l2 + m2) * t2));
check('repairable: P(t) = λ/(λ+μ)(1−e^{−(λ+μ)t}) to 1e-12', r.ok && approx(r.pFailed, wantRep, 1e-12));
check('Σπ(t) = 1 and the receipt states method/Λ/terms/tol',
  approx(r.pi.reduce((a, x) => a + x, 0), 1, 1e-12) &&
  /uniformization/.test(r.receipt.method) && r.receipt.Lambda > 0 && r.receipt.terms > 0 && r.receipt.tol === 1e-12);
check('transient < steady for a repairable chain at finite t (the OVERSTATE the caveat named)',
  r.pFailed < l2 / (l2 + m2));

console.log('\n[2] underflow-proof at large Λt');
r = G.solveMarkovTransient(REP(l2, m2), 8e4, { maxTerms: 2000000 });
const ss = G.solveMarkovModel(REP(l2, m2));
check('Λt ≈ 2·10⁴ (e^{−Λt} underflows) still solves and agrees with steady to 1e-9',
  r.ok && approx(r.pFailed, ss.pFailed, 1e-9), r.ok ? 'err=' + Math.abs(r.pFailed - ss.pFailed) : r.reason);

console.log('\n[3] refusals with names');
const V = G.validateMarkovModel;
check('unknown state ref named', !V({ states: [{ name: 'A' }, { name: 'B' }], transitions: [{ from: 'A', to: 'Z', rate: 1 }] }).ok);
check('non-positive rate named', V({ states: [{ name: 'A' }, { name: 'B' }], transitions: [{ from: 'A', to: 'B', rate: 0 }] }).errors.some(e => /not a positive finite/.test(e)));
check('duplicate state names named', V({ states: [{ name: 'A' }, { name: 'A' }], transitions: [] }).errors.some(e => /duplicate/.test(e)));
check('self-loop named (previously dropped silently)', V({ states: [{ name: 'A' }, { name: 'B' }], transitions: [{ from: 'A', to: 'A', rate: 1 }] }).errors.some(e => /self-loop/.test(e)));
check('< 2 states named', !V({ states: [{ name: 'A' }], transitions: [] }).ok);
check('no failed state → advisory warning, not an error',
  (() => { const v = V(REP(1e-3, 0.1)); const v2 = V({ states: [{ name: 'A' }, { name: 'B' }], transitions: [{ from: 'A', to: 'B', rate: 1 }] });
           return v.ok && v2.ok && v2.warnings.some(w => /marked Failed/.test(w)); })());
check('bad initial state refused by name', !G.solveMarkovTransient(REP(1e-3, 0.1), 1, { initial: 'Nope' }).ok);
r = G.solveMarkovTransient(REP(1e-3, 0.5), 1e9);
check('term-cap exceeded → NAMED refusal, never silent truncation', !r.ok && /REFUSED rather than truncated silently/.test(r.reason));
r = G.solveMarkovTransient({ states: [{ name: 'A' }, { name: 'B', isFailed: true }], transitions: [] }, 5);
check('Λ = 0 (no transitions) → π(t) = π(0), stated in the receipt', r.ok && r.pFailed === 0 && /no transitions/.test(r.receipt.note));
r = G.solveMarkovTransient(REP(1e-3, 0.1), 0);
check('t = 0 → π(0)', r.ok && r.pFailed === 0);

console.log('\n[4] the mission-time wire-in (effectiveProb)');
projectConfig.markovModels = [
  Object.assign({ id: 'mkv-ok', name: 'OK' }, REP(l2, m2)),
  { id: 'mkv-bad', name: 'Bad', states: [{ name: 'A' }, { name: 'B', isFailed: true }], transitions: [{ from: 'A', to: 'Z', rate: 1 }] }];
const steadyP = G.solveMarkovModel(projectConfig.markovModels[0]).pFailed;
const pOk = G.effectiveProb({ id: 1, type: 'basic', markovModelId: 'mkv-ok' }, 10);
check('valid model → TRANSIENT at exposure time (t = 10 FH)',
  approx(pOk, (l2 / (l2 + m2)) * (1 - Math.exp(-(l2 + m2) * 10)), 1e-12), String(pOk));
check('…which is NOT the steady figure', !approx(pOk, steadyP, 1e-6));
const pBad = G.effectiveProb({ id: 2, type: 'basic', markovModelId: 'mkv-bad' }, 10);
const pBadWant = G.solveMarkovModel(projectConfig.markovModels[1]).pFailed;
check('INVALID model → previous steady behavior kept (no silent number change under an error)',
  approx(pBad, pBadWant, 1e-15), pBad + ' vs ' + pBadWant);
const plain = { id: 3, type: 'basic', lambda: 1e-4 };
check('non-Markov node untouched (λ-formula lane)',
  approx(G.effectiveProb(plain, 10), G.effectiveProbFromLambda(1e-4, plain, 10), 1e-18));
check('per-event exposure honored (_nodeExposureTime path: manual override)',
  (() => { const n = { id: 4, type: 'basic', markovModelId: 'mkv-ok', exposureMode: 'manual', exposureTime: 3 };
           const want = (l2 / (l2 + m2)) * (1 - Math.exp(-(l2 + m2) * 3));
           return approx(G.effectiveProb(n, 10), want, 1e-12); })());

console.log('\n[5] benchmarks + wrap discipline');
const bm = G.runMarkovBenchmarks();
// §7.3 — this was `bm.length === 3`, and it broke the moment v1.1 added the
// two phased benchmarks. The invariant is MEMBERSHIP (the v1.0 closed forms
// and the steady cross-check are still on the board) plus all-pass, never a
// count that punishes adding evidence.
const bmIds = bm.map(b => b.id);
check('all cited benchmarks pass with the steady solver present (' + bmIds.join(', ') + ')',
  bm.length >= 3 && bm.every(b => b.pass), JSON.stringify(bm.filter(b => !b.pass).map(b => b.id)));
check('the founding benchmarks are still on the board (membership, not a count)',
  ['pure-death', 'repairable', 'steady-agreement'].every(id => bmIds.indexOf(id) >= 0), JSON.stringify(bmIds));
check('citations carried on every benchmark', bm.every(b => b.cite && b.cite.length > 10));
check('effectiveProb wrapped exactly once (guard set)', G.effectiveProb._ctmcWrapped === true);
check('renderMarkovModels wrapped (guard set)', G.renderMarkovModels._ctmcWrapped === true);

console.log('\n[6] wiring + honesty');
const src = S('markov_ctmc.js');
check('index.html loads markov_ctmc.js AFTER fta_quant_modules (defer order)',
  (() => { const idx = S('index.html'); const a = idx.indexOf('fta_quant_modules.js'); const b = idx.indexOf('markov_ctmc.js?v=');
           return a >= 0 && b > a; })());
// §7.3 — this banned EVERY `.push(` and kept an allow-list of the module's own
// local arrays, so it failed the moment v1.1 pushed to a new local (legs,
// excluded, notes). The real invariant is that no STORE is written: name the
// stores instead of policing a JS verb. Displayed lane, unchanged in force.
const STORES = ['projectConfig', 'acReqData', 'cmaData', 'ftaPages', 'acFhaData', 'systemsData',
                'flightPhasesData', 'zsaData', 'praData', 'itemsData', 'acFunctionsData'];
const codeOnly = src.replace(/^\s*\/\/.*$/gm, '');
check('module writes NOTHING to stores (no store assignment, no push onto a store)',
  STORES.every(s => {
    const assign = new RegExp('(^|[^.\\w])' + s + '(\\.\\w+)*\\s*=[^=]');
    const push = new RegExp('(^|[^.\\w])' + s + '(\\.\\w+)*\\.(push|splice|pop|shift|unshift)\\s*\\(');
    return !assign.test(codeOnly) && !push.test(codeOnly);
  }), STORES.filter(s => new RegExp('(^|[^.\\w])' + s + '(\\.\\w+)*\\s*\\.(push|splice)\\s*\\(').test(codeOnly)).join(', '));
check('the caveat it replaces is named in the header', /steady state only/.test(src) && /OVERSTATES/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * Regression tests for Backlog #7b — worker offload wiring + engine hardening.
 *
 * Loads the REAL modules and locks:
 *   [1] getCutsets hardening: a child yielding ~150k cut sets no longer blows
 *       the call stack (loop-append), and results on small trees are exactly
 *       the sets the algebra demands (order preserved).
 *   [2] the 2K-event benchmark tree that previously died with RangeError now
 *       refuses DETERMINISTICALLY (CutsetExplosionError), fast.
 *   [3] bddCutsets budget guard: path enumeration beyond the budget throws
 *       CutsetExplosionError instead of grinding forever; small trees are
 *       byte-identical to before; P(top) is never affected.
 *   [4] worker protocol parity (no Worker API needed): flattenTransfers →
 *       enumerateForWorker → _reconstructCutsets round-trips to EXACTLY the
 *       same cut sets as calling getCutsets directly; the 'ptop' op
 *       (computeImportanceForWorker) matches computeImportanceMeasures.
 *   [5] async wrappers in a Worker-less environment fall back to the
 *       synchronous engine with identical results — correctness, never
 *       approximation.
 *   [6] wiring: dispatcher routes big trees to the async path, prefetch seam
 *       present + one-shot, cancel terminates the worker, worker defaults ON
 *       with an opt-out, versioned worker spawn + importScripts.
 *   [7] guardrails: every bddMinimalCutsets call site sits in try/catch.
 *
 * Run:  node tests/regression_fta_worker.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- globals ----------------------------------------------------------------
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }), addEventListener: () => {}, querySelectorAll: () => [], readyState: 'complete', body: { appendChild: () => {} } };
globalThis.showToast = () => {};
globalThis.projectConfig = {};
globalThis.acFhaData = []; globalThis.systemsData = []; globalThis.ftaPages = [];
globalThis._perfStats = {};
globalThis._cutsetWorker = null; globalThis._cutsetWorkerSeq = 0;
globalThis._CUTSET_WORKER_MIN_NODES = 400;

(0, eval)(['fta_engine.js', 'engine_modules.js', 'fta_quant_modules.js', 'misc_fn_modules.js', 'perf_bench.js']
  .map(SITE).join('\n;\n'));
const G = globalThis;

const L = (id, p) => ({ id, logicalId: 'L' + id, displayId: 'B' + id, name: 'e' + id, type: 'basic', probability: p, children: [] });
const key = cs => cs.map(e => e.logicalId).sort().join('+');

console.log('\n[1] getCutsets hardening — loop-append survives huge child results');
{
  // AND of three ORs (50×50×60) → 150,000 cut sets under an OR parent: the old
  // push(...spread) blew the JS call stack here; the loop must not.
  let nid = 0;
  const orGate = (gid, n) => ({ id: gid, type: 'gate', gateType: 'OR', children: Array.from({ length: n }, () => L(++nid, 1e-3)) });
  const and = { id: 990001, type: 'gate', gateType: 'AND', children: [orGate(990002, 50), orGate(990003, 50), orGate(990004, 60)] };
  const wide = { id: 990000, type: 'gate', gateType: 'OR', children: [and, L(++nid, 1e-4)] };
  let sets = null, err = null;
  try { sets = G.getCutsets(wide); } catch (e) { err = e; }
  check('150,001 cut sets enumerate without RangeError', !err && sets && sets.length === 150001, err ? err.name + ': ' + String(err.message).slice(0, 60) : String(sets && sets.length));
  check('order preserved: AND-product sets first, lone leaf last', sets && sets[sets.length - 1].length === 1 && sets[0].length === 3);
  // Small-tree exactness: OR(AND(a,b), c) → {a,b} and {c}.
  const small = { id: 991000, type: 'gate', gateType: 'OR', children: [{ id: 991001, type: 'gate', gateType: 'AND', children: [L(991002, 1e-3), L(991003, 2e-3)] }, L(991004, 5e-4)] };
  const smallSets = G.getCutsets(small).map(key).sort();
  check('small-tree algebra exact', JSON.stringify(smallSets) === JSON.stringify(['L991002+L991003', 'L991004'].sort()), JSON.stringify(smallSets));
}

console.log('\n[2] the 2K benchmark tree refuses deterministically');
{
  const gen = G.benchGenTree({ events: 2000, fanout: 4, repeatPct: 0.15, seed: 105 });
  let err = null; const t0 = Date.now();
  try { G.getCutsets(gen.root); } catch (e) { err = e; }
  const ms = Date.now() - t0;
  check('CutsetExplosionError (not RangeError), under 5 s', !!err && err.name === 'CutsetExplosionError' && ms < 5000, err ? err.name + ' in ' + ms + 'ms' : 'no throw');
  check('refusal carries the count for the message', !!err && err.count > 0);
}

console.log('\n[3] bddCutsets budget guard');
{
  // Same 2K tree through the BDD path — previously ground toward a 16M-entry Map.
  const gen = G.benchGenTree({ events: 2000, fanout: 4, repeatPct: 0.15, seed: 105 });
  let err = null; const t0 = Date.now();
  try { G.bddMinimalCutsets(gen.root); } catch (e) { err = e; }
  const ms = Date.now() - t0;
  check('BDD path enumeration now refuses (CutsetExplosionError), bounded time', !!err && err.name === 'CutsetExplosionError' && ms < 30000, (err ? err.name : 'no throw') + ' in ' + ms + 'ms');
  // Small trees: identical output to the algebra, guard silent.
  const small = { id: 992000, type: 'gate', gateType: 'OR', children: [{ id: 992001, type: 'gate', gateType: 'AND', children: [L(992002, 1e-3), L(992003, 2e-3)] }, L(992004, 5e-4)] };
  const mcs = G.bddMinimalCutsets(small).map(key).sort();
  check('small-tree BDD minimal cut sets unchanged', JSON.stringify(mcs) === JSON.stringify(['L992002+L992003', 'L992004'].sort()), JSON.stringify(mcs));
  // P(top) is path-enumeration-free — must still be exact on the 2K tree.
  const r = G.computeExactProbability(gen.root);
  check('P(top) on the 2K tree unaffected by the guard', typeof r.prob === 'number' && isFinite(r.prob) && r.bddSize > 0, String(r.prob));
}

console.log('\n[4] worker protocol parity (encode → decode ≡ direct)');
{
  const gen = G.benchGenTree({ events: 180, fanout: 3, repeatPct: 0.12, seed: 55 });
  const direct = G.getCutsets(gen.root).map(key).sort();
  const flat = G.SLFTAEngine.flattenTransfers(gen.root, []);
  const encoded = G.SLFTAEngine.enumerateForWorker(flat.root);
  const decoded = G._reconstructCutsets(encoded, flat.index).map(key).sort();
  check('cut sets identical through the worker wire format', direct.length === decoded.length && direct.every((k, i) => k === decoded[i]), direct.length + ' vs ' + decoded.length);
  const impDirect = G.computeImportanceMeasures(gen.root);
  const impWorker = G.SLFTAEngine.computeImportanceForWorker(flat.root);
  check('P(top) identical through the ptop op', Math.abs(impDirect.pTop - impWorker.pTop) <= Math.abs(impDirect.pTop) * 1e-12, impDirect.pTop + ' vs ' + impWorker.pTop);
  const bDirect = new Map(impDirect.measures.map(m => [String(m.node.logicalId), m.birnbaum]));
  const allMatch = impWorker.measures.every(m => {
    const node = flat.index[m.nodeId];
    const want = bDirect.get(String(node && node.logicalId));
    return want !== undefined && Math.abs(m.birnbaum - want) <= Math.max(1e-300, Math.abs(want)) * 1e-9;
  });
  check('per-event Birnbaum identical through the ptop op', impWorker.measures.length === impDirect.measures.length && allMatch);
}

console.log('\n[5] async wrappers — Worker-less fallback is the same engine');
(async () => {
  const gen = G.benchGenTree({ events: 150, fanout: 3, repeatPct: 0.1, seed: 66 });
  const direct = G.getCutsets(gen.root).map(key).sort();
  const viaAsync = (await G.enumerateCutsetsAsync(gen.root)).map(key).sort();
  check('enumerateCutsetsAsync ≡ getCutsets without a Worker API', JSON.stringify(direct) === JSON.stringify(viaAsync));
  const impDirect = G.computeImportanceMeasures(gen.root);
  const impAsync = await G.computeImportanceAsync(gen.root);
  check('computeImportanceAsync ≡ computeImportanceMeasures without a Worker API', impAsync.pTop === impDirect.pTop && impAsync.measures.length === impDirect.measures.length);

  console.log('\n[6] wiring (source-level)');
  const fv = SITE('fta_view_modules.js');
  const mf = SITE('misc_fn_modules.js');
  check('dispatcher: big trees route to the async path', /_countTreeNodes\(rootNode\) >= _CUTSET_WORKER_MIN_NODES/.test(fv) && /_generateCutsetReportAsync\(rootNode\)/.test(fv));
  check('sync path preserved as _generateCutsetReportSync', /function _generateCutsetReportSync\(rootNode\)/.test(fv));
  check('prefetch seam is one-shot + canon-checked (both lanes)', (fv.match(/_ftaPrefetch\.canon === _quantCanon\(root\)/g) || []).length === 2 && /_ftaPrefetch\.cutsets = undefined; return pv;/.test(fv));
  check('cancel terminates the worker + orphans the run', /ftaCancelCompute/.test(fv) && /_cutsetWorker\.terminate\(\)/.test(fv) && /_ftaComputeSeq\+\+/.test(fv));
  check('progress line + responsive-page note + Cancel button', /computing off-thread — the page stays responsive/.test(fv) && /onclick="ftaCancelCompute\(\)"/.test(fv));
  check('explosion via worker still routes to the refusal renderer', /err\.name === 'CutsetExplosionError'\) return _renderCutsetTooComplex\(rootNode, err\)/.test(fv));
  check('worker ON by default with ?cutsetWorker=0 / localStorage opt-out', /cutsetWorker=0/.test(mf) && /SLA_CUTSET_WORKER'\) === '0'\) return false/.test(mf) && /return typeof Worker !== 'undefined'/.test(mf));
  check('versioned worker spawn + versioned importScripts', /new Worker\('fta_worker\.js\?v=/.test(mf) && /importScripts\('fta_engine\.js\?v=/.test(SITE('fta_worker.js')));
  check('refusal message upgraded: cap, count, options', /budget guard \(cap:/.test(SITE('fta_quant_modules.js')) && /partition the tree with transfer gates/.test(SITE('fta_quant_modules.js')));

  console.log('\n[7] guardrails — every bddMinimalCutsets caller catches');
  // The new guard may throw where it never did; prove no call site lets it escape.
  const callers = ['ffs_module.js', 'fta_view_modules.js', 'helpers_modules.js', 'mac_flows.js', 'mac_modes.js', 'mmel_module.js'];
  let uncovered = [];
  callers.forEach(f => {
    const src = SITE(f);
    let idx = 0;
    while ((idx = src.indexOf('bddMinimalCutsets(', idx)) !== -1) {
      const back = src.slice(Math.max(0, idx - 400), idx);
      if (!/try\s*\{[^]*$/.test(back)) uncovered.push(f + '@' + idx);
      idx += 10;
    }
  });
  check('all call sites inside try blocks', uncovered.length === 0, uncovered.join(', '));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

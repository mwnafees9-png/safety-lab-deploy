#!/usr/bin/env node
/*
 * Regression tests for Backlog #7a — the Scale & Performance benchmark page
 * (perf_bench.js). Loads the REAL engine (engine_modules + fta_quant) and locks:
 *   [1] generator determinism: same seed → byte-identical tree; different
 *       seed → different tree; no Math.random anywhere in the module.
 *   [2] generator integrity: leaf/gate counts consistent, repeated events
 *       share logicalId + probability, every gate has ≥1 child.
 *   [3] closed-form sanity: with repeatPct 0 (independent events) the BDD
 *       P(top) matches the direct AND/OR product-form evaluation.
 *   [4] repeated events actually repeat: BDD P(top) differs from the naive
 *       independent evaluation when repeatPct > 0 (the whole point of a BDD).
 *   [5] the runner: rows carry timings + bddSize + cut-set counts for the
 *       small tiers, results persist to localStorage, never to project data.
 *   [6] honesty: a guard refusal is reported as a row field, not a throw.
 *   [7] wiring: index.html loads perf_bench.js; page self-registers 'bench'.
 *
 * Run:  node tests/regression_perf_bench.test.js
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
const _lsStore = {};
globalThis.localStorage = { getItem: k => (k in _lsStore ? _lsStore[k] : null), setItem: (k, v) => { _lsStore[k] = String(v); }, removeItem: k => { delete _lsStore[k]; } };
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }), addEventListener: () => {}, querySelectorAll: () => [], readyState: 'complete', body: { appendChild: () => {} } };
globalThis.showToast = () => {};
globalThis.projectConfig = {};
globalThis.acFhaData = []; globalThis.systemsData = []; globalThis.ftaPages = [];

(0, eval)(['fta_engine.js', 'engine_modules.js', 'fta_quant_modules.js', 'perf_bench.js'].map(SITE).join('\n;\n'));
const G = globalThis;

console.log('\n[1] generator determinism');
const t1 = G.benchGenTree({ events: 120, fanout: 3, repeatPct: 0.1, seed: 7 });
const t2 = G.benchGenTree({ events: 120, fanout: 3, repeatPct: 0.1, seed: 7 });
const t3 = G.benchGenTree({ events: 120, fanout: 3, repeatPct: 0.1, seed: 8 });
check('same seed → identical tree', JSON.stringify(t1.root) === JSON.stringify(t2.root));
check('different seed → different tree', JSON.stringify(t1.root) !== JSON.stringify(t3.root));
check('no Math.random in the module', SITE('perf_bench.js').indexOf('Math.random') === -1);

console.log('\n[2] generator integrity');
{
  const { root, stats } = G.benchGenTree({ events: 200, fanout: 3, repeatPct: 0.15, seed: 11 });
  let leaves = 0, gates = 0, emptyGates = 0;
  const byLid = new Map();
  (function walk(n) {
    if (n.type === 'gate') { gates++; if (!(n.children || []).length) emptyGates++; (n.children || []).forEach(walk); }
    else { leaves++; const arr = byLid.get(n.logicalId) || []; arr.push(n); byLid.set(n.logicalId, arr); }
  })(root);
  check('counts consistent (leaves = slots, gates match stats)', leaves === stats.leafSlots && gates === stats.gates, leaves + '/' + stats.leafSlots + ' ' + gates + '/' + stats.gates);
  check('every gate has children', emptyGates === 0, String(emptyGates));
  const repeatedGroups = [...byLid.values()].filter(a => a.length > 1);
  check('repeated events exist and share probability', stats.repeated > 0 && repeatedGroups.length > 0 && repeatedGroups.every(a => a.every(n => n.probability === a[0].probability)),
        'repeated=' + stats.repeated + ' groups=' + repeatedGroups.length);
}

console.log('\n[3] closed-form sanity (independent events)');
function evalIndep(n) {
  if (n.type !== 'gate') return n.probability;
  const ps = (n.children || []).map(evalIndep);
  if (n.gateType === 'AND') return ps.reduce((a, b) => a * b, 1);
  // OR via pairwise a+b−ab — algebraically identical to 1−Π(1−p) but free of
  // the catastrophic cancellation that zeroes P(top) below ~1e-16 in floats.
  return ps.reduce((a, b) => a + b - a * b, 0);
}
{
  const { root, stats } = G.benchGenTree({ events: 60, fanout: 3, repeatPct: 0, seed: 21 });
  check('no repeats at repeatPct 0', stats.repeated === 0);
  const exact = G.computeExactProbability(root).prob;
  const closed = evalIndep(root);
  check('BDD exact matches product-form to 1e-12 rel', Math.abs(exact - closed) / closed < 1e-12, exact + ' vs ' + closed);
}

console.log('\n[4] repeats change the answer (BDD earns its keep)');
{
  const { root, stats } = G.benchGenTree({ events: 80, fanout: 3, repeatPct: 0.25, seed: 22 });
  const exact = G.computeExactProbability(root).prob;
  const naive = evalIndep(root);   // treats every occurrence as independent — wrong on purpose
  check('repeated events present', stats.repeated > 0, String(stats.repeated));
  check('exact ≠ naive independent evaluation', Math.abs(exact - naive) / Math.max(exact, naive) > 1e-9, exact + ' vs ' + naive);
}

console.log('\n[5] the runner');
(async () => {
  const tiers = [
    { label: 'T1', events: 50, fanout: 3, repeatPct: 0.1, seed: 31 },
    { label: 'T2', events: 120, fanout: 3, repeatPct: 0.1, seed: 32 },
  ];
  const progress = [];
  const result = await G.benchRun(tiers, cfg => progress.push(cfg.label));
  check('one row per tier, in order', result.rows.length === 2 && result.rows[0].label === 'T1' && result.rows[1].label === 'T2');
  check('progress callback fired per tier', progress.join(',') === 'T1,T2', progress.join(','));
  check('rows carry P(top) + bddSize + timings', result.rows.every(r => typeof r.pTop === 'number' && isFinite(r.pTop) && r.bddSize > 0 && r.pTopMs >= 0 && r.impMs >= 0));
  check('rows carry cut-set outcome (count or refusal)', result.rows.every(r => (r.mcsCount != null) || r.mcsRefused || r.mcsError), JSON.stringify(result.rows.map(r => ({ c: r.mcsCount, ref: !!r.mcsRefused }))));
  check('results persist to localStorage under the bench key', !!_lsStore['safetyLab.benchResults.v1'] && JSON.parse(_lsStore['safetyLab.benchResults.v1']).rows.length === 2);
  check('nothing written to project data', Object.keys(G.projectConfig).length === 0 && G.ftaPages.length === 0);

  console.log('\n[6] honesty on refusal');
  // A wide pure-AND of ORs explodes the cut-set product deterministically.
  const mk = (i) => ({ id: 8000000 + i, logicalId: 'W-' + i, displayId: 'W-' + i, name: 'w' + i, type: 'basic', probability: 1e-3, children: [] });
  let nid = 0;
  const ors = [];
  for (let g = 0; g < 12; g++) {
    const kids = []; for (let k = 0; k < 6; k++) kids.push(mk(nid++));
    ors.push({ id: 8100000 + g, type: 'gate', gateType: 'OR', children: kids });
  }
  const bomb = { id: 8200000, type: 'gate', gateType: 'AND', children: ors };   // 6^12 ≈ 2.2e9 combinations
  let refusedProperly = false;
  try { G.getCutsets(bomb); } catch (err) { refusedProperly = !!(err && err.name === 'CutsetExplosionError'); }
  const src = SITE('perf_bench.js');
  check('explosion guard fires deterministically on the bomb tree', refusedProperly);
  check('runner catches CutsetExplosionError into row.mcsRefused', /CutsetExplosionError/.test(src) && /mcsRefused = true/.test(src));
  check('call-stack overflow classified honestly (mcsOverflow, not silent error)', /mcsOverflow = true/.test(src) && /call stack/i.test(src) && /overflowed ✋/.test(src));
  check('refusal rendered as a result, never hidden', /guard refused/.test(src) && /never approximates/.test(src));

  console.log('\n[7] wiring');
  check('index.html loads perf_bench.js', SITE('index.html').indexOf('perf_bench.js?v=') !== -1);
  check('self-registering bench page + nav', /view-bench/.test(src) && /snav-bench/.test(src) && /switchTab\('bench'\)/.test(src));
  check('results stamped with time + UA', /at: new Date\(\)\.toISOString\(\)/.test(src) && /navigator\.userAgent/.test(src));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

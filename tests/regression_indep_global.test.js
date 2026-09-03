#!/usr/bin/env node
/*
 * Regression — A6: independence propagation (22 Aug 2026).
 *   FAILURES of independence are GLOBAL: an open CMA common-mode finding is a
 *   fact about the member PAIR it couples (by logicalId), so ANY gate whose
 *   children include that pair loses its reduction — wherever the CMA is linked.
 *   CLAIMS stay LOCAL: substantiating a claim at one gate substantiates nothing
 *   anywhere else, and a failure beats even a 'substantiated' local claim.
 *   Closure restores: a Mitigated/Closed CMA compromises nothing.
 * Run: node tests/regression_indep_global.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const slice = (src, from, to, label) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('slice anchors missing: ' + label);
  return src.slice(a, b);
};

globalThis.window = globalThis;
globalThis.SLEnv = { get: n => globalThis[n] };
globalThis.DAL_ORDER = ['A', 'B', 'C', 'D', 'E'];

(0, eval)(slice(S('helpers_modules.js'), 'function dalDecrement', '// Color for the canvas badge', 'helpers dal fns'));
(0, eval)(slice(S('support_modules.js'), 'function clearAllAllocations', '// Component library for basic-event input mode', 'support allocator'));
// checkCMACompromise needs its lexical siblings stubbed — it only reads cmaData,
// CMA_MODE_LABELS (typeof-guarded) and the global _cmaCompromisedIndex.
(0, eval)(slice(S('assurance_modules.js'), 'function checkCMACompromise', 'function checkORCompromise', 'assurance checkCMACompromise'));

// ---- fixture ---------------------------------------------------------------
const mkGate = (id, dep, indep, lids) => ({
  id, displayId: dep, type: 'gate', gateType: 'AND', dalIndependence: indep,
  children: lids.map((l, i) => ({ id: id + '-c' + i, logicalId: l, type: 'basic' }))
});
const mkPages = () => ([
  { id: 'pa', name: 'PASA A', root: mkGate('g1', 'G1', 'claimed',       ['L1', 'L2']) },
  { id: 'pb', name: 'PASA B', root: mkGate('g2', 'G2', 'substantiated', ['L1', 'L2']) },
  { id: 'pc', name: 'PASA C', root: mkGate('g3', 'G3', 'claimed',       ['L1', 'L3']) },
]);
globalThis.ftaPages = mkPages();
globalThis.cmaData = [{ internalId: 1, cmaId: 'CMA-9', status: 'Open', modes: ['shared-power'], linkedGateIds: ['pa:g1'] }];

// ---- the index -------------------------------------------------------------
let idx = _cmaCompromisedIndex();
check('index carries the linked gate id AND the failed member pair',
  idx.ids.has('g1') && idx.pairs.has('L1|L2') && idx.pairs.get('L1|L2').cma === 'CMA-9',
  JSON.stringify([Array.from(idx.ids), Array.from(idx.pairs.keys())]));

// ---- failures are global ---------------------------------------------------
ftaPages.forEach(p => allocateDAL(p.root, 'A', new Set(), idx));
const [g1, g2, g3] = ftaPages.map(p => p.root);
check('the LINKED gate compromises (unchanged behavior)', g1._dalCompromised === true && g1._dalReduced === false);
check('a DIFFERENT gate ANDing the same pair compromises too — the failure travels with the PAIR',
  g2._dalCompromised === true && g2._dalReduced === false, JSON.stringify({ c: g2._dalCompromised, r: g2._dalReduced }));
check('its members revert to the top DAL', g2.children.every(c => c.allocatedDAL === 'A'),
  JSON.stringify(g2.children.map(c => c.allocatedDAL)));
check('a failure beats even a locally SUBSTANTIATED claim', g2.dalIndependence === 'substantiated' && g2._dalCompromised);
check('the reason names the CMA, the gate it was recorded at, and says the failure is global',
  /CMA-9/.test(g2._dalCompromiseReason) && /G1/.test(g2._dalCompromiseReason) && /PASA A/.test(g2._dalCompromiseReason) && /global/.test(g2._dalCompromiseReason),
  g2._dalCompromiseReason);
check('_cmaCompromisedGlobal records the provenance for the UI', g2._cmaCompromisedGlobal && g2._cmaCompromisedGlobal.cma === 'CMA-9');
check('probability cascade fires on the globally-compromised gate (no β on record)', g2._probCompromised === true);
check('ONE shared member is not the failed pair — G3 (L1,L3) keeps its reduction (claims stay local)',
  g3._dalCompromised === false && g3._dalReduced === true,
  JSON.stringify({ c: g3._dalCompromised, r: g3._dalReduced }));
check('G3 members carry reduced DALs (Option 2: one-down / floor)',
  g3.children.every(c => c.allocatedDAL !== 'A'), JSON.stringify(g3.children.map(c => c.allocatedDAL)));

// ---- AutoReq sees the same global failure -----------------------------------
const rG2 = checkCMACompromise(g2, ftaPages[1]);
check('checkCMACompromise raises cma-global on the far gate, naming the recording site',
  rG2.length === 1 && rG2[0].kind === 'cma-global' && /CMA-9/.test(rG2[0].detail) && /G1/.test(rG2[0].detail),
  JSON.stringify(rG2));
const rG1 = checkCMACompromise(g1, ftaPages[0]);
check('the LINKED gate reports the local finding only — no self-duplicate from the global pass',
  rG1.length === 1 && rG1[0].kind === 'cma', JSON.stringify(rG1.map(r => r.kind)));
const rG3 = checkCMACompromise(g3, ftaPages[2]);
check('a gate sharing only one member gets NO global finding', rG3.length === 0, JSON.stringify(rG3));

// ---- closure restores (the direction rule for CMAs) -------------------------
cmaData[0].status = 'Mitigated';
globalThis.ftaPages = mkPages();
idx = _cmaCompromisedIndex();
ftaPages.forEach(p => allocateDAL(p.root, 'A', new Set(), idx));
check('a CLOSED CMA compromises nothing — reductions stand again everywhere',
  idx.pairs.size === 0 && ftaPages[1].root._dalCompromised === false && ftaPages[1].root._dalReduced === true);
cmaData[0].status = 'Open';

// ---- edges ------------------------------------------------------------------
cmaData[0].suggested = true;
idx = _cmaCompromisedIndex();
check('a SUGGESTED (unaccepted) CMA row drives nothing', idx.pairs.size === 0 && idx.ids.size === 0);
delete cmaData[0].suggested;
cmaData.push({ internalId: 2, cmaId: 'CMA-10', status: 'Open', modes: [], findings: '', linkedGateIds: ['pa:g1'] });
idx = _cmaCompromisedIndex();
check('a linked CMA with NO modes and NO findings is not a failure', idx.pairs.size === 1 && idx.pairs.get('L1|L2').cma === 'CMA-9');

// legacy compatibility: a bare Set still works (old callers / older fixtures)
globalThis.ftaPages = mkPages();
allocateDAL(ftaPages[1].root, 'A', new Set(), new Set(['g2']));
check('legacy bare-Set cmaSet still compromises by gate id', ftaPages[1].root._dalCompromised === true);

// ---- wiring -----------------------------------------------------------------
const misc = S('misc_fn_modules.js');
check('the all-roots sweep builds ONE index for the whole pass (A6 rides A5)',
  /_cmaCompromisedIndex === 'function'\) \? _cmaCompromisedIndex\(\)/.test(misc) && /propagateDalAllRoots/.test(misc));
const idxHtml = S('index.html');
check('pins: support ≥66.23, misc ≥66.37, assurance ≥1.23 (floors, rule 12)',
  parseFloat((idxHtml.match(/support_modules\.js\?v=([\d.]+)/) || [])[1]) >= 66.23 &&
  parseFloat((idxHtml.match(/misc_fn_modules\.js\?v=([\d.]+)/) || [])[1]) >= 66.37 &&
  parseFloat((idxHtml.match(/assurance_modules\.js\?v=([\d.]+)/) || [])[1]) >= 1.23);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

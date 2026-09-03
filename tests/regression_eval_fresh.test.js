#!/usr/bin/env node
/*
 * Regression — EVAL-FRESH + snapshot-is-a-copy (2 Sep 2026).
 *
 * Closes the two harness findings in eval/HF_CONSISTENCY_RUNBOOK.md:
 *   #1 The C2 replay cache (local + remote) echoed a recorded draft for an
 *      identical request, so a "second draw" was byte-identical to the first.
 *      window.SafetyLabAI.evalFresh === true makes _completeReproducible send
 *      req.noCache=true — honoured by the wrap for BOTH layers, never recorded
 *      over the golden. The snapshot's meta.fresh declares the posture.
 *   #2 _repeatabilitySnapshot aliased the LIVE stores; clearing a lane later
 *      emptied the stashed export. It now deep-clones.
 *
 * Executed against the REAL extracted functions in a vm sandbox — never a
 * re-implementation.
 *
 * Run: node tests/regression_eval_fresh.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ai = fs.readFileSync(path.join(__dirname, '..', 'site', 'ai_assistant.js'), 'utf8');

// ---- P1: _completeReproducible under both switch states ----
const crSrc = (ai.match(/function _completeReproducible\(opts\) \{[\s\S]*?\n    \}/) || [''])[0];
check('P0 _completeReproducible extracted', crSrc.length > 100);

function runCR(evalFresh, wrapped, opts) {
  const seen = { wrapped: null, provider: null };
  const complete = function (req) { seen.wrapped = req; return 'W'; };
  if (wrapped) complete._acWrapped = true;
  const ctx = vm.createContext({
    window: { SafetyLabAI: { evalFresh, complete } },
    Provider: { complete: function (req) { seen.provider = req; return 'P'; } },
    Object,
  });
  vm.runInContext(crSrc + '\n;globalThis.__cr = _completeReproducible;', ctx);
  const ret = vm.runInContext('__cr', ctx)(opts);
  return { ret, seen };
}

{
  const caller = { feature: 'hf.draftlane', messages: [] };
  const a = runCR(true, true, caller);
  check('P1a evalFresh=true → wrapped provider receives noCache:true', a.ret === 'W' && a.seen.wrapped && a.seen.wrapped.noCache === true);
  check('P1b the caller\'s opts object is NOT mutated', caller.noCache === undefined);
  const b = runCR(false, true, { feature: 'hf.draftlane' });
  check('P1c evalFresh absent → no noCache (today\'s replay behaviour kept)', b.ret === 'W' && b.seen.wrapped && b.seen.wrapped.noCache === undefined);
  const c = runCR(true, false, { feature: 'hf.draftlane' });
  check('P1d unwrapped provider fallthrough ALSO gets noCache under evalFresh', c.ret === 'P' && c.seen.provider && c.seen.provider.noCache === true);
  const d = runCR(true, true, { feature: 'x', noCache: false });
  check('P1e an explicit noCache:false from the caller is overridden to true by the switch', d.seen.wrapped.noCache === true);
}

// ---- P2: _repeatabilitySnapshot is a COPY ----
const snapSrc = (ai.match(/function _repeatabilitySnapshot\(\) \{[\s\S]*?\n    \}/) || [''])[0];
check('P2-0 _repeatabilitySnapshot extracted', snapSrc.length > 500 && /hfaRows/.test(snapSrc));

function runSnap(evalFresh) {
  const live = {
    acFhaData: [{ fcId: 'SF-001-M', severity: 'Major', mExtra: [{ id: 'SF-001-M2', desc: 'x' }] }],
    acFcimData: [{ subId: 'SF-001', mExtra: [{ id: 'SF-001-M2' }] }],
    acFunctionsData: [{ subId: 'SF-001' }],
    acAssumptionsData: [{ id: 'A1' }],
    systemsData: [{ id: 'S1', asm: [{ id: 'A2' }] }],
    projectConfig: { hf: { tid: { rows: [{ id: 'T1' }] } } },
  };
  const ctx = vm.createContext(Object.assign({
    window: { SafetyLabAI: { evalFresh } },
    MODELS: { reason: 'm' }, projectName: 'P', _memoryExemplars: () => '',
    JSON, Array, Date, Object,
  }, live));
  vm.runInContext(snapSrc + '\n;globalThis.__snap = _repeatabilitySnapshot;', ctx);
  const snap = vm.runInContext('__snap', ctx)();
  return { snap, live, ctx };
}

{
  const { snap, live, ctx } = runSnap(false);
  check('P2a fha is a different array object from the live store', snap.fha !== live.acFhaData);
  check('P2b …but deep-equal at capture', JSON.stringify(snap.fha) === JSON.stringify(live.acFhaData));
  check('P2c nested mExtra is cloned too (not the same object)', snap.fha[0].mExtra !== live.acFhaData[0].mExtra && snap.fha[0].mExtra[0].id === 'SF-001-M2');
  // the runbook's actual failure: clear the lane AFTER export → export must survive
  vm.runInContext('acFhaData.length = 0; acFcimData.length = 0;', ctx);
  check('P2d clearing the live lane after export leaves the snapshot intact (the golden-emptied bug)', snap.fha.length === 1 && snap.fcim.length === 1);
  vm.runInContext('acFhaData.push({fcId:"NEW"})', ctx);
  check('P2e later live writes do not leak into the snapshot', snap.fha.length === 1);
  check('P2f hfaRows flattens aircraft + system assumptions as copies', snap.hfaRows.length === 2 && snap.hfaRows[0] !== live.acAssumptionsData[0]);
  check('P2g HF lane rows (tidRows) are copies', snap.tidRows.length === 1 && snap.tidRows !== live.projectConfig.hf.tid.rows);
  check('P2h meta.fresh declares FALSE when the switch is off', snap.meta.fresh === false);
  const { snap: s2 } = runSnap(true);
  check('P2i meta.fresh declares TRUE under evalFresh', s2.meta.fresh === true);
  check('P2j meta.a14 posture unchanged by this work', s2.meta.a14 === 'none retrieved');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

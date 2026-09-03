#!/usr/bin/env node
/*
 * Regression — A8: stale-flagging, built once (stale_watch.js v1.0).
 *   Six watchers, each exercised against its own honest predicate:
 *     [ss] issued requirement quotes a budget the allocation has TIGHTENED
 *          (and the direction rule: a budget that got EASIER never flags);
 *     [asm] assumption quotes a number looser than the FC's objective;
 *     [alpha] verification-side shift — baseline on first sight (no flag),
 *          flag on a HARDER move, ack re-baselines;
 *     [coffe] a grafted branch whose verdict was re-classified or cleared;
 *     [mac] compiled MF&MS / lane trees stale against their rule (via the
 *          real macTreeStatus / SLLaneTrees.status hooks);
 *     [fmes] R2 — adopted Σλ drifted from the group's current sum.
 *   Acks: signed, quiet ONLY for the acknowledged value, return on movement.
 * Run: node tests/regression_stale_watch.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

globalThis.window = globalThis;
globalThis.SLEnv = { get: n => globalThis[n] };
globalThis.document = undefined;

// ---- fixture ---------------------------------------------------------------
globalThis.projectConfig = { macModels: [{ id: 'r1', subId: 'SF-01', clauses: [{ min: 1, of: ['sA'] }] }], coffe: { verdicts: { '7§sys-x=malfunction': { verdict: 'yes', by: 'W', at: 'T' } } } };
globalThis.acFhaData = [{ internalId: 7, subId: 'SF-01', fcId: 'FC-1', severity: 'Catastrophic', assumptionIds: [301] }];
globalThis.acAssumptionsData = [{ internalId: 301, asmId: 'ASM-1', text: 'Assumes total loss no worse than 1e-7 per FH for sizing.' }];
globalThis.systemsData = [];
globalThis.getSafetyTarget = sev => sev === 'Catastrophic' ? { prob: 1e-9 } : { prob: 1e-7 };
globalThis.acReqData = [
  { internalId: 1, traceId: 'REQ-T', reqSource: { sourceId: 'ac:fta:prob:lidA', context: { prob: 1e-6 } } },   // quotes 1e-6
  { internalId: 2, traceId: 'REQ-E', reqSource: { sourceId: 'ac:fta:prob:lidB', context: { prob: 1e-9 } } },   // quotes 1e-9 (budget EASED)
];
globalThis.ftaPages = [
  { id: 'al1', name: 'PASA · A', targetP: 1e-6, root: { id: 1, type: 'gate', gateType: 'OR', children: [
      { id: 11, logicalId: 'lidA', type: 'basic', probability: 1e-9 },        // tightened vs quote 1e-6 → flag
      { id: 12, logicalId: 'lidB', type: 'basic', probability: 1e-7 },        // eased vs quote 1e-9 → NO flag
      { id: 13, logicalId: 'lidF', type: 'basic', probability: 1e-7, inputMode: 'lambda', lambda: 5e-6, _fmesGroup: 'AC§eff§det' },
  ] } },
  { id: 'mir1', name: 'Verification · A', verifies: 'al1', root: { id: 2, type: 'gate', gateType: 'OR', children: [] } },
  { id: 'gr1', name: 'MF&MS · FC-1', linkedFhaId: 7, root: { id: 3, type: 'gate', gateType: 'OR', children: [
      { id: 31, type: 'basic', probability: 0, _macGraft: 'sys-x=malfunction' },
      { id: 32, type: 'basic', probability: 0, _macGraft: 'sys-y=malfunction' },  // verdict GONE → flag
  ] } },
];
let mirrorP = 1e-7;
globalThis.computeExactProbability = root => root.id === 2 ? { prob: mirrorP } : { prob: 1e-7 };
globalThis.macTreeStatus = rule => 'stale';
globalThis.SLLaneTrees = { status: (rid, lane) => lane === 'tl' ? 'stale' : 'fresh' };
globalThis.fmesGroups = () => ({ groups: [{ key: 'AC§eff§det', sumRate: 8e-6 }] });   // drifted vs adopted 5e-6
globalThis.commitSaveChanges = () => {};
globalThis._signoffReviewerName = () => 'W. Nafees';
globalThis.slPrompt = async () => 'W. Nafees';

const SW = require(path.join(__dirname, '..', 'site', 'stale_watch.js'));
check('module exports sweep/ack', typeof SW.sweep === 'function' && typeof SW.ack === 'function');

// ---- first sweep ------------------------------------------------------------
let res = SW.sweep();
const by = src => res.flags.filter(f => f.source === src);
check('[ss] a TIGHTENED budget under an issued requirement flags — with both numbers named',
  by('shared-strictest').length === 1 && /REQ-T/.test(by('shared-strictest')[0].msg) && /1\.00e-6/.test(by('shared-strictest')[0].msg) && /1\.00e-9/.test(by('shared-strictest')[0].msg),
  JSON.stringify(by('shared-strictest')));
check('[ss] DIRECTION RULE: a budget that got EASIER never flags (REQ-E quiet)',
  !res.flags.some(f => /REQ-E/.test(f.msg)));
check('[asm] an assumption quoting looser than the objective flags, admitting the heuristic',
  by('assumption').length === 1 && /ASM-1/.test(by('assumption')[0].msg) && /heuristic/.test(by('assumption')[0].msg));
check('[alpha] FIRST SIGHT is a baseline, never a flag', by('alpha').length === 0);
check('[coffe] a graft whose verdict is GONE flags; the still-YES graft stays quiet',
  by('coffe').length === 1 && /sys-y=malfunction/.test(by('coffe')[0].msg) && /GONE/.test(by('coffe')[0].msg));
check('[mac] stale MF&MS + stale TL lane both surface centrally',
  by('mac').length === 2 && by('mac').some(f => /MF&MS/.test(f.msg)) && by('mac').some(f => /\(TL\)/.test(f.msg)));
check('[fmes] R2: adopted Σλ drift flags with old and new sums',
  by('fmes').length === 1 && /5\.00e-6/.test(by('fmes')[0].msg) && /8\.00e-6/.test(by('fmes')[0].msg) && /re-adopt/i.test(by('fmes')[0].msg));

// ---- [alpha] the shift + ack-rebaseline flow --------------------------------
(async () => {
  mirrorP = 5e-7;   // achieved got WORSE (×5) since the baseline
  res = SW.sweep();
  check('[alpha] a HARDER move since the baseline flags', res.flags.some(f => f.source === 'alpha' && /1\.00e-7/.test(f.msg) && /5\.00e-7/.test(f.msg)));
  mirrorP = 2e-8;   // achieved got BETTER
  const eased = SW.sweep();
  check('[alpha] DIRECTION RULE: an EASIER move never flags', !eased.flags.some(f => f.source === 'alpha'));
  mirrorP = 5e-7;

  // ---- acks: signed, value-pinned, returning --------------------------------
  const key = 'alpha:mir1';
  check('ack requires a live flag', await SW.ack('alpha:nope') === false);
  globalThis.slPrompt = async () => '';
  check('a blank signature acks nothing', await SW.ack(key) === false && SW.sweep().flags.some(f => f.key === key));
  globalThis.slPrompt = async () => 'W. Nafees';
  check('a signed ack quiets the flag', await SW.ack(key) === true && !SW.sweep().flags.some(f => f.key === key));
  check('the ack is recorded with signer and the acknowledged value',
    projectConfig.staleFlags[key] && projectConfig.staleFlags[key].ackBy === 'W. Nafees' && !!projectConfig.staleFlags[key].ackFp);
  check('[alpha] ack RE-BASELINES', projectConfig.staleBaselines[key].fp === (5e-7).toExponential(3));
  mirrorP = 5e-6;   // moves AGAIN, harder
  check('the flag RETURNS when the value moves again past the ack', SW.sweep().flags.some(f => f.key === key));

  // a non-alpha ack: quiet for THIS value only
  const ssKey = SW.sweep().flags.find(f => f.source === 'shared-strictest').key;
  await SW.ack(ssKey);
  check('[ss] signed ack quiets the budget-quote flag', !SW.sweep().flags.some(f => f.key === ssKey));
  ftaPages[0].root.children[0].probability = 1e-10;   // tightens FURTHER
  check('[ss] the flag returns when the budget tightens again', SW.sweep().flags.some(f => f.key === ssKey));
  check('quieted count reported honestly', (() => { ftaPages[0].root.children[0].probability = 1e-9; return SW.sweep().quieted >= 1; })());

  // ---- wiring ---------------------------------------------------------------
  const src = S('stale_watch.js');
  check('desk wraps updateDashboard with SLWrap.preserve discipline',
    /window\.updateDashboard/.test(src) && /SLWrap && SLWrap\.preserve/.test(src) && /_staleWrapped/.test(src));
  check('reads app state through SLEnv.get first (rule 5)', /E\.get === 'function'/.test(src));
  const idx = S('index.html');
  check('index loads stale_watch.js (deferred), after its consumers exist',
    /stale_watch\.js\?v=1\.[0-9]+"\s+defer/.test(idx) &&   // C2 supersession (22 Aug): floor per rule 12 — v1.1 added the decomposed predicate

    ['misc_fn_modules', 'lane_trees', 'ux_leading', 'budget_ledger'].every(n => idx.indexOf(n + '.js?v=') < idx.indexOf('stale_watch.js?v=')));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

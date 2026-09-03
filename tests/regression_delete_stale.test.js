#!/usr/bin/env node
/*
 * Regression — delete-stale cascade (Waqas ruling, 2 Aug 2026):
 * "once deleted, all connected artifacts should be marked as stale in the
 * golden thread."
 *
 * Before this, only FUNCTION deletes cascaded obsolescence
 * (_removeFunctionCascade); deleting an FHA row, zone, item or PRA left
 * dependents silently dangling until gt_integrity noticed after the fact.
 * rename_guard v1.3's owner snapshot now detects deletions and marks every
 * referencing artifact stale automatically; gt_integrity v1.2 renders the
 * marks as a STALE section (fourth verdict class).
 *
 * Everything executed against the real modules in a vm sandbox.
 *
 * Run: node tests/regression_delete_stale.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const rg = S('rename_guard.js'), gt = S('gt_integrity.js'), html = S('index.html');

function sandbox() {
  const sb = { console, Object, String, Array, JSON, Set, Date, setTimeout: () => 0, clearTimeout: () => 0 };
  sb.window = sb; sb.globalThis = sb;
  sb.acFunctionsData = []; sb.acFhaData = []; sb.acFcimData = []; sb.acReqData = [];
  sb.systemsData = []; sb.zsaData = []; sb.praData = []; sb.itemsData = []; sb.ftaPages = [];
  sb.projectConfig = {};
  sb._toasts = []; sb.showToast = (m) => sb._toasts.push(m);
  vm.createContext(sb);
  vm.runInContext(rg, sb);
  return sb;
}

// ---- [1] deleting an FHA row marks its FCIM cells + traced requirement ------
console.log('\n[stale] FHA row deleted → FCIM + requirement marked, executed');
{
  const sb = sandbox();
  const fha = { internalId: 1, fcId: 'FC-07' };
  const fcim = { internalId: 2, subId: 'SF-01', tlId: 'FC-07', tlDesc: 'loss of x' };
  const req = { internalId: 3, reqId: 'REQ-1', traceId: 'FC-07' };
  sb.acFhaData.push(fha); sb.acFcimData.push(fcim); sb.acReqData.push(req);
  sb.rgBaseline();
  sb.acFhaData.length = 0;                    // the delete
  sb.rgScan();
  check('FCIM row carries the obsolete mark with the STALE reason',
    fcim.obsolete === true && /STALE — Failure condition ID FC-07 deleted/.test(fcim.obsoleteReason),
    fcim.obsoleteReason);
  check('requirement takes the reqSource.obsolete + orphan convention (the cascade vocabulary)',
    req.reqSource && req.reqSource.obsolete && /STALE/.test(req.reqSource.obsolete.reason) && req.reqSource.orphan === true);
  check('the delete is logged to projectConfig.staleLog',
    Array.isArray(sb.projectConfig.staleLog) && sb.projectConfig.staleLog.length === 1 &&
    sb.projectConfig.staleLog[0].kind === 'fcId' && sb.projectConfig.staleLog[0].key === 'FC-07' && sb.projectConfig.staleLog[0].marked === 2);
  check('the toast names the count and points at Thread Integrity',
    sb._toasts.some(t => /2 connected artifacts marked STALE/.test(t) && /Thread Integrity/.test(t)));
  const log1 = sb.projectConfig.staleLog.length;
  sb.rgScan();
  check('idempotent: a second scan marks nothing again',
    fcim.obsolete === true && sb.projectConfig.staleLog.length === log1);
}

// ---- [2] array-slot containers get staleRefs, not a destructive rewrite -----
console.log('\n[stale] deleted sub-function → zone/item containers carry staleRefs, executed');
{
  const sb = sandbox();
  sb.acFunctionsData.push({ internalId: 1, subId: 'SF-05' });
  const zone = { internalId: 2, zoneId: 'Z-100', housedFunctions: ['SF-05', 'SF-06'] };
  const item = { internalId: 3, itemId: 'LRU-1', traceIds: ['SF-05'] };
  sb.zsaData.push(zone); sb.itemsData.push(item);
  sb.rgBaseline();
  sb.acFunctionsData.length = 0;
  sb.rgScan();
  check('zone gets a staleRefs entry naming the deleted key + field; the array itself untouched',
    Array.isArray(zone.staleRefs) && zone.staleRefs.length === 1 && zone.staleRefs[0].ref === 'SF-05' &&
    zone.staleRefs[0].field === 'housedFunctions' && zone.housedFunctions.length === 2);
  check('item traceIds container marked the same way',
    Array.isArray(item.staleRefs) && item.staleRefs[0].ref === 'SF-05');
  sb.rgScan();
  check('staleRefs dedupe on re-scan', zone.staleRefs.length === 1);
}

// ---- [3] the guards: ambiguity + rename-not-delete --------------------------
console.log('\n[stale] guards');
{
  const sb = sandbox();
  sb.acFhaData.push({ internalId: 1, fcId: 'FC-01' }, { internalId: 2, fcId: 'FC-01' });   // duplicate key
  const fcim = { internalId: 3, subId: 'SF-01', tlId: 'FC-01' };
  sb.acFcimData.push(fcim);
  sb.rgBaseline();
  sb.acFhaData.splice(0, 1);                  // one owner deleted, the key SURVIVES on the other
  sb.rgScan();
  check('key still owned elsewhere ⇒ no stale marks (refs point at the survivor)',
    !fcim.obsolete && !sb.projectConfig.staleLog);
  const sb2 = sandbox();
  sb2.acFhaData.push({ internalId: 1, fcId: 'FC-01' });
  const fcim2 = { internalId: 2, subId: 'SF-01', tlId: 'FC-01' };
  sb2.acFcimData.push(fcim2);
  sb2.rgBaseline();
  sb2.acFhaData[0].fcId = 'FC-01A';           // a RENAME, not a delete
  const renames = sb2.rgScan();
  check('a rename still reports as a rename and never marks stale',
    renames.length === 1 && renames[0].from === 'FC-01' && !fcim2.obsolete && !sb2.projectConfig.staleLog);
  const sb3 = sandbox();
  sb3.acFhaData.push({ internalId: 1, fcId: 'FC-02' });
  sb3.rgBaseline();
  sb3.acFhaData.length = 0;
  sb3.rgScan();
  check('a delete with NO references marks nothing and stays quiet',
    !sb3.projectConfig.staleLog && sb3._toasts.length === 0);
}

// ---- [4] gt_integrity: the stale sweep + the fourth verdict -----------------
console.log('\n[stale] gt_integrity renders the marks, executed');
{
  const sb = { console, Object, String, Array, JSON, Set, Date, setTimeout: () => 0 };
  sb.window = sb; sb.globalThis = sb;
  sb.acFcimData = [{ subId: 'SF-01', tlId: 'FC-07', obsolete: true, obsoleteReason: 'STALE — Failure condition ID FC-07 deleted' }];
  sb.acFhaData = []; sb.acReqData = [{ reqId: 'REQ-1', reqSource: { obsolete: { reason: 'STALE — x deleted' }, orphan: true } }];
  sb.systemsData = []; sb.zsaData = [{ zoneId: 'Z-100', staleRefs: [{ kind: 'subId', ref: 'SF-05', field: 'housedFunctions', reason: 'STALE — Function ID SF-05 deleted' }] }];
  sb.praData = []; sb.itemsData = []; sb.ftaPages = [];
  sb.projectConfig = {};
  sb.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, addEventListener: () => {} }), body: { appendChild: () => {} }, addEventListener: () => {} };
  vm.createContext(sb);
  vm.runInContext(gt, sb);
  const stale = sb.gtStaleSweep();
  check('the sweep finds all three mark shapes (row obsolete, reqSource, staleRefs)',
    stale.length === 3 &&
    stale.some(x => x.where === 'AC FCIM' && x.ref === 'FC-07') &&
    stale.some(x => x.where === 'AC requirements' && /orphaned trace/.test(x.reason)) &&
    stale.some(x => x.where === 'ZSA zone' && x.ref === 'Z-100'),
    JSON.stringify(stale));
  check('the page renders the Stale tile + section + fourth verdict in the legend',
    /tile\('Stale', stale\.length/.test(gt) && /marked at delete time/.test(gt) && /Four verdicts/.test(gt) && /STALE \(its reference was deleted/.test(gt));
}

// ---- [5] the silent zero: unresolved transfers (2 Aug, caught on HL-1) ------
console.log('\n[stale] transfer integrity: unlinked / dangling transfers get loud, executed');
{
  const sb = { console, Object, String, Array, JSON, Set, Date, setTimeout: () => 0, clearTimeout: () => 0 };
  sb.window = sb; sb.globalThis = sb;
  sb.acFcimData = []; sb.acFhaData = []; sb.acReqData = []; sb.systemsData = [];
  sb.zsaData = []; sb.praData = []; sb.itemsData = []; sb.projectConfig = {};
  sb.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, addEventListener: () => {} }), body: { appendChild: () => {} }, addEventListener: () => {} };
  let inv = null; sb.invRegister = i => { inv = i; return true; };
  sb.ftaPages = [
    { id: 'pg-top', name: 'PASA top', root: { id: 1, type: 'gate', gateType: 'AND', children: [
      { id: 2, displayId: 'G-1', type: 'gate', gateType: 'TRANSFER', linkedPageId: 'pg-sub' },      // resolves
      { id: 3, displayId: 'G-2', type: 'gate', gateType: 'TRANSFER', linkedPageId: '' },            // UNLINKED
      { id: 4, displayId: 'G-3', type: 'gate', gateType: 'TRANSFER', linkedPageId: 'pg-gone' }      // DANGLING
    ] } },
    { id: 'pg-sub', name: 'PSSA sub', root: { id: 5, type: 'gate', gateType: 'OR', children: [] } }
  ];
  vm.createContext(sb);
  vm.runInContext(S('gt_integrity.js'), sb);
  const t = sb.gtTransferSweep();
  check('the sweep flags exactly the unlinked + dangling transfers, never the resolved one',
    t.length === 2 && t.some(x => x.ref === '(unlinked)' && /G-2/.test(x.where)) &&
    t.some(x => x.ref === 'pg-gone' && /G-3/.test(x.where)) && !t.some(x => /G-1\b/.test(x.where)),
    JSON.stringify(t));
  check('both findings say the quiet part out loud: the branch contributes NOTHING',
    t.every(x => /contributes NOTHING to the math/.test(x.detail)));
  check('INV-44 registered HARD (a wrong number, not untidiness), counts every transfer, fails on the two',
    inv && inv.id === 'INV-44' && inv.sev === 'hard' &&
    (function () { const r = inv.run(); return r.checked === 3 && r.fails.length === 2; })());
  // registration survives invariants.js loading late (retry loop, not a load-order bet)
  check('registration retries until invRegister exists (invariants.js loads after gt_integrity)',
    /function regInv44\(tries\)/.test(gt) && /setTimeout\(\(\) => regInv44\(tries - 1\), 300\)/.test(gt));
}

// ---- [6] deleting a tree page marks its transfer stubs, executed ------------
console.log('\n[stale] pageId owner kind: page delete → transfer nodes marked, executed');
{
  const sb = sandbox();
  const stub = { id: 2, displayId: 'G-1', type: 'gate', gateType: 'TRANSFER', linkedPageId: 'pg-sub' };
  sb.ftaPages.push(
    { id: 'pg-top', name: 'PASA top', root: { id: 1, type: 'gate', gateType: 'AND', children: [stub] } },
    { id: 'pg-sub', name: 'PSSA sub', root: { id: 5, type: 'gate', gateType: 'OR', children: [] } });
  sb.rgBaseline();
  sb.ftaPages.splice(1, 1);                    // delete the PSSA page
  sb.rgScan();
  check('the transfer stub is marked stale with the page named',
    stub.obsolete === true && /STALE — Fault tree page pg-sub deleted/.test(stub.obsoleteReason),
    stub.obsoleteReason);
  check('logged under the pageId kind',
    sb.projectConfig.staleLog && sb.projectConfig.staleLog[0].kind === 'pageId' && sb.projectConfig.staleLog[0].key === 'pg-sub');
}

// ---- [7] wiring -------------------------------------------------------------
console.log('\n[stale] wiring');
{
  const pin = f => { const m = html.match(new RegExp('<script src="' + f + '\\?v=([0-9.]+)"')); return m ? m[1] : null; };
  check('rename_guard ≥1.4 (pageId owner kind)', PIN.pinAtLeast(pin('rename_guard.js'), '1.4'));
  check('gt_integrity ≥1.3 (transfer sweep + INV-44)', PIN.pinAtLeast(pin('gt_integrity.js'), '1.3'));
  check('unresolved transfers join the gt dangling table',
    /gtTransferSweep\(\)\.forEach\(x => r\.dangling\.push/.test(gt));
  check('rgMarkStale exported for the function cascade / tests to reuse',
    /window\.rgMarkStale = rgMarkStale/.test(rg));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

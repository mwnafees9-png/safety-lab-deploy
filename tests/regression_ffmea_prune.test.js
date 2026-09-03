#!/usr/bin/env node
/*
 * Regression — the functional-FMEA prune (5 Aug 2026, Waqas's ruling: honour
 * the lane).
 *
 * The defect this pins against returning: _pruneFmeaToPerSystem() deleted every
 * hand-authored functional row on EVERY load path — project open, file load,
 * and RESTORING A SAVED REVISION — with no message, while Program Planning
 * offered ffmea as a committable lane, the worksheet kept a live functional
 * mode, and the fmeaFunctional template schema shipped. Measured live on HL-1:
 * laneOn('ffmea') = true, laneOn('ppfmea') = false, and the surviving rows were
 * all of the UNCOMMITTED type. The l3Source wrapper in mac_flows.js saved the
 * machine's functional rows and left the user's dead.
 *
 * These checks load the REAL data_ops_modules.js and execute the REAL prune —
 * an extracted copy would go stale the moment the predicate moved.
 *
 * Run: node tests/regression_ffmea_prune.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');

const el = () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, querySelectorAll: () => [] });
const ctx = { window: {}, console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => null, createElement: el, body: el(), querySelectorAll: () => [], addEventListener() {} },
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, alert() {},
    Math, JSON, Date, Set, Map, Object, Array, String, Number, parseFloat, parseInt, isFinite, isNaN, Promise,
    Blob: function () {}, URL: { createObjectURL: () => '' }, FileReader: function () {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
ctx.window.window = ctx.window; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(SITE, 'data_ops_modules.js'), 'utf8'), ctx, { filename: 'data_ops_modules.js' });

const run = rows => { ctx.fmeaData = rows; ctx._pruneFmeaToPerSystem(); return ctx.fmeaData; };
const ids = rows => rows.map(r => r.fmeaId).join(',');

console.log('\n[ffmea-prune] the real prune, executed');
check('the prune loads from the real module', typeof ctx._pruneFmeaToPerSystem === 'function');

check('a hand-authored SYSTEM-scope functional row SURVIVES',
  ids(run([{ fmeaType: 'functional', scope: 'system', owningSystemId: 'sys-x', funcSubId: 'SF-1', fmeaId: 'F-SYS' }])) === 'F-SYS',
  'this is the row the worksheet authors and the row the old predicate deleted');

check('a hand-authored AIRCRAFT-scope functional row SURVIVES despite owningSystemId being empty',
  ids(run([{ fmeaType: 'functional', scope: 'aircraft', owningSystemId: '', funcSubId: 'SF-1', fmeaId: 'F-AC' }])) === 'F-AC',
  '_readFmeaForm sets owningSystemId to "" outside system scope BY DESIGN — requiring an owner of a functional row deletes every aircraft-level J1 row');

check('an untagged row WITH a function link is inferred functional and kept',
  ids(run([{ fmeaId: 'U-FUNC', funcSubId: 'SF-2' }])) === 'U-FUNC',
  'the multi-owner migration (data_ops ~465) already infers functional from funcSubId — the prune must use the same inference or the two disagree');

check('piece-part with an owner survives; piece-part with NO owner is still dropped',
  ids(run([{ fmeaType: 'piece-part', owningSystemId: 'sys-x', fmeaId: 'PP-OK' },
            { fmeaType: 'piece-part', owningSystemId: '', fmeaId: 'PP-DROP' }])) === 'PP-OK',
  'piece-part remains a per-system item-level model — that half of Phase 68 stands');

check('truly untagged junk (no type, no owner, no function link) is still dropped',
  run([{ fmeaId: 'JUNK' }]).length === 0,
  'the prune keeps its original stale-row purpose; it just stops eating a committed lane');

check('null entries are dropped, order is preserved',
  ids(run([null, { fmeaType: 'functional', funcSubId: 'a', fmeaId: 'A' }, undefined,
            { fmeaType: 'piece-part', owningSystemId: 's', fmeaId: 'B' }])) === 'A,B');

console.log('\n[ffmea-prune] the ruling is written where the next maintainer will read it');
{
  const src = fs.readFileSync(path.join(SITE, 'data_ops_modules.js'), 'utf8');
  check('the predicate no longer requires piece-part',
    !/fmeaType \|\| 'piece-part'\) === 'piece-part' && m\.owningSystemId/.test(src));
  check('the comment records the ruling and the finding, not just the behaviour',
    /RULED 5 Aug/.test(src) && /honour the lane/i.test(src) && /restoring a saved revision/i.test(src),
    'the old comment read as a settled decision ("Beta: confirmed no production data") — which is exactly why the defect survived: the fix must not be similarly mistakable for an accident');
}

console.log('\n[ffmea-prune] HL-1 exercises the committed lane');
{
  const g = { window: { addEventListener() {} } }; g.window.window = g.window;
  const c2 = Object.assign({}, g, { console: { log() {}, warn() {}, error() {} } });
  vm.createContext(c2);
  vm.runInContext(fs.readFileSync(path.join(SITE, 'demo_kit.js'), 'utf8'), c2, { filename: 'demo_kit.js' });
  c2.slDemoMirror = c2.window.slDemoMirror;
  vm.runInContext(fs.readFileSync(path.join(SITE, 'demo_showcase_hl1.js'), 'utf8'), c2, { filename: 'demo_showcase_hl1.js' });
  const d = c2.window.SL_SHOWCASE_HL1.build();
  const func = d.fmeaData.filter(r => r.fmeaType === 'functional');
  check('HL-1 carries hand-authored functional rows (the lane it committed to)',
    func.length >= 5, String(func.length));
  check('…including AIRCRAFT-scope rows with no owning system',
    func.some(r => r.scope === 'aircraft' && !r.owningSystemId));
  check('…each traced to a live aircraft sub-function',
    (() => { const subs = new Set(d.acFunctionsData.map(f => f.subId));
             return func.every(r => subs.has(r.funcSubId)); })());
  check('…and every one SURVIVES the real prune',
    (() => { ctx.fmeaData = JSON.parse(JSON.stringify(d.fmeaData)); ctx._pruneFmeaToPerSystem();
             return ctx.fmeaData.filter(r => r.fmeaType === 'functional').length === func.length &&
                    ctx.fmeaData.length === d.fmeaData.length; })(),
    'the end-to-end claim: what the demo authors is what a load returns');
}

// ---- the consumer the audit missed: FMES is a RATE rollup ------------------
// Found by LIVE verification after the prune fix shipped: fmesGroups() returned
// 30 groups where 24 were expected — it had no type filter, because before the
// fix no functional row could survive to be seen. A functional group in the
// FMES is an adoption candidate that adopts nothing (no rate, no beId).
console.log('\n[ffmea-prune] FMES counts piece-part only');
{
  const c3 = { window: {}, console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {} }), body: { appendChild() {} }, querySelectorAll: () => [], addEventListener() {} },
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, alert() {},
    Math, JSON, Date, Set, Map, Object, Array, String, Number, parseFloat, parseInt, isFinite, isNaN, Promise,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  c3.window.window = c3.window; c3.globalThis = c3;
  // stores fmesGroups' neighbours read at call time (bare-identifier globals)
  c3.systemsData = []; c3.acFhaData = []; c3.ftaPages = []; c3.projectConfig = {};
  c3._CKPT_SEV_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'No Safety Effect': 1 };
  c3.acFunctionsData = []; c3.acReqData = []; c3.itemsData = []; c3.praData = [];
  c3.zsaData = []; c3.cmaData = []; c3.acAssumptionsData = []; c3.flightPhasesData = [];
  vm.createContext(c3);
  c3.fmeaData = [
    { fmeaType: 'piece-part', scope: 'system', owningSystemId: 's1', endEffect: 'Loss of X', detection: 'Monitor', rate: 1e-6, beId: 5 },
    { fmeaType: 'piece-part', scope: 'system', owningSystemId: 's1', endEffect: 'Loss of Y', detection: 'Monitor', rate: 2e-6, beId: 6 },
    { fmeaType: 'functional', scope: 'aircraft', owningSystemId: '', funcSubId: 'SF-1', endEffect: 'Loss of Z', detection: 'Crew' },
  ];
  vm.runInContext(fs.readFileSync(path.join(SITE, 'misc_fn_modules.js'), 'utf8'), c3, { filename: 'misc_fn_modules.js' });
  let g = null, err = '';
  try { g = c3.fmesGroups(); } catch (e) { err = e.message; }
  check('fmesGroups executes against the real module', !!g, err);
  check('functional rows form NO FMES group and are not counted incomplete',
    !!g && g.groups.length === 2 && g.incomplete.length === 0,
    g ? g.groups.length + ' groups, ' + g.incomplete.length + ' incomplete — a functional group would be an adoption candidate with no rate and no basic event' : err);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

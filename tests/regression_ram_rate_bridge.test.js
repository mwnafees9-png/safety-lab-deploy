#!/usr/bin/env node
/*
 * Regression — the RAM rate bridge (8 Aug 2026, SL-ARC-0001 §22 RAM gray bar):
 * the two writes the architecture document drew as wired and named as absent —
 * RAM ledger → fmeaData[].rate (keyed on the linked basic event, × α_FM where
 * the row apportions) and RAM ledger → item.rate (Σλ over the item's distinct
 * linked events). One-way, explicit, provenance-carried (rateSource), and
 * OVERRIDE-PROTECTED: a value later edited by hand is never re-written.
 *
 * Everything executed against the REAL ram_derive.js in a vm sandbox — an
 * extracted copy would go stale the moment the predicate moved.
 *
 * Run: node tests/regression_ram_rate_bridge.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const src = S('ram_derive.js'), html = S('index.html');

function sandbox(nodes) {
  const sb = { console, Object, String, Array, JSON, Set, Map, Date, Math, Number, parseFloat, parseInt, isNaN,
    setTimeout: () => 0, clearTimeout: () => 0, setInterval: () => 0, clearInterval: () => 0 };
  sb.window = sb; sb.globalThis = sb;
  sb.document = { getElementById: () => null, createElement: () => ({ style: {}, setAttribute: () => {}, querySelectorAll: () => [] }), querySelectorAll: () => [] };
  sb.projectConfig = { ram: { tasks: [], field: [], dispatch: { targets: [], records: [] } } };
  sb._ramStore = () => sb.projectConfig.ram;
  sb.fmeaData = []; sb.itemsData = []; sb.acFhaData = []; sb.ftaPages = [];
  sb._fmesFindBe = ref => { const n = (nodes || []).find(x => x.ref === ref); return n ? { node: n.node, page: { id: 'pg-x', name: 'fixture' } } : null; };
  sb._toasts = []; sb.showToast = m => sb._toasts.push(m);
  sb.commitSaveChanges = () => { sb._saved = (sb._saved || 0) + 1; };
  vm.createContext(sb);
  vm.runInContext(src, sb);
  return sb;
}

// ---- [1] FMEA write with α_FM apportionment, executed -----------------------
console.log('\n[rate] ledger → FMEA rows, α_FM apportioned, provenance carried');
{
  const node = { id: 101, lambda: 2e-5, displayId: 'BE-1' };
  const sb = sandbox([{ ref: 'BE-1', node }]);
  sb.projectConfig.ram.tasks.push({ id: 'T1', name: 't', itemId: 'ITM-1', beRef: 'BE-1', interval: 0 });
  const r1 = { internalId: 1, fmeaType: 'piece-part', beId: 101, alphaFm: 0.6, rate: 0, time: 1, prob: 0 };
  const r2 = { internalId: 2, fmeaType: 'piece-part', beId: 101, alphaFm: 0.4, rate: 0, time: 1, prob: 0 };
  sb.fmeaData.push(r1, r2);
  sb.itemsData.push({ internalId: 10, itemId: 'ITM-1', name: 'LRU one' });
  const p = sb.deriveRates(false);
  check('two FMEA proposals, α-scaled from the event λ', p.fmea.length === 2 &&
    Math.abs(p.fmea[0].rate - 1.2e-5) < 1e-12 && Math.abs(p.fmea[1].rate - 8e-6) < 1e-12);
  check('preview writes NOTHING (pure)', r1.rate === 0 && r2.rate === 0 && !r1.rateSource);
  const a = sb.deriveRates(true);
  check('apply writes both rates with rateSource provenance', Math.abs(r1.rate - 1.2e-5) < 1e-12 &&
    r1.rateSource && r1.rateSource.origin === 'ram-ledger' && r1.rateSource.written === r1.rate &&
    r1.rateSource.beRef === 'BE-1' && r1.rateSource.taskId === 'T1');
  check('prob recomputed with the form path formula (1 − e^(−λt))',
    Math.abs(r1.prob - (-Math.expm1(-1.2e-5 * 1))) < 1e-18);
  check('item.rate written as the linked event λ with provenance', (function () {
    const it = sb.itemsData[0];
    return Math.abs(it.rate - 2e-5) < 1e-12 && it.rateSource && it.rateSource.origin === 'ram-ledger' && it.rateSource.written === it.rate;
  })());
  check('idempotent — a second sweep proposes nothing', (function () {
    const q = sb.deriveRates(false);
    return q.fmea.length === 0 && q.items.length === 0;
  })());
}

// ---- [2] the override flag — a hand edit is protected -----------------------
console.log('\n[rate] hand-edited values are OVERRIDDEN and never re-written');
{
  const node = { id: 101, lambda: 2e-5 };
  const sb = sandbox([{ ref: 'BE-1', node }]);
  sb.projectConfig.ram.tasks.push({ id: 'T1', itemId: 'ITM-1', beRef: 'BE-1' });
  const r1 = { internalId: 1, fmeaType: 'piece-part', beId: 101, alphaFm: 1, rate: 0, time: 0 };
  sb.fmeaData.push(r1);
  const it = { internalId: 10, itemId: 'ITM-1', name: 'LRU one' };
  sb.itemsData.push(it);
  sb.deriveRates(true);
  r1.rate = 9e-9;            // the engineer's hand edit
  it.rate = 7e-7;
  const p = sb.deriveRates(false);
  check('FMEA row reported OVERRIDDEN, not proposed', p.fmea.length === 0 &&
    p.skipped.some(s => s.kind === 'fmea' && /OVERRIDDEN/.test(s.why) && /protected/.test(s.why)));
  check('item reported OVERRIDDEN, not proposed', p.items.length === 0 &&
    p.skipped.some(s => s.kind === 'item' && /OVERRIDDEN/.test(s.why)));
  sb.deriveRates(true);
  check('apply leaves both hand values untouched', r1.rate === 9e-9 && it.rate === 7e-7);
}

// ---- [3] refusal over silent over-count -------------------------------------
console.log('\n[rate] multiple rows on one event with no α_FM → refused by name');
{
  const node = { id: 102, lambda: 5e-6 };
  const sb = sandbox([{ ref: 'BE-2', node }]);
  sb.projectConfig.ram.tasks.push({ id: 'T1', beRef: 'BE-2' });
  sb.fmeaData.push({ internalId: 1, fmeaType: 'piece-part', beId: 102, rate: 0 },
                   { internalId: 2, fmeaType: 'piece-part', beId: 102, rate: 0 });
  const p = sb.deriveRates(false);
  check('no write; both rows skipped with the apportion-first reason', p.fmea.length === 0 &&
    p.skipped.filter(s => /apportion first/.test(s.why)).length === 2);
  check('a library-owned row (parentLibKey) is skipped — one owner per number', (function () {
    sb.fmeaData.length = 0;
    sb.fmeaData.push({ internalId: 3, fmeaType: 'piece-part', beId: 102, parentLibKey: 'mil217_ic_linear', alphaFm: 0.5, rate: 1e-9 });
    const q = sb.deriveRates(false);
    return q.fmea.length === 0 && q.skipped.some(s => /component library/.test(s.why));
  })());
}

// ---- [4] item rate = Σλ over DISTINCT events --------------------------------
console.log('\n[rate] item rate sums distinct linked events, never double-counts');
{
  const n1 = { id: 201, lambda: 1e-5 }, n2 = { id: 202, lambda: 3e-6 };
  const sb = sandbox([{ ref: 'BE-A', node: n1 }, { ref: 'BE-B', node: n2 }]);
  sb.projectConfig.ram.tasks.push(
    { id: 'T1', itemId: 'ITM-2', beRef: 'BE-A' },
    { id: 'T2', itemId: 'ITM-2', beRef: 'BE-B' },
    { id: 'T3', itemId: 'ITM-2', beRef: 'BE-A' });   // same event twice — one λ
  const it = { internalId: 11, itemId: 'ITM-2', name: 'LRU two' };
  sb.itemsData.push(it);
  sb.deriveRates(true);
  check('Σλ over the two DISTINCT events (1.3e-5), duplicate link not double-counted',
    Math.abs(it.rate - 1.3e-5) < 1e-12 && it.rateSource.events === 2);
}

// ---- [5] wiring — floors, not literals (§7.3) -------------------------------
console.log('\n[wiring] pins and exports');
{
  const m = html.match(/ram_derive\.js\?v=([0-9.]+)/);
  check('index.html pins ram_derive at ≥ 1.1 (floor)', m && parseFloat(m[1]) >= 1.1, m && m[1]);
  check('deriveRates + ramApplyRates exported', /window\.deriveRates = deriveRates/.test(src) && /window\.ramApplyRates = ramApplyRates/.test(src));
  check('the Mx toolbar offers the rate write', /Write rates/.test(src) && /ramApplyRates\(\)/.test(src));
  check('the header records the SL-ARC-0001 §22 provenance and the override rule',
    /SL-ARC-0001 §22/.test(src) && /OVERRIDDEN/.test(src));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * Regression — fracas_slas.js v0.1 (FRACAS-3: SLAs, triage, KPI trending).
 *
 *   [1] policy: house defaults labeled as such; adoption demands a name;
 *       out-of-range values refused; adopted policy overrides.
 *   [2] clocks (deterministic, explicit today): triage OVERDUE past the SLA;
 *       closure on-time / due-soon / OVERDUE by severity tier; closed-late
 *       stays visible; target-date misses flagged; exception rollup.
 *   [3] triage: yes/no is explicit; a NO without rationale is REFUSED (a
 *       safety decision, not a checkbox); a name is demanded; YES may link
 *       an FC; the PR seed is copy-ready and never auto-raised.
 *   [4] trend: monthly buckets — opened/closed/open-at-end/overdue/MTTC/
 *       triaged%/repeat modes — all computed from the ledger.
 *   [5] INV-41 advisory: untriaged-past-SLA, relevant-but-unlinked, and
 *       overdue closures are named; clean ledgers stay silent.
 *   [6] wiring: renderLedger wrapped once; index tag; writes confined to
 *       triage records and the SLA policy.
 *
 * Run:  node tests/regression_fracas_slas.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

globalThis.window = globalThis;
globalThis.projectConfig = { ram: { field: [
  { id: 'FR-1', name: 'EMA actuator', incidents: [
    { id: 'INC-001', date: '2026-05-02', desc: 'winding open on climb', mode: 'winding open', severity: 'Critical',
      status: 'open', targetDate: '2026-06-01', repairHrs: 3 },
    { id: 'INC-002', date: '2026-06-20', desc: 'connector chafe', mode: 'chafe', severity: 'Low', status: 'open' },
    { id: 'INC-003', date: '2026-03-10', desc: 'winding open again', mode: 'winding open', severity: 'Critical',
      status: 'closed', corrective: 'harness reroute', verifiedBy: 'QA', verifiedAt: '2026-03-30' },
  ] },
  { id: 'FR-2', name: 'Pitot heater', incidents: [
    { id: 'INC-001', date: '2026-07-20', desc: 'element burnout', mode: 'burnout', severity: 'Medium', status: 'open' },
  ] },
] } };
const _inv = [];
globalThis.invRegister = i => _inv.push(i);
globalThis.commitSaveChanges = () => {};
globalThis.showToast = () => {};
const F = require('../site/fracas_slas.js');
const TODAY = '2026-07-26';

console.log('\n[1] policy');
let p = F.slaPolicy();
check('house defaults labeled house:true (triage 3d, Critical 30d, Low 180d)',
  p.house === true && p.triageDays === 3 && p.closeDays.Critical === 30 && p.closeDays.Low === 180);
check('adoption without a name refused', F.setSlaPolicy({ triageDays: 5 }, '') === false && F.slaPolicy().house === true);
check('out-of-range refused (triage 0d)', F.setSlaPolicy({ triageDays: 0 }, 'W. Lead') === false);
check('adoption records owner and overrides', F.setSlaPolicy({ triageDays: 5, closeDays: { Critical: 45 }, at: '2026-07-26' }, 'W. Lead') === true &&
  (p = F.slaPolicy()).house === false && p.adoptedBy === 'W. Lead' && p.triageDays === 5 && p.closeDays.Critical === 45 && p.closeDays.Low === 180);

console.log('\n[2] clocks');
const ram = projectConfig.ram;
const i1 = ram.field[0].incidents[0];   // Critical, opened 2026-05-02, open, target 06-01
let v = F.slaFor(i1, TODAY, p);
check('untriaged past the triage SLA → triage OVERDUE', v.triage === 'OVERDUE' && v.ageDays === 85);
check('Critical open 85d against 45d → closure OVERDUE', v.closure === 'OVERDUE' && v.limitDays === 45);
check('target date missed and flagged', v.targetMissed === true && v.exception === true);
const i2 = ram.field[0].incidents[1];   // Low, opened 06-20 → 36d, limit 180
v = F.slaFor(i2, TODAY, p);
check('Low at 36d of 180d → on-time (no exception beyond triage)', v.closure === 'on-time');
const i3 = ram.field[0].incidents[2];   // closed in 20 days, Critical 45 → on time
v = F.slaFor(i3, TODAY, p);
check('closed inside the tier → closed-on-time, no exception from closure', v.closure === 'closed-on-time' && v.cycleDays === 20);
check('due-soon fires above 80% of the tier',
  F.slaFor({ date: '2026-07-26', severity: 'Critical', status: 'open' }, '2026-09-04', p).closure === 'due-soon');
check('closed-late stays VISIBLE (an SLA miss does not vanish at closure)',
  F.slaFor({ date: '2026-01-01', severity: 'Critical', status: 'closed', verifiedAt: '2026-04-01' }, TODAY, p).closure === 'closed-late');

console.log('\n[3] triage');
check('non-boolean relevant refused', F.setTriage('FR-1', 'INC-001', { by: 'W' }) === false);
check('a NO without rationale is REFUSED (safety decision)', F.setTriage('FR-1', 'INC-002', { relevant: false, by: 'W', rationale: 'nah' }) === false);
check('a NO with rationale records', F.setTriage('FR-1', 'INC-002', { relevant: false, by: 'W. Lead', rationale: 'ground-service connector, no flight function', at: '2026-07-26' }) === true &&
  ram.field[0].incidents[1].triage.relevant === false);
check('nameless triage refused', F.setTriage('FR-1', 'INC-001', { relevant: true, by: ' ' }) === false);
check('a YES records with the FC link', F.setTriage('FR-1', 'INC-001', { relevant: true, linkedFcId: 'FC-012', by: 'W. Lead', at: '2026-07-26' }) === true &&
  ram.field[0].incidents[0].triage.linkedFcId === 'FC-012');
const seed = F.prSeed(ram.field[0], ram.field[0].incidents[0]);
check('PR seed is copy-ready and honest about not auto-raising',
  /INC-001/.test(seed.title) && seed.safetyRelated === true && seed.linked === 'FC-012' && /nothing is auto-written/.test(seed.note));
check('triage after the SLA clears the exception', F.slaFor(ram.field[0].incidents[0], TODAY, p).triage === 'triaged');

console.log('\n[4] trend');
const tr = F.trend(TODAY, 6);
check('six monthly buckets ending in the current month', tr.length === 6 && tr[5].month === '2026-07' && tr[0].month === '2026-02');
const may = tr.find(m => m.month === '2026-05'), mar = tr.find(m => m.month === '2026-03'), jul = tr.find(m => m.month === '2026-07');
check('opened counted in the month of occurrence', may.opened === 1 && jul.opened === 1);
check('closed counted with MTTC from date→verifiedAt (20 days)', mar.closed === 1 && mar.mttcDays === 20);
check('open-at-end cumulative and overdue tracked', jul.openAtEnd === 3 && jul.overdueAtEnd >= 1);
check('repeat modes flagged (winding open twice on FR-1)', jul.repeatModes === 1);
check('triaged % computed on the cohort', jul.triagedPct === 50);

console.log('\n[5] INV-41');
const inv = _inv.find(i => i.id === 'INV-41');
check('registered as advisory', !!inv && inv.sev === 'advisory');
const res = inv.run();
check('names untriaged-past-SLA and overdue closures (FR-2 burnout untriaged; none relevant-unlinked)',
  res.checked === 4 && res.fails.some(f => /UNTRIAGED/.test(f)) && res.fails.some(f => /closure SLA/.test(f)) &&
  !res.fails.some(f => /floating/.test(f)));
check('relevant-but-unlinked is named when it happens',
  (() => { ram.field[1].incidents[0].triage = { relevant: true, linkedFcId: null, by: 'X', at: TODAY };
           const r2 = inv.run(); delete ram.field[1].incidents[0].triage;
           return r2.fails.some(f => /floating/.test(f)); })());

console.log('\n[6] wiring');
const src = S('fracas_slas.js');
check('renderLedger wrap guarded (wraps once, rides every refresh)', /_slaWrapped/.test(src));
check('index.html ships fracas_slas.js after fracas_ledger.js',
  (() => { const idx = S('index.html'); const a = idx.indexOf('fracas_ledger.js'); const b = idx.indexOf('fracas_slas.js?v=');
           return a >= 0 && b > a; })());
check('writes confined to inc.triage and ram.slaPolicy',
  !/inc\.(status|corrective|severity|date)\s*=(?!=)/.test(src) && /r\.slaPolicy = cur/.test(src) && /inc\.triage = \{/.test(src));
check('deterministic core — explicit today everywhere except the UI edge',
  !/function slaFor[\s\S]{0,400}Date\.now/.test(src) && !/function trend[\s\S]{0,200}new Date\(\)/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

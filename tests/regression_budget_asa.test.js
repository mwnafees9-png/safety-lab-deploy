#!/usr/bin/env node
/*
 * Regression tests for Phase D gaps 3+1 — Budget Ledger + ASA working surface.
 *
 * Uses the REAL BDD engine (fta_engine.js) for every probability, the REAL
 * budget_ledger.js / asa_triage.js modules, and locks:
 *   [1] ledger rows: objective / allocated / achieved / posture verdicts,
 *       incl. EXCEEDS, unverified, meets-over-allocation, no-tree.
 *   [2] ASA pass-1 triage: closed-by-ssa vs aircraft-level (interdep ≥2) vs open.
 *   [3] ASA pass-2 measured re-run: externalSource leaves substituted with the
 *       mirror-achieved value (engine-verified expected P), uncovered leaves
 *       keep budget values and are counted honestly.
 *   [4] the F.4 triage gate.
 *   [5] the template-dictionary merge fix (new WS-B types reach the editor).
 *
 * Run:  node tests/regression_budget_asa.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const approx = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;

// ---- real BDD engine --------------------------------------------------------
eval(fs.readFileSync(path.join(__dirname, '..', 'site', 'fta_engine.js'), 'utf8'));
globalThis.window = globalThis;
globalThis.computeExactProbability = globalThis.SLFTAEngine.computeExactProbability;

// ---- project fixture --------------------------------------------------------
const BE = (id, p, extra) => Object.assign({ id, logicalId: 'L' + id, type: 'basic', probability: p, name: 'BE' + id, displayId: 'BE-' + id }, extra || {});
const OR = (id, kids) => ({ id, type: 'gate', gateType: 'OR', children: kids });

globalThis.getSafetyTarget = sev => sev === 'Catastrophic' ? { prob: 1e-9, dal: 'A' } : sev === 'Hazardous' ? { prob: 1e-7, dal: 'B' } : { prob: 1e-5, dal: 'C' };
globalThis.acFhaData = [
  { internalId: 'F1', fcId: 'FC-001', fcDesc: 'Loss of pitch (single system)', severity: 'Hazardous' },
  { internalId: 'F2', fcId: 'FC-002', fcDesc: 'Combined loss (multi system)', severity: 'Catastrophic' },
  { internalId: 'F3', fcId: 'FC-003', fcDesc: 'Unverified condition', severity: 'Hazardous' },
  { internalId: 'F4', fcId: 'FC-004', fcDesc: 'No tree yet', severity: 'Major' },
];
globalThis.systemsData = [
  { id: 'sys-A', name: 'Actuation', fha: [{ internalId: 'SF1', fcId: 'SFC-A1', fcDesc: 'sys A loss', severity: 'Hazardous' }] },
  { id: 'sys-B', name: 'Power', fha: [{ internalId: 'SF2', fcId: 'SFC-B1', fcDesc: 'sys B loss', severity: 'Hazardous' }] },
];
// FC-001: allocation 5e-8, mirror 3e-8 → meets 1e-7 objective.
// FC-003: allocation only → unverified.
// System A FHA SF1: allocation + mirror achieved 2e-8 (feeds pass-2 substitution).
// System B FHA SF2: allocation, NO mirror (uncovered leaf in pass-2).
// FC-002 MF&MS page 'mac-pg-R1': OR(leafA[SYS_SF1, budget 5e-8], leafB[SYS_SF2, budget 7e-8]).
globalThis.ftaPages = [
  { id: 'p-alloc-1', name: 'FC-001 allocation', linkedFhaIds: ['F1'], mode: 'top-down', root: OR(10, [BE(11, 2e-8), BE(12, 3e-8)]) },
  { id: 'p-mir-1', name: 'FC-001 verification', verifies: 'p-alloc-1', linkedFhaIds: ['F1'], mode: 'bottom-up', root: OR(20, [BE(21, 1e-8), BE(22, 2e-8)]) },
  { id: 'p-alloc-3', name: 'FC-003 allocation', linkedFhaIds: ['F3'], mode: 'top-down', root: OR(30, [BE(31, 4e-8)]) },
  { id: 'p-sysA', name: 'SFC-A1 allocation', linkedFhaIds: ['SF1'], systemId: 'sys-A', mode: 'top-down', root: OR(40, [BE(41, 5e-8)]) },
  { id: 'p-sysA-m', name: 'SFC-A1 verification', verifies: 'p-sysA', linkedFhaIds: ['SF1'], systemId: 'sys-A', mode: 'bottom-up', root: OR(50, [BE(51, 2e-8)]) },
  { id: 'p-sysB', name: 'SFC-B1 allocation', linkedFhaIds: ['SF2'], systemId: 'sys-B', mode: 'top-down', root: OR(60, [BE(61, 7e-8)]) },
  { id: 'mac-pg-R1', name: 'MF&MS · FC-002', linkedFhaId: 'F2', mode: 'top-down', root: OR(70, [
      BE(71, 5e-8, { externalSource: { kind: 'fha', targetId: 'SYS_SF1' } }),
      BE(72, 7e-8, { externalSource: { kind: 'fha', targetId: 'SYS_SF2' } }),
  ]) },
];
// Interdependence: FC-002 has two contributing systems; others single/none.
globalThis.idpCell = (fc, sysId) => (fc.internalId === 'F2') ? { state: 'contributes' }
  : (fc.internalId === 'F1' && sysId === 'sys-A') ? { state: 'contributes' } : { state: 'cleared' };

(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'site', 'budget_ledger.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'site', 'asa_triage.js'), 'utf8'));

console.log('\n[1] Budget ledger');
const rows = globalThis.budgetLedgerRows();
const r1 = rows.find(r => r.fcId === 'FC-001');
check('FC-001: allocated 5e-8 / achieved 3e-8 (engine-exact ±1e-12)', approx(r1.allocated, 5e-8, 1e-11) && approx(r1.achieved, 3e-8, 1e-11), JSON.stringify(r1));
check('FC-001 meets 1e-7 objective', r1.status === 'meets-objective' && r1.margin > 3 && r1.margin < 4, r1.status + ' ×' + r1.margin);
check('FC-003 unverified (no mirror)', rows.find(r => r.fcId === 'FC-003').status === 'unverified');
check('FC-004 no tree', rows.find(r => r.fcId === 'FC-004').status === 'no-tree');
check('system-scope rows present (SFC-A1 meets, SFC-B1 unverified)',
      rows.find(r => r.fcId === 'SFC-A1').status === 'meets-objective' && rows.find(r => r.fcId === 'SFC-B1').status === 'unverified');
const st = globalThis.budgetLedgerStats(rows);
// FC-002's MF&MS page is a budget lane with no mirror yet → correctly 'unverified'.
check('stats roll up (met=2, unverified=3 incl. the MF&MS budget lane, noTree=1)', st.met === 2 && st.unverified === 3 && st.noTree === 1, JSON.stringify(st));

console.log('\n[2] ASA pass-1 triage');
const tri = globalThis.asaTriage();
check('FC-001 → closed-by-ssa (single system, mirror meets)', tri.find(t => t.fcId === 'FC-001').cls === 'closed-by-ssa', JSON.stringify(tri.find(t => t.fcId === 'FC-001')));
const t2 = tri.find(t => t.fcId === 'FC-002');
check('FC-002 → aircraft-level (2 contributing systems) with its MF&MS page found', t2.cls === 'aircraft-level' && t2.systems.length === 2 && t2.mfms.length === 1, JSON.stringify(t2));
check('FC-003 → open (unverified)', tri.find(t => t.fcId === 'FC-003').cls === 'open');
check('FC-004 → open (no thread)', tri.find(t => t.fcId === 'FC-004').cls === 'open');

console.log('\n[3] ASA pass-2 measured re-run');
const run = globalThis.asaMeasuredRun('mac-pg-R1');
// budget lane: 1-(1-5e-8)(1-7e-8) ≈ 1.2e-7. measured: leaf A ← 2e-8 (SF1 mirror), leaf B uncovered keeps 7e-8 → ≈ 9e-8.
check('budget lane P(top) ≈ 1.2e-7 (engine)', approx(run.budget, 1.2e-7, 1e-12), String(run.budget));
check('measured lane substitutes SF1 mirror (2e-8): P ≈ 9e-8', approx(run.measured, 9e-8, 1e-12), String(run.measured));
check('coverage honest: 1/2 leaves measured, substitution recorded', run.substituted === 1 && run.totalLeaves === 2 && run.subs[0].system === 'Actuation', JSON.stringify(run.subs));
check('original page untouched (budget lane unchanged after run)', approx(globalThis.computeExactProbability(ftaPages.find(p => p.id === 'mac-pg-R1').root).prob, 1.2e-7, 1e-12));

console.log('\n[4] F.4 triage gate');
let gate = globalThis.asaTriageGate();
check('gate FAILS while FCs are open', gate.pass === false && /2 FC\(s\)/.test(gate.detail), JSON.stringify(gate));
// Close the two open FCs: give FC-003 a passing mirror; give FC-004 a tree+mirror.
ftaPages.push({ id: 'p-mir-3', name: 'FC-003 verification', verifies: 'p-alloc-3', linkedFhaIds: ['F3'], mode: 'bottom-up', root: OR(80, [BE(81, 1e-8)]) });
ftaPages.push({ id: 'p-alloc-4', name: 'FC-004 allocation', linkedFhaIds: ['F4'], mode: 'top-down', root: OR(90, [BE(91, 1e-6)]) });
ftaPages.push({ id: 'p-mir-4', name: 'FC-004 verification', verifies: 'p-alloc-4', linkedFhaIds: ['F4'], mode: 'bottom-up', root: OR(95, [BE(96, 1e-6)]) });
gate = globalThis.asaTriageGate();
check('gate PASSES once every FC is closed or treed at aircraft level', gate.pass === true, JSON.stringify(gate));

console.log('\n[5] template-dictionary merge fix');
globalThis.projectConfig = {}; globalThis.projectName = 'K350';
globalThis.fmeaData = []; globalThis.praData = []; globalThis.zsaData = []; globalThis.cmaData = [];
globalThis.acReqData = []; globalThis.acAssumptionsData = []; globalThis.acFunctionsData = []; globalThis.itemsData = [];
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, addEventListener: () => {}, setAttribute: () => {} }), addEventListener: () => {}, querySelector: () => null, body: { appendChild: () => {} } };
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'site', 'reports.js'), 'utf8'));
const T = globalThis.Reports.DEFAULT_TEMPLATES;
check('active dictionary has the v2 assessments AND the new WS-B family', !!T.SSA && !!T.RAM && !!T.FMEA && !!T.MSG3 && !!T.GTT,
      'keys: ' + Object.keys(T).join(','));
check('RAM template is the full skeleton, not a title stub', /R&M Program Report/.test(T.RAM) && /ram_ledger_table/.test(T.RAM));
check('active SSA template carries the Budget Ledger section', /budget_ledger_table/.test(T.SSA));
check('active ASA template carries the Budget vs Achieved roll-up', /budget_ledger_table/.test(T.ASA));
const led = globalThis.Reports.extractData('SSA', { systemId: 'sys-A' });
check('budget_ledger_table token builds (system scope filters to its own rows)', Array.isArray(led.budget_ledger_table) && led.budget_ledger_table.length >= 1 && led.budget_ledger_table.every(r => r['Scope'] !== 'Power' || r['FC'] === 'SFC-B1') && led.budget_ledger_table.some(r => r['FC'] === 'SFC-A1'), JSON.stringify(led.budget_ledger_table));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

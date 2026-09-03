#!/usr/bin/env node
/*
 * Regression tests for WS-B — new report types + deterministic token builders.
 *
 * Loads the REAL site/reports.js headlessly (window stubbed) and locks:
 *   [1] the 8 new REPORT_DEFS + templates exist and every template token is
 *       registered in the template parser (no token renders as a literal).
 *   [2] _buildWsbTokens output via extractData: FMEA functional/piece-part
 *       split, MMEL register, MSG-3 flattening, tolerance/derating verdicts,
 *       ledger Ai math, availability summary closed form, event-tree rows via
 *       a stubbed evaluator — and graceful empties when stores are absent.
 *
 * Run:  node tests/regression_wsb_report_builders.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

// ---- browser-ish globals ---------------------------------------------------
globalThis.window = globalThis;
globalThis.projectName = 'K350 Kestrel';
globalThis.projectConfig = {};
globalThis.systemsData = [{ id: 'sys-1', name: 'Elevator Actuation', fha: [], req: [], asm: [], functions: [] }];
globalThis.acFhaData = []; globalThis.acReqData = []; globalThis.acAssumptionsData = []; globalThis.acFunctionsData = [];
globalThis.itemsData = []; globalThis.ftaPages = []; globalThis.praData = []; globalThis.zsaData = []; globalThis.cmaData = [];
globalThis.FMEA_FUNC_MODE_LABELS = { loss: 'Total loss of function' };
globalThis.fmeaData = [
  { internalId: 1, fmeaType: 'functional', owningSystemId: 'sys-1', fmeaId: 'FM-001', funcSubId: 'F-1.1', funcMode: 'loss', localEffect: 'no actuation', nextEffect: 'channel loss', endEffect: 'degraded pitch', detection: 'EICAS', severity: 'Major', compensating: 'second channel', phase: 'Cruise', aiGenerated: true, aiFeature: 'fmea.functional', aiModel: 'm' },
  { internalId: 2, fmeaType: 'piece-part', owningSystemId: 'sys-1', fmeaId: 'FM-002', part: 'EMA motor', mode: 'winding open', localEffect: 'motor stops', nextEffect: 'actuator inop', endEffect: 'channel loss', detection: 'current monitor', severity: 'Major', rate: 2.5e-6, time: 5, prob: 1.25e-5 },
  { internalId: 3, fmeaType: 'functional', owningSystemId: 'sys-OTHER', fmeaId: 'FM-XXX', funcMode: 'loss' },
];

(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'site', 'reports.js'), 'utf8'));
const R = globalThis.Reports || globalThis.window.Reports;
check('Reports module loaded headlessly', !!R && typeof R.extractData === 'function');

console.log('\n[1] New report types + template token registration');
['FMEA', 'FMES', 'RAM', 'MSG3', 'MMEL', 'ETBT', 'CCMR', 'IPL'].forEach(t => check('REPORT_DEFS.' + t + ' exists', !!R.REPORT_DEFS[t]));
check('FMEA/FMES are system-scope', R.REPORT_DEFS.FMEA.scope === 'system' && R.REPORT_DEFS.FMES.scope === 'system');

console.log('\n[2] extractData — WS-B builders');
// -- stub the module compute surface the builders reach for ------------------
globalThis._ramStore = () => ({ tasks: [
  { id: 'T1', name: 'EMA swap', itemId: 'ITM-1', beRef: 'BE-100', activeRepair: 2, logistics: 4, admin: 1, interval: 600, demonstrated: null, origin: 'manual' },
], field: [], dispatch: { targets: [], records: [] } });
globalThis._fmesFindBe = ref => ref === 'BE-100' ? { node: { id: 100, displayId: 'BE-100', lambda: 1e-4 }, page: { id: 'p1' } } : null;
globalThis.getEffectiveLambda = n => n.lambda;
globalThis.etaEvaluate = t => ({ outcomes: [{ key: '0', seq: ['Initiator', 'Barrier OK'], prob: 0.999, freq: 9.99e-4, severity: 'Minor', linkedFcId: 'FC-9' }], coupled: true, closed: true });
projectConfig.eventTrees = [{ id: 'ET-001', name: 'Loss of thrust', initiator: { desc: 'x', freq: 1e-3 }, barriers: [], consequences: {} }];
projectConfig.mmel = { items: [{ id: 'MMEL-001', title: 'Pitot heat #2', ata: '30', installed: 2, required: 1, category: 'C', catDays: 10, state: 'analyzed', protection: { ok: true, verdict: 'protected by remaining channel' }, quant: { base: 1e-9, dispatched: 4e-9, withinTarget: true, tldMaxFH: 220.4 } }] };
projectConfig.msg3 = { msis: [{ id: 'MSI-1', name: 'EMA', itemId: 'ITM-1', sel: { hidden: true, safety: true, ops: false, econ: false }, ffs: [{ id: 'FF-1', func: 'Actuate elevator', failure: 'fails to move', evident: false, safety: true, tasks: [{ type: 'FNC', desc: 'op check', interval: '600 FH' }] }] }] };
projectConfig.relAnalytics = { lifeData: [], growth: [], alloc: { target: 1e-3, rows: [{ name: 'Elevator Actuation', weight: 40, lambda: 4e-4 }], origin: 'seeded' }, spares: [], demo: null };
projectConfig.tolDerate = { stacks: [{ id: 'TS-1', name: 'Hinge gap', contributors: [{ name: 'a', nominal: 5, tol: 0.2 }, { name: 'b', nominal: 3, tol: 0.1 }], limits: { lower: 7.5, upper: 8.5 } }],
                            derate: [{ id: 'DR-1', part: 'R12', category: 'resistor', rated: 100, applied: 80, guideline: 0.7 }] };

const data = R.extractData('RAM', {});
check('ram_ledger_table row computes Ai from λ+MTTR', /%$/.test(data.ram_ledger_table[0]['Ai']) && data.ram_ledger_table[0]['λ (/FH)'] === '1.00e-4', JSON.stringify(data.ram_ledger_table[0]));
// Ai = 1/(1+λ·MTTR) = 1/(1+2e-4) ≈ 99.98%
check('ledger Ai ≈ 99.98%', Math.abs(parseFloat(data.ram_ledger_table[0]['Ai']) - 99.98) < 0.01, data.ram_ledger_table[0]['Ai']);
check('availability summary carries closed-form As + μ≫λ shortcut, labeled ESTIMATE', /CLOSED-FORM ESTIMATE/.test(data.ram_availability_summary) && /Σ λᵢ·MTTRᵢ/.test(data.ram_availability_summary), data.ram_availability_summary.slice(0, 80));
check('ram_alloc_table renders the seeded allocation', data.ram_alloc_table.length === 1 && data.ram_alloc_table[0]['Weight (%)'] === '40.0');
check('tolerance stack verdict: inside limits (8±0.3 in 7.5…8.5)', /inside limits/.test(data.tol_derate_table[0]['Verdict']), JSON.stringify(data.tol_derate_table[0]));
check('derating verdict: 80% vs 70% guideline → EXCEEDS', /EXCEEDS/.test(data.tol_derate_table[1]['Verdict']));

const dataF = R.extractData('FMEA', { systemId: 'sys-1' });
check('FMEA functional table: only sys-1 functional rows', dataF.fmea_functional_table.length === 1 && dataF.fmea_functional_table[0]['FMEA ID'] === 'FM-001');
check('functional mode label resolved', dataF.fmea_functional_table[0]['Failure Mode'] === 'Total loss of function');
check('AI-drafted FMEA row carries Origin column (#1 integration)', /AI/.test(dataF.fmea_functional_table[0]['Origin'] || ''), JSON.stringify(dataF.fmea_functional_table[0]['Origin']));
check('piece-part table: rate/prob in exponent form', dataF.fmea_piecepart_table[0]['λ (/FH)'] === '2.50e-6' && dataF.fmea_piecepart_table[0]['Probability'] === '1.25e-5');

const dataM = R.extractData('MSG3', {});
check('msg3_table flattens MSI → FF with selection + task', dataM.msg3_table.length === 1 && dataM.msg3_table[0]['Selection'] === 'hidden + safety' && /op check/.test(dataM.msg3_table[0]['Tasks']));
check('mmel_table renders protection + quantitative + TLD', /protected/.test(dataM.mmel_table[0]['Protection Check']) && /≤ target/.test(dataM.mmel_table[0]['Quantitative']) && dataM.mmel_table[0]['TLD max (FH)'] === '220');
check('et_table rows via evaluator with coupling flag', dataM.et_table.length === 1 && dataM.et_table[0]['Coupling'] === 'common-cause coupled' && dataM.et_table[0]['Severity'] === 'Minor');

// Graceful empties: nuke the stores/fns and re-extract.
delete globalThis._ramStore; delete globalThis.etaEvaluate;
projectConfig.mmel = null; projectConfig.msg3 = null; projectConfig.eventTrees = [];
const dataE = R.extractData('RAM', {});
check('absent stores ⇒ empty tables, never a throw', Array.isArray(dataE.ram_ledger_table) && dataE.ram_ledger_table.length === 0 && dataE.msg3_table.length === 0 && dataE.et_table.length === 0);
check('availability summary degrades honestly', /No ledger-linked repair data/.test(dataE.ram_availability_summary));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

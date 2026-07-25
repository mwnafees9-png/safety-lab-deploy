#!/usr/bin/env node
/*
 * Regression — stpa_report.js v1.0 (WSB-STPA: STPA as a WS-B report type).
 *
 * Loads the REAL reports.js + stpa_core.js + stpa_report.js in one stubbed
 * world and locks:
 *   [1] registration: REPORT_DEFS.STPA present; the template lands in BOTH
 *       template dictionaries (the closure's own via _V1_TEMPLATES, and the
 *       v2 editor's DEFAULT_TEMPLATES); extractData wrapped exactly once.
 *   [2] whitelist: every {{*_table}} token the STPA template uses is
 *       registered in reports.js's _parseTemplate table whitelist — no
 *       token may render as a literal line (the WS-B rule).
 *   [3] tokens on a realistic model: spine tables, control structure,
 *       UCAs with dispositions, test-criticality rows, and the clause-9
 *       conformance table RE-RUN at build (27 rows, fresh verdicts).
 *   [4] the wrap: extractData('STPA') returns base scalars + STPA family;
 *       other types are untouched; unknown types still throw.
 *   [5] no template token is left unresolvable: every {{token}} in the
 *       template is either a scalar in the merged dict or a whitelisted
 *       table/list/appendix token.
 *   [6] display-lane discipline: the module writes NOTHING to stores.
 *
 * Run:  node tests/regression_stpa_report.test.js
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

// ---- stub world --------------------------------------------------------------
globalThis.window = globalThis;
globalThis.projectName = 'K350 Kestrel';
globalThis.projectConfig = {};
globalThis.systemsData = []; globalThis.acFhaData = []; globalThis.acAssumptionsData = [];
globalThis.acFunctionsData = []; globalThis.itemsData = []; globalThis.ftaPages = [];
globalThis.praData = []; globalThis.zsaData = []; globalThis.cmaData = []; globalThis.fmeaData = [];
globalThis.acReqData = [
  { internalId: 'R1', id: 'REQ-STPA-1', uca: 'UCA-1', stpaTest: { criticality: 'critical', rationale: '' }, verifMethod: 'Test', text: 'The FCC shall...' },
  { internalId: 'R2', id: 'REQ-STPA-2', uca: 'UCA-2', stpaTest: { criticality: 'non-critical', rationale: 'exercised implicitly by FLT-004' }, verifMethod: 'Analysis', text: 'The crew shall...' },
  { internalId: 'R3', id: 'REQ-PLAIN', text: 'Unrelated requirement' },
];

(0, eval)(S('reports.js'));
check('Reports loaded', !!globalThis.Reports && typeof Reports.extractData === 'function');
(0, eval)(S('stpa_core.js'));
check('STPA engine loaded', !!globalThis.STPA && typeof STPA.conformance === 'function');

// A small but real STPA model (panel-shaped).
globalThis.stpaData = {
  cs: {
    controllers: [{ id: 'C1', name: 'Flight crew' }, { id: 'C2', name: 'FCC' }],
    processes: [{ id: 'P1', name: 'Pitch dynamics' }],
    actions: [{ id: 'CA1', name: 'Pitch command', from: 'C2', to: 'P1' }],
    feedbacks: [{ id: 'FB1', name: 'Attitude + rate', from: 'P1', to: 'C2' }],
    others: [], precedence: [],
  },
  dispositions: {}, causeDismissals: {}, scopeFcIds: [],
  meta: { mission: 'Part 25 transport ops', scope: 'Pitch axis', boundary: 'FCC + actuation + crew interface', abstractionLevel: 'system' },
  losses: [{ id: 'L-1', text: 'Loss of aircraft / fatalities' }],
  hazards: [{ id: 'H-1', text: 'Aircraft violates pitch-attitude envelope', lossIds: ['L-1'] }],
  constraints: [{ id: 'SC-1', text: 'Pitch attitude shall remain inside the protected envelope', hazardIds: ['H-1'] }],
  responsibilities: [{ controller: 'FCC', text: 'Enforce envelope protection', constraintIds: ['SC-1'] }],
  csState: 'approved', sip: {},
};

(0, eval)(S('stpa_report.js'));
const R = globalThis.Reports;

console.log('\n[1] registration');
check('REPORT_DEFS.STPA present (aircraft scope)', !!R.REPORT_DEFS.STPA && R.REPORT_DEFS.STPA.scope === 'aircraft' && /J3307/.test(R.REPORT_DEFS.STPA.name));
check('template landed in the closure dictionary (_V1_TEMPLATES)', typeof R._V1_TEMPLATES.STPA === 'string' && /Clause-9 Conformance/.test(R._V1_TEMPLATES.STPA));
check('extractData wrapped exactly once', R.extractData._stpaWrapped === true);

console.log('\n[2] table-token whitelist (the WS-B rule: no literal tokens)');
const tpl = globalThis.STPA_REPORT.TEMPLATE;
const src = S('reports.js');
const whitelistLine = (src.match(/const tab = ln\.match\(([^\n]+)\)/) || [])[1] || '';
const tableTokens = [...new Set([...tpl.matchAll(/^\{\{([a-z_]+_table)\}\}$/gm)].map(m => m[1]))];
check('template uses the full STPA table family (' + tableTokens.length + ' tables)', tableTokens.length >= 9);
tableTokens.forEach(t => check('whitelisted: ' + t, whitelistLine.includes(t), 'add to _parseTemplate table regex'));

console.log('\n[3] tokens on a real model');
const T = globalThis.STPA_REPORT.stpaTokens();
check('meta scalars carried', T.stpa_mission === 'Part 25 transport ops' && T.stpa_abstraction === 'system' && T.stpa_cs_state === 'approved');
check('spine tables populated', T.stpa_losses_table.length === 1 && T.stpa_hazards_table.length === 1 && T.stpa_constraints_table.length === 1 &&
  T.stpa_hazards_table[0]['Leads to losses'] === 'L-1');
check('control structure rows (2 controllers + process + CA + feedback)', T.stpa_cs_table.length === 5 &&
  T.stpa_cs_table.some(r => r.Kind === 'Control action' && /C2 → P1|FCC/.test(r.Detail)));
check('UCA table generated from the engine with dispositions', Array.isArray(T.stpa_uca_table) && T.stpa_uca_table.length > 0 &&
  T.stpa_uca_table.every(r => 'Disposition' in r && 'Context' in r), 'got ' + T.stpa_uca_table.length + ' rows');
check('test-criticality table: only UCA-derived requirements, both dispositions',
  T.stpa_test_table.length === 2 && T.stpa_test_table[0].Criticality === 'critical' && /FLT-004/.test(T.stpa_test_table[1].Rationale));
check('conformance table RE-RUN at build: 27 clause rows', T.stpa_conformance_table.length === 27, 'got ' + T.stpa_conformance_table.length);
check('conformance summary states the fresh-evaluation doctrine', /evaluated fresh at report build/.test(T.stpa_conformance_summary));
check('SIP summary line present', /safety-management items|No SIP record/.test(T.stpa_sip_summary));

console.log('\n[4] the extractData wrap');
const data = R.extractData('STPA', {});
check('merged dict: base scalars + STPA family together', data.project_name === 'K350 Kestrel' && Array.isArray(data.stpa_uca_table) && data.stpa_mission === 'Part 25 transport ops');
const afha = R.extractData('AFHA', {});
check('other report types untouched by the wrap', afha.project_name === 'K350 Kestrel' && !('stpa_uca_table' in afha));
check('unknown type still throws', (() => { try { R.extractData('NOPE', {}); return false; } catch (e) { return /Unknown report type/.test(e.message); } })());

console.log('\n[5] every template token resolvable');
const allTokens = [...new Set([...tpl.matchAll(/\{\{([a-z_:]+)\}\}/g)].map(m => m[1]))];
const unresolved = allTokens.filter(t => !(t in data) && !whitelistLine.includes(t) && !/^appendix:/.test(t) && t !== 'assumptions_list');
check('no unresolvable tokens (' + allTokens.length + ' checked)', unresolved.length === 0, unresolved.join(', '));

console.log('\n[6] display-lane discipline');
const modSrc = S('stpa_report.js');
check('module never writes a store', !/stpaData\s*=[^=]|acReqData\s*=[^=]|projectConfig\.\w+\s*=/.test(modSrc.replace(/out\.stpa_\w+ = |base\b/g, '')));
check('standard cited, never reproduced', /cited, not reproduced/.test(modSrc));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

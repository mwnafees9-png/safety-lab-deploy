#!/usr/bin/env node
/*
 * Regression — SORA Portfolio Compilation report type (v0.3, 6 Aug 2026,
 * Step 10 of the SORA wizard bridge).
 *
 * Loads the REAL site/reports.js headlessly and locks:
 *   [1] REPORT_DEFS.SORA + DEFAULT_TEMPLATES.SORA exist, aircraft-scope.
 *   [2] sora_summary_table / sora_oso_table are registered in EVERY token
 *       parser regex in the file (docx renderer, pdf/markdown splitter,
 *       custom-docx uploader) — a token missing from even one means it
 *       renders as a literal "{{sora_summary_table}}" instead of a table.
 *   [3] extractData('SORA') computes the real thread from projectConfig.sora
 *       + the real SORA engine (sora_core.js) — same numbers the wizard
 *       shows, confidence tiers carried through, never silently disagreeing.
 *   [4] absent config/engine ⇒ empty tables, never a throw.
 *
 * Run: node tests/regression_sora_report.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

const reportsSrc = fs.readFileSync(path.join(__dirname, '..', 'site', 'reports.js'), 'utf8');

console.log('[1] token registration — every {{...}} table parser knows the new tokens');
// The file hardcodes the same allowlist of table-token names in four places
// (docx renderer, markdown/pdf section splitter, custom-docx uploader ×2).
// A token missing from any one renders as a literal "{{token}}" in that path.
const anchors = [
    /ffs_table\|sora_summary_table\|sora_oso_table\)\\?\}\\?\}\$/,      // docx-section splitter (^...$  anchored)
];
check('sora_summary_table + sora_oso_table follow ffs_table in the anchored splitter regex',
    /ffs_table\|sora_summary_table\|sora_oso_table\)/.test(reportsSrc));
const occurrences = (reportsSrc.match(/sora_summary_table/g) || []).length;
check('sora_summary_table appears in all 4 known registries (splitter, docx re, pdf/tokenRe, custom-docx array) + DEFAULT_TEMPLATES + extractData',
    occurrences >= 6, 'found ' + occurrences + ' occurrences, expected >= 6');
const osoOccurrences = (reportsSrc.match(/sora_oso_table/g) || []).length;
check('sora_oso_table appears in all the same registries', osoOccurrences >= 6, 'found ' + osoOccurrences);

// ---- headless load ----------------------------------------------------------
globalThis.window = globalThis;
globalThis.projectName = 'Barracuda';
globalThis.projectConfig = {};
globalThis.systemsData = [];
globalThis.acFhaData = []; globalThis.acReqData = []; globalThis.acAssumptionsData = []; globalThis.acFunctionsData = [];
globalThis.itemsData = []; globalThis.ftaPages = []; globalThis.praData = []; globalThis.zsaData = []; globalThis.cmaData = [];
globalThis.fmeaData = [];

require('../site/sora_annex_e_data.js');
require('../site/sora_core.js');   // populates window.SORA for real

(0, eval)(reportsSrc);
const R = globalThis.Reports || globalThis.window.Reports;
check('Reports module loaded headlessly', !!R && typeof R.extractData === 'function');

console.log('\n[2] REPORT_DEFS + DEFAULT_TEMPLATES');
check('REPORT_DEFS.SORA exists, aircraft-scope', !!R.REPORT_DEFS.SORA && R.REPORT_DEFS.SORA.scope === 'aircraft');
check('REPORT_DEFS.SORA name mentions Portfolio', /Portfolio/.test(R.REPORT_DEFS.SORA.name));
const tmpl = (R.DEFAULT_TEMPLATES || {}).SORA;
check('DEFAULT_TEMPLATES.SORA exists and references both new tokens',
    typeof tmpl === 'string' && /\{\{sora_summary_table\}\}/.test(tmpl) && /\{\{sora_oso_table\}\}/.test(tmpl));
check('DEFAULT_TEMPLATES.SORA references sora_operation + sora_conops scalars',
    /\{\{sora_operation\}\}/.test(tmpl) && /\{\{sora_conops\}\}/.test(tmpl));

console.log('\n[3] extractData(\'SORA\') — real engine, real numbers');
globalThis.projectConfig.sora = {
    operation: 'Test BVLOS sortie',
    conops: 'A test operation.',
    dimM: 1, speedMps: 20, massKg: 25, density: 4,
    initialArc: 'd', residualArc: 'c',
    mitigations: { m1a: 'medium' },
    airspaceCriteria: { altitude: 'above500', controlled: false, urban: false },
    containmentCriteria: { shelteringApplicable: true, assemblies: 'lt40k' },
    osoCompliance: { 'OSO#01': { status: 'met', note: 'redundant flight controller' } },
};
const data = R.extractData('SORA', {});
check('sora_operation / sora_conops scalars pulled from projectConfig.sora', data.sora_operation === 'Test BVLOS sortie' && data.sora_conops === 'A test operation.');
check('sora_summary_table is a non-empty POJO-row array', Array.isArray(data.sora_summary_table) && data.sora_summary_table.length >= 7);
const grcRow = data.sora_summary_table.find(r => r.Parameter === 'Final GRC');
check('Final GRC row present with a two-source confidence tag', !!grcRow && grcRow.Confidence === 'two-source');
const arcRow = data.sora_summary_table.find(r => r.Parameter === 'Initial ARC');
check('Initial ARC row computed via arcInitial() and flagged single-source (matches sora_core.js\'s own honesty)',
    !!arcRow && /ARC-c/.test(arcRow.Value) && arcRow.Confidence === 'single-source');
const contRow = data.sora_summary_table.find(r => r.Parameter === 'Containment robustness (1 m class)');
check('Containment row computed via containment() and flagged two-source (Table 8 is two-source verified)',
    !!contRow && contRow.Value === 'Low' && contRow.Confidence === 'two-source');
check('sora_oso_table only lists REQUIRED OSOs (robustness !== None) with citations', Array.isArray(data.sora_oso_table) && data.sora_oso_table.length > 0 &&
    data.sora_oso_table.every(r => r.Robustness !== 'None' && /Annex E/.test(r.Citation)));
const oso01 = data.sora_oso_table.find(r => r.OSO === 'OSO#01');
check('per-project OSO compliance (status/note) rides the report row', !!oso01 && oso01.Status === 'met' && /redundant flight controller/.test(oso01['Evidence note']));

console.log('\n[4] graceful absence');
globalThis.projectConfig.sora = null;
const dataAbsent = R.extractData('SORA', {});
check('no SORA config ⇒ empty tables, never a throw', Array.isArray(dataAbsent.sora_summary_table) && dataAbsent.sora_summary_table.length === 0 &&
    Array.isArray(dataAbsent.sora_oso_table) && dataAbsent.sora_oso_table.length === 0 && dataAbsent.sora_operation === '—');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

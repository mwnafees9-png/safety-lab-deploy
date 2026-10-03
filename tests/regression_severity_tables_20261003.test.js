#!/usr/bin/env node
/*
 * Regression: the severity definitions table follows the certification basis (3 Oct 2026).
 *
 * Waqas: "I want these definitions to match part 23/25 or whatever part the cert basis
 * dictates, why is the CAT definition with more context than the rest?" The page table
 * was hard-coded to Part 25 wording with a one-off note under Catastrophic, copied into
 * two exports. Now one data set per basis (severity_tables.js) drives the page and both
 * exports. This suite pins:
 *   1. the wording, cell for cell, against the source documents (checked 3 Oct 2026):
 *      AC 25.1309-1B Table 4-1, AC 23.1309-1E Figure 2, AC 27.1309-2 / AC 29.1309-2 (Chg 9),
 *      14 CFR 33.75(g), 35.15(g); SC-VTOL is a labeled summary (EASA text not reproduced);
 *   2. every class row is built the same way: four plain cells, no extra context in any
 *      one row; a basis' notes sit in one list under the table, each with its source;
 *   3. EXECUTED: the page and the exports show the same words for the project's basis,
 *      for every basis on the certification basis menu and both spellings of the name;
 *   4. the old hard-coded table and export rows are gone; the wiring and pins.
 * Run: node tests/regression_severity_tables_20261003.test.js
 * Mutation runs: SLAB_SITE=/path/to/mutated/site node tests/regression_severity_tables_20261003.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = process.env.SLAB_SITE || path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const PIN = require('./lib/pinfloor.js');
delete require.cache[path.join(SITE, 'severity_tables.js')];
const T = require(path.join(SITE, 'severity_tables.js'));
const R = require(path.join(SITE, 'severity_rubrics.js'));
const idx = S('index.html'), sup = S('support_modules.js'), dops = S('data_ops_modules.js');

// The source documents' words, transcribed from the PDFs / eCFR on 3 Oct 2026 (cls → [aircraft, occupants, crew, qualitative]).
const SRC = {
  'Part 25': {
    Catastrophic: ['Normally with hull loss', 'Multiple fatalities', 'Fatalities or incapacitation', 'Extremely improbable'],
    Hazardous: ['Large reduction in functional capabilities or safety margins', 'Serious or fatal injury to a small number of persons other than the flightcrew', 'Physical distress or excessive workload such that flightcrew cannot be relied upon to perform their tasks accurately or completely', 'Extremely remote'],
    Major: ['Significant reduction in safety margins or functional capabilities', 'Physical distress, possibly including injuries', 'A physical discomfort or significant increase in workload or in conditions impairing the efficiency of the flightcrew', 'Remote'],
    Minor: ['Slight reduction in functional capabilities or safety margins', 'Physical discomfort', 'Slight increase in workload', 'Probable'],
    Negligible: ['No effect on operational capabilities or safety', 'Inconvenience', 'No effect on flightcrew workload', 'No Probability Requirement'] },
  'Part 23': {
    Catastrophic: ['Normally with hull loss', 'Multiple fatalities', 'Fatal Injury or incapacitation', 'Extremely Improbable'],
    Hazardous: ['Large reduction in functional capabilities or safety margins', 'Serious or fatal injury to an occupant', 'Physical distress or excessive workload impairs ability to perform tasks', 'Extremely Remote'],
    Major: ['Significant reduction in functional capabilities or safety margins', 'Physical distress to passengers, possibly including injuries', 'Physical discomfort or a significant increase in workload', 'Remote'],
    Minor: ['Slight reduction in functional capabilities or safety margins', 'Physical discomfort for passengers', 'Slight increase in workload or use of emergency procedures', 'Probable'],
    Negligible: ['No effect on operational capabilities or safety', 'Inconvenience for passengers', 'No effect on flight crew', 'No Probability Requirement'] }
};
const ROTOR = {
  Catastrophic: ['Loss of rotorcraft', 'Multiple Fatalities', 'Fatalities or incapacitation', 'Extremely Improbable'],
  Hazardous: ['Large reduction in functional capabilities or safety margins (Note 4)', 'Serious or fatal injury to a passenger or a cabin crew member (Note 2)', 'Physical distress or excessive workload impairs ability to perform tasks accurately or completely', 'Extremely Remote'],
  Major: ['Significant reduction in functional capabilities or safety margin', 'Physical distress, possibly including injuries', 'Physical discomfort or a significant increase in workload or in conditions impairing crew efficiency', 'Remote'],
  Minor: [null, 'Physical discomfort', 'Slight increase in workload that involves crew actions well within crew capabilities such as routine flight plan changes', 'Reasonably Probable'],
  Negligible: ['No effect on operational capabilities or safety', 'Inconvenience', 'No effect on flight crew', 'Frequent'] };
SRC['Part 27'] = JSON.parse(JSON.stringify(ROTOR)); SRC['Part 27'].Minor[0] = 'Slight reduction in functional capabilities or safety margins';
SRC['Part 29'] = JSON.parse(JSON.stringify(ROTOR)); SRC['Part 29'].Minor[0] = 'Slight reduction in functional capabilities or safety';   // as printed in Chg 9

console.log('\n[1] the wording, cell for cell, against the source documents');
for (const basis of Object.keys(SRC)) {
  const t = T.tableFor({ regulation: basis });
  let bad = [];
  for (const cls of T.ORDER) {
    const got = (t.rows[cls] || {}).cells || [];
    SRC[basis][cls].forEach((w, i) => { if (got[i] !== w) bad.push(cls + '[' + i + '] "' + got[i] + '"'); });
  }
  check(basis + ': every cell matches the source document', bad.length === 0, bad.slice(0, 3).join('; '));
  check(basis + ': marked verbatim', t.verbatim === true);
}
check('Part 27/29 use the rotorcraft class name "Hazardous or Severe-Major" and "No Effect"',
      ['Part 27', 'Part 29'].every(b => T.tableFor({ regulation: b }).rows.Hazardous.label === 'Hazardous or Severe-Major' && T.tableFor({ regulation: b }).rows.Negligible.label === 'No Effect'));
{
  const e = T.tableFor({ regulation: 'SC-VTOL', scvtolCategory: 'Enhanced' }), b = T.tableFor({ regulation: 'SC-VTOL', scvtolCategory: 'Basic 2' });
  check('SC-VTOL is a labeled summary, never presented as EASA\'s words', e.verbatim === false && /Summary of EASA MOC SC-VTOL/.test(e.source) && /not reproduced/.test(e.source));
  check('SC-VTOL Enhanced: one or more fatalities is Catastrophic; Hazardous excludes fatalities', e.rows.Catastrophic.cells[1] === 'One or more fatalities' && /no fatality reasonably expected/.test(e.rows.Hazardous.cells[1]) && /continued safe flight and landing/.test(e.rows.Catastrophic.cells[0]));
  check('SC-VTOL Basic: multiple fatalities; serious or fatal injury is Hazardous; controlled emergency landing', b.rows.Catastrophic.cells[1] === 'Multiple fatalities' && /serious or fatal injury/i.test(b.rows.Hazardous.cells[1]) && /controlled emergency landing/.test(b.rows.Catastrophic.cells[0]));
}
{
  const e = T.tableFor({ regulation: 'Part 33' }), p = T.tableFor({ regulation: 'Part 35' });
  check('Part 33: the three engine effects of §33.75(g), verbatim', e.kind === 'effects' && e.rows.length === 3 && /\(vii\) Complete inability to shut the engine down\./.test(e.rows[0].cells[0]) && /only consequence is partial or complete loss of thrust or power/.test(e.rows[2].cells[0]));
  check('Part 35: the hazardous and major propeller effects of §35.15(g), verbatim', p.kind === 'effects' && p.rows.length === 2 && /\(iv\) A failure that results in excessive unbalance\./.test(p.rows[0].cells[0]) && /significant uncontrollable torque or speed fluctuation/.test(p.rows[1].cells[0]));
  for (const b of ['Part 450', 'Part 107', 'Custom']) check(b + ': says plainly there is no five-class table here', T.tableFor({ regulation: b }).kind === 'none' && T.html({ regulation: b }).indexOf('<table') < 0);
}

console.log('\n[2] every class row is built the same way');
for (const key of ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'SC-VTOL Enhanced', 'SC-VTOL Basic']) {
  const t = T.TABLES[key];
  const shapes = T.ORDER.map(c => Array.isArray(t.rows[c].cells) && t.rows[c].cells.length === t.columns.length && t.rows[c].cells.every(x => typeof x === 'string' && x.length > 0 && x.indexOf('\n') < 0));
  check(key + ': five rows, each exactly one plain cell per column', shapes.every(Boolean) && t.columns.length === 4);
  const lens = T.ORDER.map(c => t.rows[c].cells[0].length);
  check(key + ': no one row carries extra context (Catastrophic aircraft cell not padded with notes)', !/AC \d|§|Note 1|\(AC/.test(t.rows.Catastrophic.cells[0]) || key.startsWith('SC-VTOL'), t.rows.Catastrophic.cells[0]);
  check(key + ': notes live in one list, each naming its source', (t.notes || []).every(n => n.ref && n.text));
}
{
  const h = T.html({ regulation: 'Part 25' });
  check('EXECUTED: the page table has no sub-note inside any cell', !/<td>[^<]*<div/.test(h) && (h.match(/<tr>/g) || []).length === 6);
  check('EXECUTED: the "prevent continued safe flight and landing" note is a footnote, not in the Catastrophic row', /<li><strong>AC 25.1309-1B §3.1.5 Note 1:<\/strong>/.test(h) && !/<td>Normally with hull loss[^<]+/.test(h));
}

console.log('\n[3] EXECUTED: page and exports show the same words for the project\'s basis');
const MENU = (idx.match(/<select id="proj-regulation"[\s\S]*?<\/select>/) || [''])[0].match(/value="([^"]+)"/g).map(v => v.slice(7, -1));
check('the certification basis menu was read', MENU.length >= 9, MENU.join(','));
for (const reg of MENU) {
  const cfg = { regulation: reg, scvtolCategory: 'Basic 1' };
  const t = T.tableFor(cfg), ex = T.exportTable(cfg), h = T.html(cfg);
  const cells = T.rowsOf(t).reduce((a, r) => a.concat(r.cells), []);
  const exCells = ex.rows.reduce((a, r) => a.concat(r.slice(1)), []);
  check(reg + ': resolves to its own table (never silently Part 25)', t.basis.indexOf(reg === 'SC-VTOL' ? 'SC-VTOL' : reg) === 0, t.basis);
  check(reg + ': the export carries every cell the page shows', cells.every(c => exCells.indexOf(c) >= 0));
  check(reg + ': every export row as wide as its header', ex.rows.every(r => r.length === ex.headers.length));
  if (t.kind !== 'none') check(reg + ': the page shows every cell', cells.every(c => h.indexOf(c.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/10\^(-?\d+)/g, '10<sup>$1</sup>')) >= 0));
}
check('both spellings: "part-23" and "Part 23" give the same table', T.tableFor({ regulation: 'part-23' }) === T.TABLES['Part 23']);
check('both spellings: "sc-vtol" + Enhanced', T.tableFor({ regulation: 'sc-vtol', scvtolCategory: 'Enhanced' }) === T.TABLES['SC-VTOL Enhanced']);
check('no basis set reads as Part 25 (the default the rest of the app uses)', T.tableFor({}) === T.TABLES['Part 25']);
{
  const DOC = { 'Part 25': 'AC 25.1309-1B', 'Part 23': 'AC 23.1309-1E', 'Part 27': 'AC 27-1B', 'Part 29': 'AC 29-2C', 'SC-VTOL': 'MOC SC-VTOL', 'Part 33': '§33.75', 'Part 35': '§35.15' };
  const KEY = { 'Part 23': 'Part 23 IV', 'SC-VTOL': 'SC-VTOL Enhanced' };
  for (const reg of Object.keys(DOC)) {
    const t = T.tableFor({ regulation: reg, scvtolCategory: 'Enhanced' }), rub = R.rubricFor(KEY[reg] || reg);
    check(reg + ': the table and the AI rubric cite the same document (' + DOC[reg] + ')', t.source.indexOf(DOC[reg]) >= 0 && rub.indexOf(DOC[reg]) >= 0);
  }
}

console.log('\n[4] the old hard-coded table and export rows are gone; wiring');
check('the page has the basis-driven table host', /<div id="sev-def-table"><\/div>/.test(idx));
check('no hard-coded severity table left on the page', !/Normally with hull loss/.test(idx));
check('the old "Effect wording per FAA AC 25.1309-1B" claim is gone', !/Effect wording per FAA AC 25\.1309-1B/.test(idx));
check('no hard-coded definitions left in the exports', !/Normally with hull loss/.test(dops) && (dops.match(/SLSeverityTables\.exportTable\(projectConfig\)/g) || []).length === 2);
check('the certification basis page re-renders the table when the basis changes', /SLSeverityTables\.render\(projectConfig\)/.test(sup));
check('severity_tables.js loads after severity_rubrics.js', idx.indexOf('severity_tables.js?v=') > idx.indexOf('severity_rubrics.js?v='));
check('pins: severity_tables 1.0, support_modules 66.40, data_ops_modules 66.48',
      PIN.atLeast(idx, 'severity_tables.js', '1.0') && PIN.atLeast(idx, 'support_modules.js', '66.40') && PIN.atLeast(idx, 'data_ops_modules.js', '66.48'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

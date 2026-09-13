#!/usr/bin/env node
/*
 * Regression tests for WS-A — full report authoring (structure ops + program
 * template library). Loads the REAL site/reports.js headlessly and locks:
 *   [1] parseMarkdownToSections ⇄ _wsa.serialize round-trip (structure survives).
 *   [2] add / remove / move section ops on the modal state.
 *   [3] program template save → takes precedence on next parse → reset restores default.
 *
 * Run:  node tests/regression_wsa_authoring.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

(async function main() {   // R19 step 3: the remove step awaits the app dialog
globalThis.window = globalThis;
globalThis.projectConfig = {};
globalThis.projectName = 'K350';
globalThis.systemsData = []; globalThis.acFhaData = []; globalThis.acReqData = []; globalThis.acAssumptionsData = [];
globalThis.acFunctionsData = []; globalThis.itemsData = []; globalThis.ftaPages = []; globalThis.praData = [];
globalThis.zsaData = []; globalThis.cmaData = []; globalThis.fmeaData = [];
globalThis.showToast = () => {};
// minimal document so the v2 layer loads; serialize falls back to sec.prose when no DOM.
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, addEventListener: () => {}, setAttribute: () => {} }), addEventListener: () => {}, querySelector: () => null, body: { appendChild: () => {} } };

(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'site', 'reports.js'), 'utf8'));
const R = globalThis.Reports;
check('WS-A surface exported', R && R._wsa && typeof R._wsa.serialize === 'function' && typeof R.parseMarkdownToSections === 'function');

console.log('\n[1] markdown ⇄ sections round-trip');
const md = '# My Report\n\n## 1. Purpose\nWhy this exists with {{fha_table}} inside.\n\n## 2. Findings\nProse here.\n';
const secs = R.parseMarkdownToSections(md);
check('parse yields title + 2 sections', secs.length >= 3, JSON.stringify(secs.map(s => s.heading)));
R._wsa.setState({ reportType: 'AFHA', sections: secs });
const out = R._wsa.serialize(R._wsa.state());
check('serialize keeps headings', /## 1\. Purpose/.test(out) && /## 2\. Findings/.test(out), out);
check('serialize keeps tokens verbatim', /\{\{fha_table\}\}/.test(out));
const reparsed = R.parseMarkdownToSections(out);
check('round-trip stable (same heading sequence)', JSON.stringify(reparsed.map(s => s.heading)) === JSON.stringify(secs.map(s => s.heading)),
      JSON.stringify(reparsed.map(s => s.heading)));

console.log('\n[2] structure ops');
const st = R._wsa.state();
const n0 = st.sections.length;
R._wsa.add(n0 - 1);
check('add appends a section', R._wsa.state().sections.length === n0 + 1 && /New section/.test(R._wsa.state().sections[n0].heading));
R._wsa.move(n0, -1);
check('move swaps order', R._wsa.state().sections[n0 - 1].heading === 'New section');
// R19 step 3 (13 Sep 2026): remove asks through the app's slConfirm (async) and is awaited here
globalThis.slConfirm = () => Promise.resolve(true);
await R._wsa.remove(n0 - 1);
check('remove deletes it', R._wsa.state().sections.length === n0 && !R._wsa.state().sections.some(s => s.heading === 'New section'));
globalThis.slConfirm = () => Promise.resolve(false);
await R._wsa.remove(n0 - 2);
check('a declined confirm removes nothing', R._wsa.state().sections.length === n0);

console.log('\n[3] program template library');
R._wsa.state().sections[1].heading = '1. Purpose (Program Style)';
R._wsa.save();
const saved = R._wsa.programTemplate('AFHA');
check('template saved on projectConfig with timestamp', !!saved && /Program Style/.test(saved.markdown) && !!saved.at, saved && saved.markdown.slice(0, 60));
const fresh = R.parseMarkdownToSections(saved.markdown);
check('saved template parses with the renamed heading', fresh.some(s => /Program Style/.test(s.heading || '')));
R._wsa.reset();
check('reset clears it and restores the default sections', R._wsa.programTemplate('AFHA') === null && R._wsa.state().sections.some(s => /Functional Hazard Inventory/.test(s.heading || '')),
      JSON.stringify(R._wsa.state().sections.map(s => s.heading)));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log('  FAIL  suite threw: ' + (e && e.stack || e)); process.exit(1); });

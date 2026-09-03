#!/usr/bin/env node
/*
 * Regression — creating a NEW project must not leave the previous one's DOM behind.
 *
 * THE BUG THIS PINS (found live, 1 Aug 2026). Open a project with FC-01…FC-30,
 * then create a new blank one. The FHA table is correctly empty — but the
 * combined failure-condition panel (#fcv-panel, injected by fc_variants.js) still
 * lists the OLD project's failure conditions, and keeps listing them for the
 * whole life of the new project.
 *
 * WHY IT SURVIVED SO LONG. Three things had to line up, and each looked fine on
 * its own:
 *
 *   1. _createNewProjectBlank() BLANKED 18 <tbody> elements by innerHTML = ''.
 *      That handles every table authored in index.html, so the visible tables
 *      were right and the bug looked like it could not exist.
 *   2. fc_variants.js does not own a tbody. It appends its own panel and keeps
 *      it fresh by WRAPPING renderACFHA. A wrapper only fires when the wrapped
 *      function is called, and this path called no renderer at all.
 *   3. Returning to the tab did not heal it: switchTab('ac-fha') repopulates
 *      that tab's dropdowns but deliberately not its table — a documented
 *      hazard (see the header of site/streaming_load.js). So nothing in the
 *      product would ever call renderACFHA again until the user edited a row.
 *
 * THE INVARIANT. Every project LOAD path re-renders the project-data tables
 * (loadProject, _restoreProjectSnapshot, _applyProjectData all do). The CREATE
 * path was the only one that blanked instead. These checks hold create to the
 * same rule, because "blank the DOM you know about" cannot cover panels that
 * other modules inject — and the whole point of the moat pattern is that
 * modules inject panels.
 *
 * Run: node tests/regression_new_project_dom.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const mfn = S('misc_fn_modules.js'), fcv = S('fc_variants.js'), sup = S('support_modules.js');

// The function under test, isolated from the 10k-line file around it.
const blank = (mfn.match(/function _createNewProjectBlank\(\)[\s\S]*?\n\}/) || [''])[0];

console.log('\n[new project] the reset path re-renders rather than only blanking');
check('_createNewProjectBlank was found', blank.length > 200);
check('it still blanks the authored tbodies', /innerHTML = ''/.test(blank));
check('…and now also re-renders the project-data tables',
  /renderACFHA/.test(blank) && /renderACFunctions/.test(blank),
  'blanking covers tables authored in index.html; it cannot cover a panel another module injected');

// The renderers are named as STRINGS on purpose. An array literal of bare
// identifiers evaluates every name before the loop body runs, so one renderer
// missing from a build would throw a ReferenceError out of new-project creation
// — the try/catch inside the loop cannot catch what the literal already threw.
check('renderers are referenced by NAME, not as bare identifiers',
  /\['renderACFunctions'/.test(blank) && /window\[name\]/.test(blank),
  'a bare-identifier array would take new-project creation down if any renderer were absent');
check('each call is individually guarded', /typeof fn === 'function'/.test(blank) && /catch \(_\) \{\}/.test(blank));

console.log('\n[new project] the specific panel that broke');
check('fc_variants keeps #fcv-panel fresh by wrapping renderACFHA',
  /window\.renderACFHA = wrapped/.test(fcv),
  'this is why the panel is invisible to a tbody-blanking reset');
check('the panel reads the live store rather than caching rows',
  /function _fha\(\)/.test(fcv) && !/_fhaCache/.test(fcv),
  'the data was never stale — only the DOM was');
check('so re-rendering the FHA is sufficient to clear it',
  /renderACFHA/.test(blank));

// If switchTab ever starts rendering the FHA table, the note above stops being
// true — but the fix stays correct, so this is a documentation check, not a trap.
check('switchTab still only repopulates dropdowns for ac-fha (the reason the tab could not self-heal)',
  /tabId === 'ac-fha'[\s\S]{0,220}populateDropdowns/.test(sup));

console.log('\n[new project] the class, not just the instance');
// jama_bridge wraps a renderer too, but its host tab DOES call that renderer on
// entry, so it self-heals. Pinning both keeps the distinction visible.
const jb = S('jama_bridge.js');
check('the other render-wrapping module is reachable from its own tab',
  /renderRequirementsRepository/.test(jb) && /renderRequirementsRepository\(\)/.test(sup),
  'jama_bridge is safe for a reason worth keeping true');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

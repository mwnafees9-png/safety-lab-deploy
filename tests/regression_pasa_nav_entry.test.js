#!/usr/bin/env node
/**
 * Regression — the PASA workspace (Interdependence & Common Resources · MAC Model · MF&MS · CoFFE)
 * had NO sidebar entry: the PASA group listed FTA, the CCA lanes and STPA only, so the two
 * integration tables and the MAC model were reachable by cockpit deep links alone.
 * (Waqas, 4 Sep 2026: "clicking PASA just drops down the menu which doesnt have the drop down
 * option for either of the two analyses".)
 * Run: node tests/regression_pasa_nav_entry.test.js
 */
const fs = require('fs'), path = require('path');
const idx = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const sup = fs.readFileSync(path.join(__dirname, '..', 'site', 'support_modules.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }
const grp = idx.slice(idx.indexOf('id="asb-grp-pasa"'), idx.indexOf('id="asb-grp-asa"'));
check('the PASA group opens with an entry for the PASA workspace itself', /<a class="asb-item sub" id="snav-pasa" onclick="switchTab\('pasa'\)"/.test(grp));
check('… it says what is on the page in words (no internal codes)', /PASA — interdependence · MAC · MF&amp;MS · CoFFE/.test(grp) && /Interdependence & Common Resources, MAC Model, MF&MS and CoFFE present as tabs on the page/.test(grp));
check('… and it comes BEFORE Fault Tree Analysis', grp.indexOf('id="snav-pasa"') < grp.indexOf('id="snav-fta"'));
check('switchTab knows the pasa tab and opens it on the Cockpit sub-tab', /'pasa'/.test(sup.slice(sup.indexOf('function switchTab('), sup.indexOf('function switchTab(') + 6000)) && /if \(tabId === 'pasa'\)\s+\{ try \{ pasaSub\('cockpit'\); \}/.test(sup));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

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
// 10 Nov 2026: the PASA page is the PASA Autopilot (interdependence, common resources and CoFFE answered in it)
check('… it says what is on the page in words (no internal codes)', /<span class="asb-lbl">PASA Autopilot<\/span>/.test(grp) && /the Interdependence, MAC and CoFFE Autopilots fill its interdependence, common resource, MAC and CoFFE tables/.test(grp));
check('… and it comes BEFORE Fault Tree Analysis', grp.indexOf('id="snav-pasa"') < grp.indexOf('id="snav-fta"'));
// 24 Nov 2026: the Interdependence, MAC and CoFFE Autopilots are on for everyone, with their own menu entry right after the PASA
check('the Interdependence, MAC and CoFFE Autopilots have a menu entry right after the PASA, opening the Interdependence tab', /<a class="asb-item sub" id="snav-apx" onclick="switchTab\('interdep'\)"[^>]*><span class="asb-lbl">Interdependence, MAC and CoFFE<\/span><\/a>/.test(grp) && grp.indexOf('id="snav-pasa"') < grp.indexOf('id="snav-apx"') && grp.indexOf('id="snav-apx"') < grp.indexOf('id="snav-ac-req"'));
const sw = sup.slice(sup.indexOf('function switchTab('), sup.indexOf('function switchTab(') + 6000);
check('switchTab knows the pasa tab; the old CoFFE and cockpit sub-pages open the PASA; the Interdependence tab is no longer sent there (24 Nov 2026: no team-only switch)', /'pasa'/.test(sw) && /if \(tabId === 'coffe' \|\| tabId === 'cockpit'\) \{ switchTab\('pasa'\); return; \}/.test(sw) && !/_apxOn/.test(sw) && !/tabId === 'interdep' &&/.test(sw));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

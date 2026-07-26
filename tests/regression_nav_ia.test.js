/* ============================================================================
 * regression_nav_ia.test.js — nav IA: Define > Analyze > Requirements, with
 * Safety (first) · Human factors · System lane (STPA) · R&M as categories
 * nested UNDER Analyze. Source-inspection; every relocated id survives.
 *
 * RECONCILED 26 Jul 2026 (Waqas confirmed intent): the shipped nav IS the
 * intended IA. The earlier plan's dedicated `asb-grp-analyze` wrapper was
 * superseded — `asb-grp-sys` carries the single Analyze label and hosts the
 * category sub-groups. R&M lives as the "R&M" category under Analyze (the
 * old top-LEVEL R&M group is what was retired). SORA Thread ships further
 * down the nav. Counts pinned to the reconciled inventory (75).
 * ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const idx = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n); } };
const at = m => idx.indexOf(m);

check('single Analyze top group (asb-grp-sys carries the one Analyze label)',
  (idx.match(/<span class="asb-lbl">Analyze<\/span>/g) || []).length === 1 &&
  (idx.match(/id="asb-grp-sys"/g) || []).length === 1);
check('top order Define < Analyze < Requirements',
  at('>Define</span>') < at('>Analyze</span>') && at('>Analyze</span>') < at('>Requirements</span>'));

check('Safety category nested under Analyze and FIRST',
  at('Safety</span>') > at('>Analyze</span>') && at('Safety</span>') < at('Human factors</span>'));
check('Human factors category after Safety', at('Human factors</span>') > at('Safety</span>'));
check('System lane (STPA) after Human factors', at('System lane</span>') > at('Human factors</span>'));
check('R&M category after System lane, before Requirements',
  at('R&amp;M</span>') > at('System lane</span>') && at('R&amp;M</span>') < at('>Requirements</span>'));

check('HFA pins preserved (snav-hfa once · view-hfa · label · Human factors cat)',
  (idx.match(/id="snav-hfa"/g) || []).length === 1 && idx.includes('id="view-hfa"') &&
  idx.includes('Human Factors Analysis (HFA)') && idx.includes('Human factors</span>'));
check('STPA stays in the System lane', idx.includes('id="snav-stpa"') && idx.includes('System lane</span>'));
check('SORA Thread shipped in the nav', idx.includes('id="snav-sora-thread"'));
check('Maintainability toggle id preserved (ram_modules keys off it)', idx.includes('id="asb-grp-ram-mx"'));

check('<details> balanced', (idx.match(/<details/g) || []).length === (idx.match(/<\/details>/g) || []).length);
check('snav inventory intact (75)', (idx.match(/id="snav-/g) || []).length === 75);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

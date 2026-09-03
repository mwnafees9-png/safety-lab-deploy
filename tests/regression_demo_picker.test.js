#!/usr/bin/env node
/*
 * Regression — demo-project picker (demo_picker.js).
 *   One chooser that lists every built-in showcase and routes to its existing
 *   loader. Verifies the module exposes openDemoPicker, OFFERS every demo that is
 *   currently in the line-up (asserted from the entries' own loader fields, never
 *   from a hardcoded trio — a bare /loadX/ match is satisfied by a COMMENT, which
 *   is how the retired Kestrel entry kept this suite green after it was removed),
 *   routes each to a real loader, and is wired into index.html.
 * Run: node tests/regression_demo_picker.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const p = S('demo_picker.js');
check('exposes window.openDemoPicker and the pick router', /window\.openDemoPicker\s*=/.test(p) && /window\.__slDemoPick\s*=/.test(p));
const offered = (p.match(/loader:\s*'([^']+)'/g) || []).map(m => m.replace(/.*'([^']+)'.*/, '$1'));
check('offers every demo in the current line-up, read from the entries themselves',
  ['loadSampleProject', 'loadSoraShowcase', 'loadHL1Demo', 'loadHalcyonDemo'].every(l => offered.indexOf(l) >= 0),
  'offered = ' + JSON.stringify(offered));
check('labels the categories (Part 23 / Part 25 / SORA)',
  /Part 23/.test(p) && /Part 25/.test(p) && /SORA/.test(p));
check('routes each card only through window[loaderName] (no eval)', /window\[loaderName\]/.test(p) && !/\beval\(/.test(p));
check('warns that loading replaces the current project', /replaces the current project/i.test(p));

const idx = S('index.html');
check('index.html loads demo_picker.js and wires the menu to openDemoPicker',
  /demo_picker\.js\?v=/.test(idx) && /openDemoPicker\(\)/.test(idx));
check('the scattered per-demo menu items were consolidated',
  !/onclick="loadKestrelRj\(\)"/.test(idx));

// the three loaders the picker targets must exist as globals in the codebase
const hasLoader = re => ['data_ops_modules.js', 'kestrel_showcase.js', 'sora_showcase_view.js'].some(f => { try { return re.test(S(f)); } catch (_) { return false; } });
check('every targeted loader is defined somewhere in the app',
  hasLoader(/function loadSampleProject/) && hasLoader(/window\.loadKestrelRj\s*=/) && hasLoader(/window\.loadSoraShowcase\s*=/));

// ---- Kestrel RJ: RETIRED FROM THE PICKER, NOT DELETED (4 Aug 2026) ----------
// Retiring a demo means it stops being offered, not that it stops existing. Both
// halves matter: an entry left in the list is a demo a prospect can open, and a
// loader deleted with the entry is a decision nobody can reverse without rewriting
// the builder. Pin the pair so neither half drifts.
const picker = S('demo_picker.js');
check('Kestrel RJ is no longer OFFERED — no live picker entry targets its loader',
  !/loader:\s*'loadKestrelRj'/.test(picker),
  'the entry was removed on 4 Aug; App Q 6/14 with 3 absent, and Part 25 is HL-1\'s position at greater depth');
check('…and the retirement is EXPLAINED where the entry used to be',
  /RETIRED 4 Aug 2026/.test(picker) && /NOT deleted/.test(picker),
  'a demo that vanishes without a reason reads as an accident to the next session');
check('…while the builder, loader and suite all survive, so it is restorable',
  /window\.loadKestrelRj\s*=/.test(S('kestrel_showcase.js')) &&
  fs.existsSync(path.join(__dirname, '..', 'site', 'demo_showcase_kestrel25.js')) &&
  fs.existsSync(path.join(__dirname, 'regression_kestrel25.test.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

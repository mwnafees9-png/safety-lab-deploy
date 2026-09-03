#!/usr/bin/env node
/*
 * Regression — stpaData must survive every save path, not just the .slab export.
 *
 * THE BUG. stpaData appeared in exactly one serialiser, _slabBuildProjectExport()
 * in misc_fn_modules.js, and the existing STPA suite locked it there. The other
 * two were never checked:
 *
 *   · _buildProjectSnapshot()  — read by saveProjectToCloud() AND by cloud_sync.js,
 *                                so the entire STPA lane was never pushed to the
 *                                cloud. Ever.
 *   · _snapshotProject()       — the local autosave payload and the dirty-check
 *                                basis, so an STPA edit did not even mark the
 *                                project dirty and nothing downstream fired.
 *
 * Both load paths rehydrate stpaData with an empty default when the key is
 * absent, which is correct for old saves and catastrophic here: it turned a
 * missing key into a silent reset. A user could do a full STPA — losses,
 * hazards, control structure, UCA dispositions, causal scenarios — reload, and
 * find the lane empty with no error anywhere.
 *
 * Nobody hit it because the lane is opt-in and off by default and no account has
 * used it yet. The first would have been a pilot seat.
 *
 * Run: node tests/regression_stpa_persistence.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const helpers = S('helpers_modules.js');
const misc    = S('misc_fn_modules.js');
const dataops = S('data_ops_modules.js');
const sync    = S('cloud_sync.js');

// Pull a named function body so a match cannot come from a comment elsewhere.
function body(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
// Strip comments so "mentioned in a comment" never counts as "serialised".
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ---- the three serialisers -------------------------------------------------
const SERIALISERS = [
  ['_slabBuildProjectExport', misc,    'the .slab / desktop export'],
  ['_buildProjectSnapshot',   helpers, 'the cloud push — saveProjectToCloud and cloud_sync'],
  ['_snapshotProject',        helpers, 'the local autosave and the dirty check'],
];
// 20 Aug 2026 — a serialiser may now satisfy this EITHER by naming the store itself
// (the .slab export still does) OR by deriving from project_stores.js, which is the
// single declaration the autosave and the cloud push were unified onto. Deriving is
// the stronger guarantee — it cannot drift — but only if the store is actually in the
// list, so that is checked too rather than assumed.
const psrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'site', 'project_stores.js'), 'utf8');
const STORE_KEYS = [...psrc.matchAll(/\{ key: '([A-Za-z_$][\w$]*)'/g)].map(m => m[1]);
const capturesVia = (b, key) => /\bSLStores\.snapshot\(\)/.test(code(b)) && STORE_KEYS.includes(key);
check('project_stores.js declares the store list', STORE_KEYS.length > 25, STORE_KEYS.length + ' stores');
SERIALISERS.forEach(([fn, src, what]) => {
  const b = body(src, fn);
  check(fn + ' exists', !!b, 'could not locate the function body');
  check(fn + ' serialises stpaData — ' + what,
    /\bstpaData\b/.test(code(b)) || capturesVia(b, 'stpaData'),
    'STPA work is silently dropped by this path');
});

// ---- the restore half ------------------------------------------------------
const restore = body(helpers, '_restoreProjectSnapshot');
check('_restoreProjectSnapshot rehydrates stpaData', /\bstpaData\b/.test(code(restore)),
  'without this, opening a project leaves the PREVIOUS project\'s STPA lane in memory');
check('_restoreProjectSnapshot falls back to a full default, not undefined',
  /stpaData\s*=\s*\(data\.stpaData && data\.stpaData\.cs\)/.test(restore),
  'old saves predate the lane and must get the whole default structure');
check('the other load path still guards the same way',
  /stpaData = \(data\.stpaData && data\.stpaData\.cs\)/.test(dataops),
  'data_ops_modules.js is the primary load path');

// ---- the consumer that made it invisible -----------------------------------
check('cloud_sync pushes whatever _buildProjectSnapshot returns',
  /_buildProjectSnapshot\(\)/.test(sync),
  'if this changes, re-check which serialiser the cloud actually sends');

// ---- shape agreement across every site -------------------------------------
// Five places construct the default. If they drift, a project silently changes
// shape depending on which path last touched it.
const DEFAULT_KEYS = ['cs:', 'dispositions:', 'causeDismissals:', 'scopeFcIds:', 'meta:',
                      'losses:', 'hazards:', 'constraints:', 'responsibilities:', 'csState:', 'sip:'];
const defaults = [...(helpers + misc + dataops).matchAll(/\{ cs: \{ controllers: \[\][\s\S]{0,600}?sip: \{\} \}/g)].map(m => m[0]);
check('at least three default literals are present', defaults.length >= 3, defaults.length + ' found');
defaults.forEach((d, i) => check('default literal ' + (i + 1) + ' carries every key',
  DEFAULT_KEYS.every(k => d.indexOf(k) >= 0),
  'missing: ' + DEFAULT_KEYS.filter(k => d.indexOf(k) < 0).join(', ')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

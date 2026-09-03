#!/usr/bin/env node
/*
 * Regression — mass_actions v0.1 (bulk operations for tabulated analyses).
 *   [1] registry integrity: every target's tbody exists in index.html, its
 *       delete/render helpers exist in source, its field selects exist.
 *   [2] doctrine in source: typed DELETE gate; confirm() suppression is
 *       scoped with a finally restore; guards refuse WITH NAMES; legality of
 *       bulk-edit values comes from the worksheet's own form select (no
 *       hard-coded option lists); computed tables excluded.
 *   [3] behavior (node): guardDelete refuses an FHA row linked to a fault
 *       tree and passes an unlinked one; requirements guard refuses a row
 *       already in the Deleted bin.
 *   [4] wiring: script tag cache-busted, after program_plan; selection is
 *       UI memory only (module never appears in the project payload).
 * Run: node tests/regression_mass_actions.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

global.ftaPages = [{ id: 'p1', linkedFhaId: 'AC_77', root: {} }];
const MA = require('../site/mass_actions.js');
const src = S('mass_actions.js'), idx = S('index.html');
const all = ['helpers_modules.js', 'safety_lab.js', 'support_modules.js', 'misc_fn_modules.js', 'bindings_modules.js'].map(S).join('\n');

// ---- [1] registry integrity -----------------------------------------------------
check('3 targets in v0.1 (AFHA · SFHA · Requirements)', MA.TARGETS.length === 3 &&
  ['acFha', 'sysFha', 'acReq'].every(k => MA.TARGETS.some(t => t.key === k)));
check('every target tbody exists in index.html', MA.TARGETS.every(t => idx.indexOf('id="' + t.tbodyId + '"') >= 0));
check('every delete/render helper exists in the codebase', MA.TARGETS.every(t =>
  (all.indexOf('function ' + t.deleteFn) >= 0 || all.indexOf('window.' + t.deleteFn) >= 0) &&
  (all.indexOf('function ' + t.renderFn) >= 0 || all.indexOf('window.' + t.renderFn) >= 0)));

// ---- [2] doctrine in source ------------------------------------------------------
check('typed DELETE gate on bulk delete', /Type DELETE to proceed/.test(src) && /!== 'DELETE'/.test(src.replace(/\\'/g, "'")) || /trim\(\) !== 'DELETE'/.test(src));
check('confirm suppression is SCOPED (finally restores window.confirm)',
  /const _confirm = window\.confirm/.test(src) && /finally \{\s*\n\s*window\.confirm = _confirm/.test(src));
check('guards refuse with names, never silently', /has a linked fault tree/.test(src) && /already in the Deleted bin/.test(src) && /refused/.test(src));
check('computed tables excluded on principle', /UCA seeds, HFA items\) are deliberately NOT targets/.test(src));
check('writes route through the worksheets: delete via helper fn, render via helper fn',
  /del\(row\.internalId\)/.test(src) && /_fn\(t\.renderFn\)/.test(src));

// ---- [3] behavior ---------------------------------------------------------------
const acFha = MA.TARGETS.find(t => t.key === 'acFha');
check('FHA guard refuses a row whose internalId is linked to a fault tree (AC_ prefix normalized)',
  /linked fault tree/.test(acFha.guardDelete({ internalId: 77, fcId: 'FC-09' }) || ''));
check('FHA guard passes an unlinked row', acFha.guardDelete({ internalId: 99, fcId: 'FC-10' }) === null);
const acReq = MA.TARGETS.find(t => t.key === 'acReq');
check('requirements guard refuses the already-deleted', /Deleted bin/.test(acReq.guardDelete({ internalId: 1, deleted: true, traceId: 'REQ-1' }) || '') &&
  acReq.guardDelete({ internalId: 2, deleted: false }) === null);

// ---- [4] wiring -----------------------------------------------------------------
check('script tag cache-busted, loads after program_plan', /mass_actions\.js\?v=0\.\d/.test(idx) &&
  idx.indexOf('program_plan.js') < idx.indexOf('mass_actions.js'));
check('selection is UI memory — never in the project payload', S('misc_fn_modules.js').indexOf('massActions') === -1 && !/scheduleAutosave[\s\S]{0,80}sel\[/.test(src));
check('moat guard on the switchTab wrap (_maWrapped)', /_maWrapped/.test(src));
check('side-by-side: checkbox and kebab share a flex line (.ma-wrap)', /ma-wrap/.test(src) && /display:flex; align-items:center/.test(src));
check('select-all in the ACTIONS header with indeterminate state', /ma-cb-all/.test(src) && /ma-hwrap/.test(src) && /indeterminate = selVis\.length > 0/.test(src));
check('v0.6: batch delete IS the product — no edit/export in the bar', src.indexOf('applyEdit') === -1 && src.indexOf('exportCsv') === -1 && src.indexOf('Set field') === -1);
check('one-line bar: nowrap everywhere, may grow wide', /flex-wrap:nowrap; white-space:nowrap; max-width:96vw/.test(src));
check('kebab Delete hidden on mass-action tables (id carrier retained)', /_maHidden/.test(src) && /display = .none./.test(src) && /still carries the row id/.test(src));
check('NO EVAL — the live CSP has no unsafe-eval (learned in production)', src.indexOf('(0, eval)') === -1 && src.indexOf('new Function') === -1 && /NO EVAL, EVER/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

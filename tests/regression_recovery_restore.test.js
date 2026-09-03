#!/usr/bin/env node
/*
 * Regression — server-side restore wiring (Version history panel → recovery RPCs).
 *   Since 20 Aug the database refuses "populated → gutted" writes; a client-side
 *   restore of a smaller snapshot IS that write. These checks pin the client to
 *   the server path: sl_recovery_points for the list (item counts are the
 *   recovery signal), sl_restore_project_version / sl_restore_project_baseline
 *   for the writes (archive-first, undoable, guard-aware), and the cloud_sync
 *   rebase + preserve fixes that keep autosave sane afterwards.
 * Run: node tests/regression_recovery_restore.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const misc = S('misc_fn_modules.js');
const helpers = S('helpers_modules.js');
const cloud = S('cloud_sync.js');
const idx = S('index.html');

// ---- the restore calls are server-side RPCs, not client-side writes ---------
const rsv = (misc.match(/async function restoreSavedVersion[\s\S]*?\n}/) || [''])[0];
const rrv = (misc.match(/async function restoreRevision[\s\S]*?\n}/) || [''])[0];
check('restoreSavedVersion calls rpc sl_restore_project_version',
  /client\.rpc\('sl_restore_project_version'/.test(rsv));
check('restoreRevision calls rpc sl_restore_project_baseline',
  /client\.rpc\('sl_restore_project_baseline'/.test(rrv));
check('neither restore path pushes the document client-side any more (no saveProjectToCloud)',
  !/saveProjectToCloud/.test(rsv) && !/saveProjectToCloud/.test(rrv));
check('neither restore path reads snapshot data client-side for the write',
  !/from\('project_document_versions'\)/.test(rsv) && !/from\('project_baselines'\)/.test(rrv));
check('restoreSavedVersion is keyed by VERSION (what the RPC takes), not row id',
  /p_version:\s*Number\(version\)/.test(rsv));
check('both confirms tell the user the current state is banked first (undoable)',
  /banked first/.test(rsv) && /banked first/.test(rrv));
check('both toasts name the undo_version so the restore is visibly reversible',
  /undo_version/.test(rsv) && /undo_version/.test(rrv));

// ---- the post-restore reload ------------------------------------------------
const asr = (misc.match(/async function _applyServerRestore[\s\S]*?\n}/) || [''])[0];
check('_applyServerRestore exists and re-reads the fresh server document',
  /from\('project_documents'\)/.test(asr) && /_restoreProjectSnapshot/.test(asr));
check('_applyServerRestore adopts the RPC\'s new_version into _activeCloudDocVersion',
  /_activeCloudDocVersion\s*=\s*\(res && res\.new_version != null\)/.test(asr));
check('_applyServerRestore rebases cloud_sync\'s shrink baseline (deliberate rollback ≠ wipe)',
  /__slCloudSyncRebase/.test(asr));

// ---- the list is sl_recovery_points, with the item counts -------------------
const rvh = (helpers.match(/async function _renderVersionHistory[\s\S]*?\n}/) || [''])[0];
check('_renderVersionHistory pulls the saves list from rpc sl_recovery_points',
  /client\.rpc\('sl_recovery_points'/.test(rvh));
check('saves rows render the authored-item count', /itemsTxt/.test(rvh) && /item/.test(rvh));
check('the live row shows a "current" badge instead of a Restore button',
  /s\.kind === 'live'/.test(rvh) && /current/.test(rvh));
check('archive Restore buttons pass the VERSION to restoreSavedVersion',
  /restoreSavedVersion\(' \+ esc\(String\(s\.version\)\)/.test(rvh));

// ---- rule 11: render the generated saves row markup and inspect it ----------
(function () {
  try {
    const mapSrc = (rvh.match(/saves\.map\(s => \{[\s\S]*?\}\)\.join\(''\)/) || [''])[0];
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const who = () => 'a@b.com', when = () => '21/08/2026';
    const kb = b => (b == null) ? '' : (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
    const saves = [
      { kind: 'live', version: 12, items: 289, bytes: 2400000, saved_by: 'u', saved_at: 'now', is_restorable: false },
      { kind: 'archive', version: 11, items: 289, bytes: 2300000, saved_by: 'u', saved_at: 'now', is_restorable: true },
      { kind: 'archive', version: 1, items: 0, bytes: 900, saved_by: null, saved_at: 'now', is_restorable: true },
    ];
    const html = new Function('saves', 'esc', 'who', 'when', 'kb', 'return ' + mapSrc)(saves, esc, who, when, kb);
    check('VM render — produces one row per save', (html.match(/border-bottom:1px solid/g) || []).length === 3);
    check('VM render — live row carries badge, no restore onclick', /current<\/span>/.test(html) && !/restoreSavedVersion\(12\)/.test(html));
    check('VM render — archive row onclick is a clean numeric call', /onclick="restoreSavedVersion\(11\)"/.test(html));
    check('VM render — item counts visible, zero rendered as "0 items"', />289 items</.test(html) && />0 items</.test(html));
    check('VM render — no unescaped quote breakage in attributes', !/onclick="[^"]*"[^ >]/.test(html));
  } catch (e) {
    check('VM render of saves rows executes', false, e.message);
  }
})();

// ---- cloud_sync fixes -------------------------------------------------------
const wrapLoader = (cloud.match(/function _wrapLoader[\s\S]*?\n    \}/) || [''])[0];
check('cloud_sync _wrapLoader preserves markers from `fn` (the bug: `orig` was out of scope here)',
  /SLWrap\.preserve\(fn, wrapped\)/.test(wrapLoader) && !/SLWrap\.preserve\(orig/.test(wrapLoader));
check('cloud_sync wrapWrite still preserves from its own `orig` (correct in THAT scope)',
  /var orig = window\._writeAutosave;[\s\S]*?SLWrap\.preserve\(orig, wrapped\)/.test(cloud));
check('cloud_sync exposes __slCloudSyncRebase clearing the shrink baseline',
  /__slCloudSyncRebase\s*=\s*function \(\) \{ _lastPushedItems = null; \}/.test(cloud));

// ---- pins as floors (rule 12) ----------------------------------------------
const pin = name => parseFloat(((idx.match(new RegExp(name.replace('.', '\\.') + '\\?v=([0-9.]+)')) || [])[1]) || '0');
check('index.html pins misc_fn_modules.js at 66.34 or later', pin('misc_fn_modules.js') >= 66.34);
check('index.html pins helpers_modules.js at 2.43 or later', pin('helpers_modules.js') >= 2.43);
check('index.html pins cloud_sync.js at 1.4 or later', pin('cloud_sync.js') >= 1.4);

// ---- the repo carries the migration the client now depends on ---------------
(function () {
  let mig = '';
  try { mig = R('supabase/migrations/20260821_baseline_restore_rpc.sql'); } catch (_) {}
  check('migration 20260821_baseline_restore_rpc.sql exists on disk', mig.length > 0);
  check('migration defines sl_restore_project_baseline with the one-statement sl.restore window',
    /sl_restore_project_baseline/.test(mig) && /set_config\('sl\.restore', 'on', true\)/.test(mig) && /set_config\('sl\.restore', 'off', true\)/.test(mig));
  check('migration banks the current state before writing (undoable restore)',
    /insert into public\.project_document_versions[\s\S]*?returning version into v_archived_as/.test(mig));
  check('migration scopes the baseline to the project (id alone is not trusted)',
    /b\.id = p_baseline and b\.project_id = p_project/.test(mig));
  check('migration revokes anon on both restore RPCs',
    /revoke execute on function public\.sl_restore_project_baseline[\s\S]*?from anon/.test(mig) &&
    /revoke execute on function public\.sl_restore_project_version[\s\S]*?from anon/.test(mig));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

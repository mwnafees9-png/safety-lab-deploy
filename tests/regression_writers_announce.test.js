#!/usr/bin/env node
/*
 * Regression — store writers announce their own writes (13 Sep 2026, R19 hygiene).
 *
 * WHAT THE SWEEP FOUND. Every user-driven mutation of a persisted project store (acFhaData,
 * ftaPages, ftaConfig, projectConfig, routingData, autoReqTemplateOverrides, ...) is supposed
 * to call scheduleAutosave() itself. save_watch.js (1 Hz fingerprint watcher) catches anything
 * that forgets, so none of these were data-loss bugs — but a writer that relies on the watcher
 * is a writer whose save is late and unattributed. A static scan flagged 23 functions that
 * mutate a store without calling scheduleAutosave in their own body. Each was read with its
 * callers and classified:
 *
 *   A — a user-driven write that reached no saver on its own → announce added
 *   B — reaches scheduleAutosave through a caller / wrapper / the file's _save(), or is a
 *       getter, load path, reset or sample builder where announcing would be wrong → unchanged
 *
 * CLASS A (announce added after the mutation):
 *   helpers_modules.js  onExposureInputChange   toolbar onchange writes ftaConfig.exposureTime / exposureSource; nothing else saved it
 *   helpers_modules.js  onExposureAutoToggle    toolbar onchange writes ftaConfig.exposureSource (+ exposureTime via sync); nothing else saved it
 *   safety_lab.js       save (AutoReq template modal)  Save button rewrites autoReqTemplateOverrides (a declared project store); nothing else saved it
 *
 * CLASS B (left alone — do not re-flag):
 *   ai_assistant.js     _chatAddFunction        only caller is _chatRunActions, whose three callers (_applyCapturedDraft, the draft-panel apply, the chat send path) each scheduleAutosave after the batch
 *   ai_assistant.js     _chatAddRouting         same as _chatAddFunction
 *   bowtie.js           btJamaApply             calls the file's _save() → commitSaveChanges → scheduleAutosave
 *   cma_walkthrough.js  _cma                    lazy store getter (creates an empty cmaData on first read); no user write
 *   pra_canvas.js       _pra                    lazy store getter (praData); no user write
 *   zsa_walkthrough.js  _zsa                    lazy store getter (zsaData); no user write
 *   helpers_modules.js  _activeOverrides        lazy getter for the template-override slot; the edits that follow it persist via _persistActiveScope / project save
 *   helpers_modules.js  syncFTAExposureFromFHA  derived recompute of ftaConfig.exposureTime; runs inside page-switch/load (syncFtaConfigFromActivePage) and its user-driven callers (updatePhase, applyFTAConfig, onFtaMissionProfileChange, onExposureAutoToggle) all autosave
 *   helpers_modules.js  submitACFHA             global is wrapped by _wrapForUndoAndAutosave (_UNDO_TARGETS, data_ops_modules.js) which calls scheduleAutosave after every call
 *   helpers_modules.js  deleteACFHA             same wrapper (_UNDO_TARGETS)
 *   helpers_modules.js  addNewFTAPage           same wrapper (_UNDO_TARGETS)
 *   helpers_modules.js  syncFtaConfigFromActivePage  re-derives the ftaConfig toolbar state from the active page on page switch and project load; a load path, must not save
 *   hf_analyses.js      creditTask              calls the file's _save() → scheduleAutosave
 *   importers.js        _importInto             per-sheet worker; its only caller (the Excel import commit) autosaves once after the loop
 *   misc_fn_modules.js  initNewProjectStateLegacy  new-project reset (fallback when project_stores.js failed to load); saving here would write a blank project
 *   misc_fn_modules.js  rebuildExtractedFCsForAllSystems  derived rebuild of extractedFCs from FCIM rows; runs on project load, and its user-driven callers (FCIM combine, MAC→FCIM, Auto-fill FC IDs) autosave
 *   misc_fn_modules.js  _bundleMerge            pure deserializer ({manifest, files} → project); a load path
 *   support_modules.js  transferOutSelectedGate global is wrapped by _wrapForUndoAndAutosave (_UNDO_TARGETS)
 *   safety_lab.js       onload                  window.onload boot path: restores UI prefs from localStorage into ftaConfig before the project loads; a load path
 *   data_ops_modules.js _buildSampleProject     sample-project builder (unused since the demo kit); not a user write
 *
 * PINNED:
 *   W1  each class-A function body carries a scheduleAutosave call AFTER its store write
 *   W2  each edited file announces the sweep on its first line
 *   W3  the class-B reasons still hold: _UNDO_TARGETS still lists the wrapped names, the
 *       _save()-based ones still call _save(), and every class-B function still exists
 *   W4  mutation: removing one inserted call turns W1 red
 *
 * Run: node tests/regression_writers_announce.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const ANNOUNCE = "try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}";
const HEADER = '// 13 Sep 2026 (R19 hygiene): store writers announce their own writes with scheduleAutosave; see tests/regression_writers_announce.test.js';

// Body of `function <name>(` — brace-matched, string/comment aware. Returns '' when absent.
function fnBody(src, name, nth) {
  const re = new RegExp('(^|[^\\w$.])function\\s+' + name.replace(/\$/g, '\\$') + '\\s*\\(', 'g');
  let m, hits = [];
  while ((m = re.exec(src))) hits.push(m.index + m[1].length);
  const at = hits[nth || 0];
  if (at === undefined) return '';
  let i = src.indexOf('{', at), depth = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { j = src.indexOf('\n', j); if (j < 0) break; continue; }
    if (c === '/' && n === '*') { j = src.indexOf('*/', j) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return '';
}

// Class A: file, function, a store write that must precede the announce.
const CLASS_A = [
  { file: 'helpers_modules.js', fn: 'onExposureInputChange', write: 'ftaConfig.exposureTime = v;' },
  { file: 'helpers_modules.js', fn: 'onExposureAutoToggle',  write: "ftaConfig.exposureSource = 'manual';" },
  { file: 'safety_lab.js',      fn: 'save',                  write: 'Object.assign(autoReqTemplateOverrides, newOverrides);' },
  { file: 'safety_lab.js',      fn: 'resetAll',              write: 'window.autoReqTemplateOverrides = {};' }   // the clear in the same modal, same shape
];
const EDITED = ['helpers_modules.js', 'safety_lab.js'];
// Class B, with the machine-checkable half of each reason.
const CLASS_B = [
  { file: 'ai_assistant.js',     fn: '_chatAddFunction',   via: 'caller' },
  { file: 'ai_assistant.js',     fn: '_chatAddRouting',    via: 'caller' },
  { file: 'bowtie.js',           fn: 'btJamaApply',        via: '_save()' },
  { file: 'cma_walkthrough.js',  fn: '_cma',               via: 'getter' },
  { file: 'pra_canvas.js',       fn: '_pra',               via: 'getter' },
  { file: 'zsa_walkthrough.js',  fn: '_zsa',               via: 'getter' },
  { file: 'helpers_modules.js',  fn: '_activeOverrides',   via: 'getter' },
  { file: 'helpers_modules.js',  fn: 'syncFTAExposureFromFHA', via: 'derived' },
  { file: 'helpers_modules.js',  fn: 'submitACFHA',        via: 'undo-wrap' },
  { file: 'helpers_modules.js',  fn: 'deleteACFHA',        via: 'undo-wrap' },
  { file: 'helpers_modules.js',  fn: 'addNewFTAPage',      via: 'undo-wrap' },
  { file: 'helpers_modules.js',  fn: 'syncFtaConfigFromActivePage', via: 'load' },
  { file: 'hf_analyses.js',      fn: 'creditTask',         via: '_save()' },
  { file: 'importers.js',        fn: '_importInto',        via: 'caller' },
  { file: 'misc_fn_modules.js',  fn: 'initNewProjectStateLegacy', via: 'reset' },
  { file: 'misc_fn_modules.js',  fn: 'rebuildExtractedFCsForAllSystems', via: 'derived' },
  { file: 'misc_fn_modules.js',  fn: '_bundleMerge',       via: 'load' },
  { file: 'support_modules.js',  fn: 'transferOutSelectedGate', via: 'undo-wrap' },
  { file: 'data_ops_modules.js', fn: '_buildSampleProject', via: 'sample' }
];

function announcesAfterWrite(body, write) {
  const w = body.indexOf(write);
  if (w < 0) return false;
  return body.indexOf(ANNOUNCE, w + write.length) > 0;
}

console.log('[W1] every class-A writer announces after its write');
for (const a of CLASS_A) {
  const body = fnBody(read(a.file), a.fn);
  check(a.file + ' ' + a.fn + ' — store write found', body.indexOf(a.write) >= 0);
  check(a.file + ' ' + a.fn + ' — scheduleAutosave follows the write', announcesAfterWrite(body, a.write));
}

console.log('\n[W2] each edited file announces the sweep on line 1');
for (const f of EDITED) check(f + ' first line is the R19 hygiene note', read(f).split('\n')[0] === HEADER);

console.log('\n[W3] the class-B reasons still hold');
{
  const undoSrc = read('data_ops_modules.js');
  const targets = (undoSrc.match(/const _UNDO_TARGETS = \[([\s\S]*?)\];/) || ['', ''])[1];
  for (const b of CLASS_B) {
    const src = read(b.file);
    const body = fnBody(src, b.fn);
    check(b.file + ' ' + b.fn + ' still exists', body.length > 0);
    if (b.via === 'undo-wrap') check(b.fn + ' is still in _UNDO_TARGETS', targets.indexOf("'" + b.fn + "'") >= 0);
    if (b.via === '_save()') check(b.file + ' ' + b.fn + ' still calls _save()', /\b_save\(\)/.test(body));
  }
  // the three callers of _chatRunActions each autosave after the batch
  const ai = read('ai_assistant.js');
  const calls = [...ai.matchAll(/_chatRunActions\(/g)].map(m => m.index).filter(i => !/function\s+$/.test(ai.slice(i - 12, i)));
  const covered = calls.filter(i => ai.slice(i, i + 4000).indexOf('scheduleAutosave()') > 0);   // _applyCapturedDraft saves at its tail, ~30 lines below the call
  check('_chatRunActions: every caller (' + calls.length + ') autosaves after the batch', calls.length === 3 && covered.length === calls.length, covered.length + ' of ' + calls.length);
  // the Excel import commit autosaves once after the per-sheet loop
  const imp = read('importers.js');
  const at = imp.indexOf('const n = _importInto(sheet);');
  check('_importInto: the import commit autosaves after the loop', at > 0 && imp.slice(at, at + 2000).indexOf('scheduleAutosave()') > 0);
  // the undo/autosave wrapper still schedules the autosave
  check('_wrapForUndoAndAutosave still calls scheduleAutosave', /const r = fn\.apply\(this, arguments\);\s*scheduleAutosave\(\);/.test(undoSrc));
}

console.log('\n[W4] mutation goes red');
{
  const a = CLASS_A[1];
  const src = read(a.file);
  const body = fnBody(src, a.fn);
  const at = body.indexOf(ANNOUNCE, body.indexOf(a.write));
  const mutated = body.slice(0, at) + body.slice(at + ANNOUNCE.length);
  check('M1 (announce removed from ' + a.fn + '): W1 would fail', announcesAfterWrite(body, a.write) && !announcesAfterWrite(mutated, a.write));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

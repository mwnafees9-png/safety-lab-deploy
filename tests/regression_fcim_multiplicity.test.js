#!/usr/bin/env node
/*
 * Regression — Table A3 cell multiplicity on the FCIM (2 Aug 2026).
 *
 * WAQAS'S RULING, encoded: a cell may hold SEVERAL distinct conditions.
 * Malfunction: MF1…MFn. Partial Loss: depends on the TL modelling style —
 * TL = loss of minimum acceptable configuration ⇒ one degraded-mode PL; or
 * TL = complete loss of all functionality ⇒ TWO partials, one within MAC
 * limits and one outside. TL itself stays single in both styles.
 *
 * THE ADDITIVE DESIGN THIS PINS: the legacy primary fields (plId/plDesc,
 * mId/mDesc) are the FIRST condition and are untouched — 70+ files read them
 * and none needed to change. Extras live in plExtra/mExtra [{id, desc}], each
 * with its OWN FC id from the same allocator, each tracing forward through
 * extractedFCs. A row without extras behaves byte-for-byte as before — that
 * is the migration: there isn't one.
 *
 * Run: node tests/regression_fcim_multiplicity.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const ai = S('ai_assistant.js'), mfn = S('misc_fn_modules.js'), cbm = S('fcim_combined.js');

// ---- [1] the trace path, executed -------------------------------------------
console.log('\n[mult] extras trace forward, executed');
{
  const m = mfn.match(/function _pushExtractedFCs\(fcimArr, out\)[\s\S]*?\n\}/);
  const sb = { console, Array }; vm.createContext(sb);
  vm.runInContext(m[0] + '\n; globalThis._p = _pushExtractedFCs;', sb);
  const out = [];
  sb._p([{ subId: 'SF-1', tlId: 'FC-01', tlDesc: 'Complete loss of deceleration',
           plId: 'FC-02', plDesc: 'Degraded deceleration within MAC limits',
           plExtra: [{ id: 'FC-03', desc: 'Degraded deceleration outside MAC' }],
           mId: 'FC-04', mDesc: 'Uncommanded deceleration',
           mExtra: [{ id: 'FC-05', desc: 'Excessive deceleration intensity' }, { id: 'FC-06', desc: 'Reduced deceleration intensity' }] }], out);
  const ids = out.map(o => o.id);
  check('the within/outside-MAC partial pair BOTH trace',
    ids.indexOf('FC-02') >= 0 && ids.indexOf('FC-03') >= 0,
    'the ruling\'s complete-loss TL style, executed');
  check('MF1…MF3 all trace', ids.indexOf('FC-04') >= 0 && ids.indexOf('FC-05') >= 0 && ids.indexOf('FC-06') >= 0);
  check('six conditions from one row — nothing merged, nothing lost', ids.length === 6, String(ids.length));
  check('an extra without an id contributes nothing (not yet allocated)',
    (function () { const o = []; sb._p([{ mExtra: [{ desc: 'unallocated' }] }], o); return o.length === 0; })());
}

// ---- [2] the AI accept path, executed ---------------------------------------
console.log('\n[mult] the accept path allocates ids per extra, executed');
{
  // Signature tolerant (§7.3): 2 Aug gained ctxExtra for the numbering-scheme
  // context; this suite cares about the fallback allocator, not the arity.
  const fcid = (ai.match(/function _fcimFcId\(row, field, scanFcim, scanFha[^)]*\)[\s\S]*?\n    \}/) || [''])[0];
  const apply = (ai.match(/function _applyFcimSuggestion\(s\)[\s\S]*?\n    \}/) || [''])[0];
  check('_fcimFcId scans extras and combined ids too',
    /mExtra/.test(fcid) && /plExtra/.test(fcid) && /cbId/.test(fcid),
    'otherwise a fresh allocation can collide with an extra\'s id');
  check('the accept path recognises malfunctions[] and partials[]',
    /Array\.isArray\(s\.malfunctions\)/.test(apply) && /Array\.isArray\(s\.partials\)/.test(apply));
  check('first entry lands on the LEGACY primary field',
    /s\.partialLoss \|\| \(_pls && _pls\[0\]\)/.test(apply) && /s\.malfunction \|\| \(_mfs && _mfs\[0\]\)/.test(apply),
    'the additive contract: readers of plDesc/mDesc keep seeing the first condition');

  const sb = { console, Date, Math, JSON, Array, Object, String, Number, Set };
  sb.window = sb; sb.globalThis = sb;
  sb.acFcimData = []; sb.acFhaData = [{ fcId: 'FC-007' }]; sb.acExtractedFCs = [];
  sb._toast = () => {}; sb.scheduleAutosave = () => {}; sb._aiConsistencyAutoCheck = () => {};
  sb.newRowId = () => 'row-1';
  // 29 Aug 2026 (Skills V1): the accept path stamps aiSkill via _skillStampFor,
  // defined in the engine's own IIFE at runtime — the harness supplies it here.
  sb._skillStampFor = () => 'fcim.draft@v1#harness';
  vm.createContext(sb);
  const push = mfn.match(/function _pushExtractedFCs\(fcimArr, out\)[\s\S]*?\n\}/)[0];
  vm.runInContext(push + '\n' + fcid + '\n' + apply + '\n; globalThis._a = _applyFcimSuggestion;', sb);
  const ok = sb._a({ subId: 'SF-9', awareness: 'Both',
    totalLoss: 'Complete loss of deceleration on ground',
    partials: ['Degraded deceleration within MAC limits', 'Degraded deceleration outside MAC'],
    malfunctions: ['Uncommanded deceleration', 'Excessive deceleration intensity', 'Reduced deceleration intensity'],
    _model: 'test-model' });
  const row = sb.acFcimData[0];
  check('accept succeeds with both arrays', ok === true && !!row);
  check('primaries carry the first condition of each list',
    row && row.plDesc === 'Degraded deceleration within MAC limits' && row.mDesc === 'Uncommanded deceleration');
  check('extras carry the rest', row && row.plExtra.length === 1 && row.mExtra.length === 2);
  const allIds = row ? [row.tlId, row.plId, row.mId, row.plExtra[0].id, row.mExtra[0].id, row.mExtra[1].id] : [];
  check('every condition got its own FC id, none colliding',
    allIds.every(Boolean) && new Set(allIds).size === 6 && allIds.indexOf('FC-007') === -1,
    'got: ' + allIds.join(', '));
  check('extractedFCs sees all six', sb.acExtractedFCs.length === 6, String(sb.acExtractedFCs.length));
  const legacy = sb._a({ subId: 'SF-10', awareness: 'N/A', malfunction: 'Single malfunction phrase', _model: 'm' });
  check('a legacy single-string call behaves exactly as before',
    legacy === true && sb.acFcimData[1].mDesc === 'Single malfunction phrase' && !sb.acFcimData[1].mExtra);
}

// ---- [3] the surfaces -------------------------------------------------------
console.log('\n[mult] surfaces');
check('the renderer stacks extras under the primary in the same cell',
  /_extraHtml\(row\.plExtra\)/.test(mfn) && /_extraHtml\(row\.mExtra\)/.test(mfn));
check('the desk edits extras with the two ruling-named add buttons',
  /\+ partial-loss condition/.test(cbm) && /\+ malfunction condition/.test(cbm) && /within MAC limits, one outside/.test(cbm));
// 4 Sep 2026 (Waqas): "total loss will be loss outside mac and partial within mac limits" —
// the two modelling styles are gone; the MAC is the one line between TL and PL.
check('_SPEC_FCIM asks for the arrays and defines TL/PL by the MAC (one definition, no styles)',
  /"malfunctions": \[MF1, MF2/.test(ai) && /TOTAL LOSS AND PARTIAL LOSS ARE DEFINED BY THE MAC/.test(ai) && /Loss of <capability> outside MAC limits/.test(ai) && !/TL MODELLING STYLES/.test(ai));
// The §8 captured-then-discarded guard, on its FOURTH potential instance: the
// chat/unified accept path maps add_fcim fields explicitly, so the arrays must
// be named there or the spec's own answer is dropped on accept. Caught live on
// the ANEM-parity audit, 2 Aug — pinned so it cannot regress.
check('the chat/unified add_fcim op passes the arrays through',
  /malfunctions: a\.malfunctions, partials: a\.partials/.test(ai),
  'an explicit field map that omits them silently discards what _SPEC_FCIM asked for');
check('the chat op list documents partials[]/malfunctions[] with the never-merge rule',
  /partials\?, malfunctions\?\}/.test(ai) && /use partials\[\] \/ malfunctions\[\] arrays, one condition per entry/.test(ai));
check('the unified FCIM directive carries the arrays too',
  /use partials\[\]\/malfunctions\[\] arrays, never merged into one phrase/.test(ai));
check('the spec still forbids merging distinct conditions',
  /NEVER merged into one phrase/.test(ai));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

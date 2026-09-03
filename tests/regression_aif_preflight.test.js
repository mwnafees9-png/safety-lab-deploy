#!/usr/bin/env node
/*
 * Regression — AIF-1 (31 Aug 2026): the fidelity preflight vs the anchored skill.
 *
 * THE INCIDENT, measured on the clean pair run: _preflightAction called
 * AiFidelity.checkClaims(txt, {}) with an EMPTY data object, so the known-id
 * set was empty and every id-shaped token was "not found in the project
 * model" — including the Table A6 anchor ids the v2 skill legitimately cites
 * ("Effects support MAJ-2: ..."). Blocked rows were then dropped SILENTLY by
 * the batch accept-all: run 2 lost 40 of 122 first-pass FHA rows while the
 * coverage banner read "complete". Fix: real snapshot (memoized, module-scope
 * TTL), anchor-vocabulary + document-token exemptions, and blocked rows KEPT
 * in the panel wearing their refusal reason on all three accept paths.
 *
 * These checks run the REAL _preflightAction against the REAL checkClaims.
 * Run: node tests/regression_aif_preflight.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const ai = S('ai_assistant.js');
const fid = S('ai_fidelity.js');

function fn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc = false, line = false, blk = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k], n2 = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n2 === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n2 === '/') { line = true; k++; continue; }
    if (c === '/' && n2 === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

// ---- the real functions, wired together --------------------------------------
const anchorLine = (ai.match(/const _SEV_ANCHORS = \{[^\n]+\};/) || [])[0];
check('extracted _SEV_ANCHORS table', !!anchorLine);
const srcs = [fn(fid, '_harvestKnownIds'), fn(fid, '_harvestKnownNumbers'), fn(fid, 'checkClaims'), fn(ai, '_pfGet'), fn(ai, '_preflightAction')];
check('extracted the preflight chain (harvest, checkClaims, _pfGet, _preflightAction)', srcs.every(Boolean));

const model = { acFhaData: [{ internalId: 1, fcId: 'SF-001-TL', fcDesc: 'Total loss of thrust' }], acFunctionsData: [{ subId: 'SF-001' }] };
const ctx = {
  console, Date, JSON, Array, String, Object, isFinite, parseFloat,
  window: {},
  _STD_PREFIX: /^$/,   // ai_fidelity module constant — standards prefixes; inert stand-in (the regex branch also matches inline)
  _validateArtifact: () => [],
  snapshot: () => model,
  projectSourceDocs: [{ name: 'SDD.pdf', text: 'The ISFD-1 standby display and the AHRS-2 unit provide independent attitude.' }],
  _pfCtx: null, _pfCtxAt: 0,
};
vm.createContext(ctx);
vm.runInContext(anchorLine + '\n' + srcs.join('\n') + '\nwindow.AiFidelity = { checkClaims: checkClaims };\nglobalThis.__pf = _preflightAction;', ctx);
const pf = (fields) => vm.runInContext('__pf(' + JSON.stringify(fields) + ')', ctx);

// 1. anchor citation is vocabulary, never a hallucinated model id
let errs = pf({ op: 'add_fha', severityRationale: 'Effects support MAJ-2: detectable against the standby.' });
check('a Table A6 anchor citation (MAJ-2) is NOT blocked', errs.length === 0, JSON.stringify(errs));
// 2. a token grounded verbatim in the source documents is citation, not hallucination
errs = pf({ op: 'add_fha', severityRationale: 'Detectable against the ISFD-1 standby display.' });
check('a document-grounded equipment token (ISFD-1) is NOT blocked', errs.length === 0, JSON.stringify(errs));
// 3. a real model id resolves now that the snapshot is real (was {} — the root cause)
errs = pf({ op: 'add_fha', severityRationale: 'Rolls up to SF-001-TL.' });
check('a real model id resolves against the REAL snapshot (the empty-{} root cause is dead)', errs.length === 0, JSON.stringify(errs));
// 4. an id found nowhere still blocks — the guard survives the exemptions
errs = pf({ op: 'add_fha', severityRationale: 'Mitigated by QZX-99 per design.' });
check('a token in neither model, documents, nor anchors STILL blocks', errs.length === 1 && /QZX-99/.test(errs[0]), JSON.stringify(errs));
// 5. the memo: second call inside the TTL reuses the context (no re-serialize)
vm.runInContext('globalThis.__calls = 0; const _snap0 = snapshot; snapshot = function(){ globalThis.__calls++; return _snap0(); };', ctx);
pf({ op: 'add_fha', severityRationale: 'plain text' }); pf({ op: 'add_fha', severityRationale: 'more text with SF-001-TL' });
check('snapshot is serialized once per burst, not once per row (module-scope TTL memo)', vm.runInContext('__calls', ctx) <= 1, String(vm.runInContext('__calls', ctx)));

// ---- the panel: blocked rows can no longer vanish (source posture) -----------
check('batch onAccept stashes the executor\'s refusal reason on the item', /a\._applyError = ok \? '' : \(\(res && res\[0\] && res\[0\]\.error\) \|\| 'apply failed'\);/.test(ai));
check('the card wears the refusal reason', /rv-apply-err/.test(ai) && /Not applied — ' \+ _esc\(it\._applyError\)/.test(ai));
check('accept-all KEEPS failed items in the panel and toasts both numbers', /items = failed; render\(\);/.test(ai) && /NOT applied — kept in the panel/.test(ai));
check('single accept keeps the item on failure', /else \{ _toast\('Not applied — ' \+ \(items\[idx\]\._applyError/.test(ai));
check('save-and-accept keeps the item on failure', /else \{ _toast\('Not applied — ' \+ \(it\._applyError/.test(ai));

// ---- pins --------------------------------------------------------------------
const loader = S('ai_loader.js'); const idx = S('index.html');
check('ai_loader serves ai_assistant >= 75.4', parseFloat((loader.match(/ai_assistant\.js\?v=([\d.]+)/) || [])[1]) >= 75.4);
check('index serves ai_loader >= 7.6', parseFloat((idx.match(/ai_loader\.js\?v=([\d.]+)/) || [])[1]) >= 7.6);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

#!/usr/bin/env node
/*
 * Regression — the FCIM Combined column + aware/unaware pairing + the
 * fcim-monitor generator (2 Aug 2026, Waqas's rulings).
 *
 * THE RULINGS THIS PINS:
 *  · Combined failure conditions (Table A3's related-sub-functions rule) live
 *    in a dedicated COLUMN, and they TRACE FORWARD through extractedFCs like
 *    every other condition — a condition the FHA cannot see silently never
 *    happened (the N/A lesson, again).
 *  · A standalone Unaware row is LEGITIMATE: no flag, no generated debt.
 *  · An aware/unaware PAIR whose AWARE (lower) risk governs takes the
 *    annunciation credit — and owes the monitoring requirement this generator
 *    emits. Unaware-governs or undecided pairs owe nothing.
 *  · The generator is orphan-sweep-safe: its opts branch exists, so its rows
 *    regenerate and retire through the same merge discipline as every other
 *    generator (the §3.1 trap, not repeated).
 *
 * Run: node tests/regression_fcim_combined.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const mfn = S('misc_fn_modules.js'), am = S('assurance_modules.js'), idx = S('index.html'), cbm = S('fcim_combined.js'), hlp = S('helpers_modules.js');

// ---- [1] the column ---------------------------------------------------------
console.log('\n[fcim+] the Combined column');
check('both FCIM theads carry the Combined column',
  (idx.match(/<th title="Combined failure conditions across related sub-functions[^>]*>Combined<\/th>/g) || []).length === 2,
  'AC and system matrices both gained it');
check('_fcimRenderCells renders the combined cell with partner subIds',
  /row\.combined/.test(mfn) && /withSubIds/.test(mfn));
check('the cell carries the editor affordance, not an inline form',
  /data-fcim-combined=/.test(mfn),
  'the entry is an array; the CRUD factory\'s flat form fields cannot carry it');
check('the editor module exists and handles the affordance',
  /data-fcim-combined/.test(cbm) && /FCIM_COMBINED/.test(cbm));
check('index.html loads the editor module', /fcim_combined\.js\?v=/.test(idx));

// ---- [2] combined conditions trace forward, executed ------------------------
console.log('\n[fcim+] combined conditions reach the FHA, executed');
{
  const m = mfn.match(/function _pushExtractedFCs\(fcimArr, out\)[\s\S]*?\n\}/);
  const sb = { console, Array }; vm.createContext(sb);
  vm.runInContext(m[0] + '\n; globalThis._p = _pushExtractedFCs;', sb);
  const out = [];
  sb._p([{ subId: 'SF-01', tlId: 'FC-01', tlDesc: 'Total loss',
           combined: [{ cbId: 'FC-C1', cbDesc: 'Combined loss of SF-01 and SF-02', withSubIds: ['SF-02'] }] }], out);
  const ids = out.map(o => o.id);
  check('a combined condition contributes to extractedFCs',
    ids.indexOf('FC-C1') >= 0, 'got: ' + ids.join(', '));
  check('alongside, not instead of, the row\'s own conditions', ids.indexOf('FC-01') >= 0);
  check('a combined entry without an id contributes nothing',
    (function () { const o = []; sb._p([{ subId: 'SF-01', combined: [{ cbDesc: 'no id yet' }] }], o); return o.length === 0; })());
}

// ---- [3] the pairing desk ---------------------------------------------------
console.log('\n[fcim+] pairing semantics in the desk');
check('pairing is symmetric — both rows get pairId and pairGoverns',
  /row\.pairId = pid; partner\.pairId = pid;/.test(cbm) && /row\.pairGoverns = governs; partner\.pairGoverns = governs;/.test(cbm));
check('un-pairing clears BOTH sides',
  /delete prev\.pairId; delete prev\.pairGoverns;/.test(cbm));
check('the badge names the governing choice', /paired · /.test(mfn));
check('the desk states the standalone-Unaware ruling verbatim',
  /A standalone Unaware is legitimate/.test(cbm));
check('saving rebuilds the extracted FC sets immediately',
  /rebuildExtractedFCsForAllSystems/.test(cbm));

// ---- [4] the generator, executed --------------------------------------------
console.log('\n[fcim+] fcim-monitor generator');
const gen = (am.match(/function genFcimMonitoring\(scopeKey\)\{[\s\S]*?\n    \}/) || [''])[0];
check('the generator exists', gen.length > 400);
check('it is wired into generate()', /if\(opts\.fcimMonitor\) candidates\.push\(\.\.\.genFcimMonitoring\(scope\)\);/.test(am));
check('the orphan sweep knows it (the §3.1 trap, not repeated)',
  // 23 Sep 2026: the usoc-info generator (G5) joined the same family and the same sweep clause.
  /\(g === 'fcim-monitor' && opts\.fcimMonitor\)/.test(am) || /\(\(g === 'fcim-monitor' \|\| g === 'usoc-info'\) && opts\.fcimMonitor\)/.test(am),
  'a generator outside the sweep leaves stale rows behind forever');
check('the AutoReq panel offers it, defaulted on, AC-scope-gated',
  /ar-gen-fcim-mon/.test(idx) && /fcimMonitor: {6}cb\('ar-gen-fcim-mon'\)/.test(hlp.replace(/\s+cb/g, '      cb')) || /fcimMonitor:\s*cb\('ar-gen-fcim-mon'\)/.test(hlp));
check('…and the scope-disable list covers it', /\['ar-gen-pra','ar-gen-zsa','ar-gen-fcim-mon'\]/.test(hlp));
check('it has a template-override slot and a label',
  /'fcim-monitor': {3}\{ text: '\$\{text\}', rat: '\$\{rat\}' \}/.test(am.replace(/'fcim-monitor':\s+\{/, "'fcim-monitor':   {")) && /FCIM pair → Crew-awareness monitoring/.test(am));
{
  const sb = { console, Date, JSON, Array, Object, String, Set };
  vm.createContext(sb);
  const fp = 'function fp(){ return Array.prototype.slice.call(arguments).map(x => JSON.stringify(x)).join("|"); }';
  vm.runInContext(fp + '\n' + gen + '\n; globalThis._g = genFcimMonitoring;', sb);
  const P = { internalId: 1, subId: 'SF-7', awareness: 'Aware', tlId: 'FC-10', tlDesc: 'Loss, crew aware', pairId: 'pair-1-2', pairGoverns: 'aware' };
  const U = { internalId: 2, subId: 'SF-7', awareness: 'Unaware', tlId: 'FC-11', tlDesc: 'Loss, crew unaware', plId: 'FC-12', plDesc: 'Partial, unaware', pairId: 'pair-1-2', pairGoverns: 'aware' };

  sb.acFcimData = [P, U];
  let out = sb._g('ac');
  check('a credited-aware pair emits exactly ONE requirement', out.length === 1, String(out.length));
  check('the requirement is a single shall naming the UNAWARE conditions',
    out.length === 1 && /^Failure conditions FC-11, FC-12 of SF-7 shall be annunciated to the flight crew\.$/.test(out[0].text),
    'atomic by construction — one imperative, and it names what the credit must make visible');
  check('the rationale names the credit and how to withdraw it',
    out.length === 1 && /credit/.test(out[0].rat) && /withdraws this requirement/.test(out[0].rat));
  check('sourceId and fingerprint ride the pair, AutoReq-merge shaped',
    out.length === 1 && out[0].reqSource.sourceId === 'ac:fcim-monitor:pair-1-2' && /fcim-monitor/.test(out[0].reqSource.fingerprint));
  check('trace lands on the sub-function', out.length === 1 && out[0].traceId === 'SF-7');

  sb.acFcimData = [Object.assign({}, P, { pairGoverns: 'unaware' }), Object.assign({}, U, { pairGoverns: 'unaware' })];
  check('unaware-governs emits NOTHING — no credit, no debt', sb._g('ac').length === 0);
  sb.acFcimData = [Object.assign({}, P, { pairGoverns: '' }), Object.assign({}, U, { pairGoverns: '' })];
  check('an undecided pair emits nothing', sb._g('ac').length === 0);
  sb.acFcimData = [{ internalId: 9, subId: 'SF-9', awareness: 'Unaware', tlId: 'FC-20', tlDesc: 'Standalone unaware' }];
  check('a STANDALONE Unaware emits nothing — Waqas\'s ruling, executed', sb._g('ac').length === 0);
  sb.acFcimData = [Object.assign({}, P, { awareness: 'Aware' }), Object.assign({}, U, { awareness: 'Aware' })];
  check('a pair with no unaware half emits nothing', sb._g('ac').length === 0);
  sb.acFcimData = [P, U];
  check('system scope emits nothing (AC-only today, stated in the generator)', sb._g('sys-1').length === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

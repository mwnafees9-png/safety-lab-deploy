#!/usr/bin/env node
/*
 * Regression — ram_predict v0.1 + ram_predict_data v0.1 (RAM-PREDICT, task
 * #95: MIL-HDBK-217F parts-count prediction, PREDICTED lane).
 *   [1] data integrity: every category carries a page citation, a πQ table,
 *       a default quality inside that table, and positive λg values; harsher
 *       air environments exceed ground benign (AUF > GB) for every category;
 *       handbook gaps (relay/breaker CL, marked '*') are ABSENT, not zero.
 *   [2] arithmetic exact: hand-computed λ = Σ N·λg·πQ cases; MTBF = 10^6/λ.
 *   [3] refusals: no data (engine alone), unknown category NAMES the sourced
 *       set, unsourced env, missing env value ("No value, no guess"),
 *       zero quantity, unknown quality level.
 *   [4] two-lane posture: PREDICTED/claimed language in basis; drift()
 *       computes demonstrated-vs-predicted with credit-follows-demonstration
 *       note; incidents win over authored counts in drift.
 *   [5] wiring: data tag before engine tag, after markov_ndf; snav + view
 *       present; lane arrays in program_plan include ram-predict; bare
 *       projectConfig only; no RNG/Date/eval.
 * Run: node tests/regression_ram_predict.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

const DATA = require('../site/ram_predict_data.js');
global.window = { RAM_PREDICT_DATA: DATA };
const RP = require('../site/ram_predict.js');
const src = S('ram_predict.js'), dsrc = S('ram_predict_data.js'), idx = S('index.html');

// ---- [1] data integrity ---------------------------------------------------------
{
    const cats = Object.entries(DATA.categories);
    check('curated set is non-trivial (≥ 20 categories) with meta source + unit',
        cats.length >= 20 && /MIL-HDBK-217F Notice 2/.test(DATA.meta.source) && /10\^6/.test(DATA.meta.unit));
    check('every category: page citation + πQ table + default quality inside it + positive λg',
        cats.every(([k, c]) => /p\. A-\d/.test(c.cite) && c.piQ && c.piQ[c.defaultQuality] != null &&
            Object.values(c.lambdaG).every(v => v > 0) && Object.keys(c.lambdaG).length >= 12));
    check('air environments harsher than ground benign (AUF > GB) for every category',
        cats.every(([k, c]) => c.lambdaG.AUF > c.lambdaG.GB));
    check("handbook gaps are ABSENT keys, not zeros (relay/breaker cannon-launch '*')",
        DATA.categories['relay-gp'].lambdaG.CL === undefined && DATA.categories['breaker'].lambdaG.CL === undefined &&
        /marked '\*' in handbook/.test(dsrc));
    check('14 named environments incl. all five airborne', Object.keys(DATA.environments).length === 14 &&
        ['AIC', 'AIF', 'AUC', 'AUF', 'ARW'].every(e => DATA.environments[e]));
    check('microcircuits explicitly DEFERRED with the reason (πQ·πL) — no invented rows',
        /deferred/i.test(DATA.meta.deferred) && !Object.keys(DATA.categories).some(k => /micro|mcu|memory/i.test(k)));
}

// ---- [2] arithmetic exact -------------------------------------------------------
{
    // 10 × diode-gp @ JANTX (πQ=1.0) in AIC: λ = 10 · 0.092 · 1.0 = 0.92 → MTBF = 1e6/0.92
    const r = RP.predict([{ cat: 'diode-gp', qty: 10, quality: 'JANTX' }], 'AIC');
    check('10× diode-gp JANTX in AIC: λ = 0.92 exactly, MTBF = 1e6/0.92',
        Math.abs(r.lambdaTotal - 0.92) < 1e-12 && Math.abs(r.mtbfHrs - 1e6 / 0.92) < 1e-6);
    // mixed: 100× res-film @ R (0.10) + 20× cap-ceramic @ M (1.0) in AUF:
    // 100·0.22·0.10 + 20·0.24·1.0 = 2.2 + 4.8 = 7.0
    const m = RP.predict([{ cat: 'res-film', qty: 100, quality: 'R' }, { cat: 'cap-ceramic', qty: 20, quality: 'M' }], 'AUF');
    check('mixed board in AUF: λ = 7.0 exactly (2.2 + 4.8)', Math.abs(m.lambdaTotal - 7.0) < 1e-12);
    check('per-row receipts: N, λg, πQ, contribution, and the citation on every row',
        m.rows.length === 2 && m.rows.every(x => x.qty && x.lambdaG && x.piQ != null && x.contrib > 0 && /p\. A-\d/.test(x.cite)));
    check('default quality applies when unspecified (diode → JANTX)',
        RP.predict([{ cat: 'diode-gp', qty: 1 }], 'GB').rows[0].quality === 'JANTX');
}

// ---- [3] refusals ---------------------------------------------------------------
{
    const saved = global.window.RAM_PREDICT_DATA;
    global.window.RAM_PREDICT_DATA = null;
    check('no staged data ⇒ engine refuses (no invented rates)',
        throws(() => RP.predict([{ cat: 'diode-gp', qty: 1 }], 'GB'), /will not invent generic failure rates/));
    global.window.RAM_PREDICT_DATA = saved;
    check('unknown category refused, NAMING the sourced set',
        throws(() => RP.predict([{ cat: 'flux-capacitor', qty: 1 }], 'GB'), /not in the sourced set.*diode-gp/));
    check('unsourced environment refused', throws(() => RP.predict([{ cat: 'diode-gp', qty: 1 }], 'XX'), /environment "XX" is not in the sourced table set/));
    check('missing env value refused — "No value, no guess" (relay in cannon launch)',
        throws(() => RP.predict([{ cat: 'relay-gp', qty: 1 }], 'CL'), /No value, no guess/));
    check('zero quantity + unknown quality refused',
        throws(() => RP.predict([{ cat: 'diode-gp', qty: 0 }], 'GB'), /counts parts/) &&
        throws(() => RP.predict([{ cat: 'diode-gp', qty: 1, quality: 'best' }], 'GB'), /quality level "best" is not sourced/));
}

// ---- [4] two-lane posture -------------------------------------------------------
{
    const r = RP.predict([{ cat: 'diode-gp', qty: 10 }], 'AIC');
    check('basis carries PREDICTED-lane ink + computed-never-stored',
        /a prediction earns no credit/i.test(r.basis) && /FRACAS ledger demonstrates/.test(r.basis) && /Computed, never stored/.test(r.basis));
    const rec = { id: 'FRC-1', hours: 100000, failures: 7, incidents: [{ id: 'I1' }, { id: 'I2' }] };
    const d = RP.drift(r, rec);
    check('drift: incidents WIN over authored failures (MTBF from 2 incidents, not 7)',
        Math.abs(d.demonstratedMtbf - 50000) < 1e-9 && /credit follows the demonstration/.test(d.note));
    check('drift null when nothing demonstrated', RP.drift(r, { id: 'x', hours: 0 }) === null);
}

// ---- [5] wiring -----------------------------------------------------------------
check('script order: markov_ndf < data < engine (data must exist before the engine looks)',
    idx.indexOf('markov_ndf.js') < idx.indexOf('ram_predict_data.js') && idx.indexOf('ram_predict_data.js') < idx.indexOf('ram_predict.js') &&
    /ram_predict_data\.js\?v=0\.\d/.test(idx) && /ram_predict\.js\?v=0\.\d/.test(idx));
check('snav + view + host present', /snav-ram-predict/.test(idx) && /view-ram-predict/.test(idx) && /ram-predict-host/.test(idx));
check('plan-driven: ram-reliability lane arrays include the new tab (program_plan v0.6+)',
    /snav-ram-predict/.test(S('program_plan.js')) && /'ram-predict'/.test(S('program_plan.js')) && (PIN.atLeast(idx, 'program_plan.js', '0.6')));
{
    const codeLines = src.split('\n').filter(l => !/^\s*\/\//.test(l));
    check('bare projectConfig in code; no RNG/Date/eval',
        codeLines.every(l => l.indexOf('window.projectConfig') === -1 && l.indexOf('Math.random') === -1 && !/\bnew Date\b|\bDate\.now\b/.test(l)) &&
        src.indexOf('(0, eval)') === -1 && src.indexOf('new Function') === -1);
}
check('persistence rides projectConfig.ram.predict — no new top-level store',
    /projectConfig\.ram/.test(src) && S('misc_fn_modules.js').indexOf('ramPredict') === -1);
// The nav-visibility fix (found live 20 Jul): the core switchTab `tabs` array does
// NOT contain 'ram-predict', so the wrap MUST toggle its own view's display or the
// nav button fills the host while the view stays hidden.
check("switchTab wrap toggles view-ram-predict display (not just renderPage) — the invisible-lane fix",
    /getElementById\('view-ram-predict'\)/.test(src) && /style\.display = \(tabId === 'ram-predict'\) \? 'block' : 'none'/.test(src));
check("'interdep' is registered in the core switchTab tabs array (a view not in it can't be hidden)",
    /'interdep'\]/.test(S('support_modules.js')) || /, 'interdep'/.test(S('support_modules.js')));
check("READS DON'T WRITE: renderPage/compute use _read(); only authored actions _ensure() (battery-caught in v0.1)",
    /function _read\(\)/.test(src) && /function _ensure\(\)/.test(src) &&
    /const st = _read\(\); const db = _db\(\)/.test(src) && !/renderPage[\s\S]{0,400}_ensure\(\)/.test(src.split('function renderPage')[1].split('function compute')[0]));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

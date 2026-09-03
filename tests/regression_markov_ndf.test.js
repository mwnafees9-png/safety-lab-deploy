#!/usr/bin/env node
/*
 * Regression — markov_ndf v0.1 (MARKOV-NDF, task #96: 3-state N/D/F discrete
 * template, dual-solved with a worked receipt).
 *   [1] exactness: a doubly-stochastic matrix has the uniform steady state —
 *       π = [⅓,⅓,⅓] to 1e-12; the default template solves with residual
 *       < 1e-12 and methods agreeing < 1e-9.
 *   [2] refusals with engineering language: row not summing to 1 NAMES the
 *       row; out-of-range entry named; wrong shape; reducible chain
 *       (absorbing unreachable) refused as singular.
 *   [3] receipt: balance equations + interpretation per state + basis with
 *       residual, method delta, computed-never-stored.
 *   [4] doctrine: solved twice (elimination + power iteration), disagreement
 *       refuses; no RNG / Date / eval / store access; card injects above the
 *       CTMC models container (the rate models stay the certification path).
 *   [5] wiring: script tag cache-busted after fta_quant (page exists by then).
 * Run: node tests/regression_markov_ndf.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

const M = require('../site/markov_ndf.js');
const src = S('markov_ndf.js'), idx = S('index.html');

// ---- [1] exactness --------------------------------------------------------------
{
    const ds = [[0.9, 0.1, 0], [0, 0.9, 0.1], [0.1, 0, 0.9]];   // doubly stochastic → uniform
    const r = M.solve(ds);
    check('doubly-stochastic ⇒ uniform steady state to 1e-12',
        r.pi.every(x => Math.abs(x - 1 / 3) < 1e-12));
    const d = M.solve(M.DEFAULT);
    check('default N/D/F template: residual < 1e-12, methods agree < 1e-9, Σπ = 1',
        d.residual < 1e-12 && d.methodDelta < 1e-9 && Math.abs(d.pi[0] + d.pi[1] + d.pi[2] - 1) < 1e-12);
    check('deterministic: same matrix ⇒ identical solution', JSON.stringify(M.solve(M.DEFAULT).pi) === JSON.stringify(d.pi));
}

// ---- [2] refusals ---------------------------------------------------------------
check('row not summing to 1 refused, NAMING the row',
    throws(() => M.solve([[0.9, 0.05, 0.02], [0.03, 0.9, 0.07], [0.1, 0, 0.9]]), /Normal row sums to .* leaks probability/));
check('out-of-range entry refused by name',
    throws(() => M.solve([[1.2, -0.2, 0], [0.03, 0.9, 0.07], [0.1, 0, 0.9]]), /not a probability in \[0, 1\]/));
check('wrong shape refused', throws(() => M.solve([[1]]), /exactly 3×3/));
check('reducible chain (two closed classes) refused as singular',
    throws(() => M.solve([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), /reducible|singular/i));

// ---- [3] receipt ----------------------------------------------------------------
{
    const d = M.solve(M.DEFAULT);
    check('balance equations printed (π_N, π_D lines + normalization note)',
        d.equations.length === 3 && /π_N = π_N·0\.97/.test(d.equations[0]) && /replaces the redundant/.test(d.equations[2]));
    check('interpretation per state in plain language',
        d.interpretation.length === 3 && /% of its steps in Normal/.test(d.interpretation[0]) && /Degraded/.test(d.interpretation[1]));
    check('basis carries residual + method delta + computed-never-stored',
        /residual ‖πP−π‖∞/.test(d.basis) && /agreement asserted/.test(d.basis) && /Computed, never stored/.test(d.basis));
}

// ---- [4] doctrine ---------------------------------------------------------------
check('solved twice: elimination AND power iteration in source; disagreement refuses',
    /solveLinear/.test(src) && /solvePower/.test(src) && /DISAGREEMENT/.test(src) && /refuses to show a number it cannot compute twice/.test(src));
check('dispatch/MMEL connection in the card copy', /MMEL/.test(src) && /dispatch thinking/.test(src));
{
    const codeLines = src.split('\n').filter(l => !/^\s*\/\//.test(l));
    check('no RNG / Date / eval / store access (comment mentions allowed)',
        codeLines.every(l => l.indexOf('Math.random') === -1 && !/\bnew Date\b|\bDate\.now\b/.test(l)) &&
        src.indexOf('(0, eval)') === -1 && src.indexOf('new Function') === -1 &&
        src.indexOf('projectConfig') === -1 && src.indexOf('scheduleAutosave') === -1);
}
check('card injects ABOVE the CTMC container; rate models stay the certification path',
    /insertBefore\(card, container\)/.test(src) && /certification path/.test(src));

// ---- [5] wiring -----------------------------------------------------------------
check('script tag cache-busted, after fta_quant_modules', /markov_ndf\.js\?v=0\.\d/.test(idx) &&
    idx.indexOf('fta_quant_modules.js') < idx.indexOf('markov_ndf.js'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

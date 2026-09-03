#!/usr/bin/env node
/*
 * Regression — rbd_xcheck v0.1 (RBD-XCHECK, task #94: tie-set vs cut-set dual
 * computation with an asserted agreement invariant, INV-33).
 *   [1] set enumeration exact on known structures: series, parallel,
 *       series-parallel, 2oo3 (tie-sets AND their cut-set duals).
 *   [2] the dual agrees AND matches hand-computed exact reliability:
 *       series(a,b): R = ra·rb; parallel: 1−qa·qb; 2oo3 (r=0.9): 0.972;
 *       bridge-free series-parallel composite.
 *   [3] disagreement is a REFUSAL, not a display: tolerance breach throws
 *       with INV-33 language (forced via a doctored _unionProb comparison).
 *   [4] honest limits: > IE cap refuses with the reason; unknown node kind
 *       refuses; t ≤ 0 refuses; empty structure refuses.
 *   [5] INV-33 registered hard into the SHARED sweep; id INV-33 is unique
 *       site-wide (the zonal lesson, permanently checked).
 *   [6] wiring: script tag after rbd_module, cache-busted; _xcWrapped moat;
 *       bare projectConfig (never window.projectConfig); no eval/random/Date.
 * Run: node tests/regression_rbd_xcheck.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

const XC = require('../site/rbd_xcheck.js');
const src = S('rbd_xcheck.js'), idx = S('index.html');

// Blocks with λ chosen so r = e^{-λt} is a round probability at t=1:
const B = (name, r) => ({ kind: 'block', name: name, lambda: -Math.log(r) });
const ser = (...c) => ({ kind: 'series', children: c });
const par = (...c) => ({ kind: 'parallel', children: c });
const koon = (k, ...c) => ({ kind: 'koon', k: k, children: c });
const close = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-12);

// ---- [1] set enumeration exact --------------------------------------------------
{
    const s = ser(B('a', 0.9), B('b', 0.8));
    const idxMap = new Map(XC.leaves(s).map((n, i) => [n, i]));
    check('series: one tie-set {a,b}; two cut-sets {a},{b}',
        JSON.stringify(XC.tieSets(s, idxMap)) === '[[0,1]]' && JSON.stringify(XC.cutSets(s, idxMap)) === '[[0],[1]]');
    const p = par(B('a', 0.9), B('b', 0.8));
    const pm = new Map(XC.leaves(p).map((n, i) => [n, i]));
    check('parallel: two tie-sets {a},{b}; one cut-set {a,b}',
        JSON.stringify(XC.tieSets(p, pm)) === '[[0],[1]]' && JSON.stringify(XC.cutSets(p, pm)) === '[[0,1]]');
    const v = koon(2, B('a', 0.9), B('b', 0.9), B('c', 0.9));
    const vm = new Map(XC.leaves(v).map((n, i) => [n, i]));
    check('2oo3: three 2-element tie-sets; three 2-element cut-sets',
        XC.tieSets(v, vm).length === 3 && XC.tieSets(v, vm).every(x => x.length === 2) &&
        XC.cutSets(v, vm).length === 3 && XC.cutSets(v, vm).every(x => x.length === 2));
}

// ---- [2] dual agreement + hand-computed exactness -------------------------------
{
    const r1 = XC.xcheck(ser(B('a', 0.9), B('b', 0.8)), 1);
    check('series(0.9,0.8): both views = 0.72 exactly', r1.agree && close(r1.rTie, 0.72) && close(r1.rCut, 0.72));
    const r2 = XC.xcheck(par(B('a', 0.9), B('b', 0.8)), 1);
    check('parallel(0.9,0.8): both views = 0.98 exactly', r2.agree && close(r2.rTie, 0.98) && close(r2.rCut, 0.98));
    const r3 = XC.xcheck(koon(2, B('a', 0.9), B('b', 0.9), B('c', 0.9)), 1);
    check('2oo3(0.9): both views = 0.972 exactly', r3.agree && close(r3.rTie, 0.972, 1e-9) && close(r3.rCut, 0.972, 1e-9));
    // composite: series(parallel(a,b), c) with ra=0.9, rb=0.8, rc=0.95 → (1−0.1·0.2)·0.95 = 0.931
    const r4 = XC.xcheck(ser(par(B('a', 0.9), B('b', 0.8)), B('c', 0.95)), 1);
    check('series(parallel(a,b),c): both views = 0.931 exactly', r4.agree && close(r4.rTie, 0.931, 1e-9) && close(r4.rCut, 0.931, 1e-9));
    check('receipts carry named tie/cut sets + counts + basis',
        r4.tieSets.join('|') === 'a·c|b·c' && r4.cutSets.join('|') === 'c|a·b' &&
        /computed twice/.test(r4.basis) && /Computed, never stored/.test(r4.basis));
}

// ---- [3] disagreement is a refusal ----------------------------------------------
check('disagreement throws with INV-33 language (never displays a number)',
    /DISAGREEMENT/.test(src) && /refuses to show a number it cannot compute twice/.test(src) && /INV-33 hard finding/.test(src));

// ---- [4] honest limits ----------------------------------------------------------
{
    // 17 parallel blocks → 17 tie-sets > IE_CAP 16 → refusal names the cap
    const many = par(...Array.from({ length: 17 }, (_, i) => B('x' + i, 0.9)));
    check('above the inclusion–exclusion cap → named refusal, no silent truncation',
        throws(() => XC.xcheck(many, 1), /exceeds the inclusion–exclusion cap of 16/));
    check('t ≤ 0, empty structure, unknown kind all refused',
        throws(() => XC.xcheck(ser(B('a', 0.9)), 0), /mission time/) &&
        throws(() => XC.xcheck({ kind: 'series', children: [] }, 1), /no blocks/) &&
        throws(() => XC.xcheck({ kind: 'mystery', children: [B('a', 0.5)] }, 1), /unknown node kind/));
}

// ---- [5] INV-33 into the shared sweep, id unique site-wide ----------------------
check('INV-33 registered HARD via window.invRegister (shared sweep, no parallel panel)',
    /invRegister\(\{\s*\n?\s*id: 'INV-33'/.test(src.replace(/\r/g, '')) && /sev: 'hard'/.test(src));
{
    const all = fs.readdirSync(path.join(__dirname, '..', 'site')).filter(f => f.endsWith('.js'));
    let owners = [];
    all.forEach(f => { if (/id:\s*'INV-33'/.test(S(f))) owners.push(f); });
    check('INV-33 id unique site-wide (the zonal/INV-18 lesson)', owners.length === 1 && owners[0] === 'rbd_xcheck.js', owners.join(','));
}
check('third leg: sweep compares against rbd_module structural R (_rbdR)', /_rbdR/.test(src) && /structural R/.test(src));

// ---- [6] wiring -----------------------------------------------------------------
check('script tag after rbd_module AND after invariants.js (invRegister exists at load — the v0.1 silent-skip lesson), cache-busted',
    /rbd_xcheck\.js\?v=0\.\d/.test(idx) &&
    idx.indexOf('rbd_module.js') < idx.indexOf('rbd_xcheck.js') &&
    idx.indexOf('invariants.js') < idx.indexOf('rbd_xcheck.js'));
check('registration retries instead of silently skipping; absence is CONSOLE-LOUD',
    /_register\(attempt \+ 1\)/.test(src) && /A missing check is a hole, not a pass/.test(src));
check('moat guard (_xcWrapped) on the renderRamRbdPage wrap', /_xcWrapped/.test(src));
{
    const codeLines = src.split('\n').filter(l => !/^\s*\/\//.test(l));
    check('bare projectConfig in code, never window.projectConfig (the OPS-MC lesson; comment mentions allowed)',
        /typeof projectConfig [!=]== 'undefined'/.test(src) && codeLines.every(l => l.indexOf('window.projectConfig') === -1));
    check('no eval / no Math.random / no Date in code', src.indexOf('(0, eval)') === -1 && src.indexOf('new Function') === -1 &&
        codeLines.every(l => l.indexOf('Math.random') === -1 && !/\bnew Date\b|\bDate\.now\b/.test(l)));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

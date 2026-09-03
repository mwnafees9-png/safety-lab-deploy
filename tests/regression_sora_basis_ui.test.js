#!/usr/bin/env node
/*
 * Regression — SORA-basis reference page (found live 22 Jul: a Part 107/SORA
 * project showed an all-null DAL/probability ladder mislabeled "Part 25
 * Transport"). Locks:
 *   [1] renderProbTable branches on _isSoraBasis BEFORE building the DAL ladder,
 *       and renders soraSailReferenceHTML() for a SORA basis.
 *   [2] _isSoraBasis detects both SORA regulation values (Part 107, specific-sora).
 *   [3] soraSailReferenceHTML reads the verified engine (window.SORA), prints a
 *       SAIL I–VI table, cites Annex E, and reproduces NO criteria prose.
 *   [4] the section heading/hint are relabeled away from "quantitative / DAL".
 *   [5] projectScopeLabel names every basis (no longer defaults all non-Part-23
 *       to "Part 25 Transport") — the mislabel that put "Part 25 Transport" on a
 *       Part 107 page.
 * Source-inspection pattern (the module carries browser globals; can't require).
 * Run: node tests/regression_sora_basis_ui.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const H = S('helpers_modules.js'), SUP = S('support_modules.js');

// ---- [1] renderProbTable branches to SORA first --------------------------------
{
    const rpStart = H.indexOf('function renderProbTable()');
    const iBranch = H.indexOf('if (_isSoraBasis())', rpStart);
    const iSev = H.indexOf("severities = ['Catastrophic'", rpStart);
    check('renderProbTable branches on _isSoraBasis and returns the SAIL reference',
        iBranch !== -1 && iSev !== -1 && iBranch < iSev &&
        H.indexOf('soraSailReferenceHTML()', rpStart) !== -1);
}

// ---- [2] SORA basis detection --------------------------------------------------
check('_isSoraBasis detects Part 107 AND specific-sora',
    /function _isSoraBasis\(\)/.test(H) && /reg === 'Part 107'/.test(H) && /reg === 'specific-sora'/.test(H));

// ---- [3] the SAIL reference renderer -------------------------------------------
{
    const start = H.indexOf('function soraSailReferenceHTML()');
    const end = H.indexOf('function renderProbTable()');
    const fn = H.slice(start, end);
    check('reads the verified engine (window.SORA.osoList + osoRobustness), guards when absent',
        /window\.SORA/.test(fn) && /osoList\(\)/.test(fn) && /osoRobustness\(/.test(fn) && /not loaded/.test(fn));
    check('renders a SAIL I–VI header row and the four robustness levels',
        /SAIL '\s*\+\s*ROMAN\[s\]/.test(fn) && /High/.test(fn) && /Medium/.test(fn) && /Low/.test(fn));
    check('cites Annex E + states the copyright discipline, reproduces no criteria prose',
        /JARUS SORA v2\.5 Annex E/.test(fn) && /copyrighted and not reproduced/.test(fn) &&
        !/The applicant (is|has|holds)/.test(fn));
    check('states SAIL has no probability target / no DAL, and is set from GRC × ARC (Table 7)',
        /no per-flight-hour probability target and no DAL/.test(fn) && /Table 7/.test(fn));
    check('two-lane honesty: a required robustness is a claim until evidence is validated',
        /claim until its integrity/.test(fn));
}

// ---- [4] the relabel ------------------------------------------------------------
check('SORA branch relabels the heading/hint away from quantitative/DAL',
    /Applicable SAIL & OSO Robustness \(SORA\)/.test(H) && /no per-flight-hour target, no DAL/.test(H));

// ---- [5] projectScopeLabel names every basis -----------------------------------
{
    // 31 Aug 2026 — window widened 900 → 1400: the SC-VTOL case now appends a
    // "(legacy — confirm seat band)" suffix (MOC SC-VTOL Table 1 split), which pushed
    // the later cases past the old slice. Same assertions, superseded in place.
    const fn = SUP.slice(SUP.indexOf('function projectScopeLabel()'), SUP.indexOf('function projectScopeLabel()') + 1400);
    check('projectScopeLabel is a per-basis switch (not the old non-Part-23 → Part 25 default)',
        /switch \(reg\)/.test(fn) && !/: 'Part 25 Transport';\s*\n}/.test(fn));
    check('Part 107 and specific-sora get SORA labels (no longer "Part 25 Transport")',
        /case 'Part 107':\s*return 'Part 107 \+ SORA/.test(fn) && /case 'specific-sora':\s*return 'SORA Specific Category'/.test(fn));
    check('the other bases are named too (27/29/33/35/SC-VTOL/450/Custom)',
        ['Part 27', 'Part 29', 'Part 33', 'Part 35', 'SC-VTOL', 'Part 450', 'Custom'].every(k => fn.indexOf("case '" + k + "'") !== -1));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

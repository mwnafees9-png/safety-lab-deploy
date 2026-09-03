/*
 * tests/regression_cert_coverage.test.js — the capstone of the "every publicly available
 * standard" campaign (Waqas, 31 Aug 2026: "I want all the publically available standards
 * on it ... every single one").
 *
 * The gap class we fixed repeatedly this session was a cert basis that carries NUMBERS in
 * the engine (PROB_TARGETS / DAL_TARGETS) but no authority text explaining them — SC-VTOL
 * Basic scored 2–9-seat eVTOLs on the 0–1-seat row; the single Part 27 row matched no
 * class; several bases had a bare/placeholder severity rubric. This suite makes that class
 * of gap unshippable: EVERY cert basis the engine can score must have (1) a severity
 * rubric quoting the governing authority (severity_rubrics.js) and (2) a citation in the
 * cert-basis spine's TARGET_CITE (cert_basis_spine.js). Executes the real extracted code.
 * Run: node tests/regression_cert_coverage.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const tsrc = read('safety_targets.js');
const [PROB_TARGETS, DAL_TARGETS] = new Function(tsrc + ';return [PROB_TARGETS, DAL_TARGETS];')();
const RUB = require(path.join(SITE, 'severity_rubrics.js'));
const spine = read('cert_basis_spine.js');

const bases = Object.keys(PROB_TARGETS);
check('the engine scores a non-trivial set of cert bases (>= 18)', bases.length >= 18, 'got ' + bases.length);

// (1) every scorable basis has a severity rubric that names an authority
{
    const missing = bases.filter(k => {
        const r = RUB.rubricFor(k);
        return !r || r.length < 400 || !/AC \d|CFR|MOC|EASA|SORA|§33\.75|§35\.15|mission-risk/.test(r);
    });
    check('EVERY cert basis has a severity rubric quoting the governing authority', missing.length === 0, 'missing: ' + missing.join(', '));
}

// (2) every scorable basis has a citation in the spine TARGET_CITE map
{
    const cite = spine.slice(spine.indexOf('const TARGET_CITE'), spine.indexOf('const TARGET_CITE') + 3000);
    const missing = bases.filter(k => cite.indexOf("'" + k + "'") < 0);
    check('EVERY cert basis has a TARGET_CITE entry in the spine', missing.length === 0, 'missing: ' + missing.join(', '));
}

// (3) DAL_TARGETS and PROB_TARGETS agree on the key set (no half-defined basis)
{
    const pk = new Set(Object.keys(PROB_TARGETS)), dk = new Set(Object.keys(DAL_TARGETS));
    const onlyP = [...pk].filter(k => !dk.has(k)), onlyD = [...dk].filter(k => !pk.has(k));
    check('PROB_TARGETS and DAL_TARGETS cover the same cert bases', onlyP.length === 0 && onlyD.length === 0, 'prob-only: ' + onlyP + ' dal-only: ' + onlyD);
}

// (4) the split families all resolve their legacy alias to a real row (no orphan alias)
{
    const aliases = ['SC-VTOL Basic', 'Part 27'];
    const bad = aliases.filter(a => !PROB_TARGETS[a] || !DAL_TARGETS[a]);
    check('legacy aliases (SC-VTOL Basic, Part 27) still resolve to a real row', bad.length === 0, bad.join(', '));
}

// (5) campaign census — the families that were fetched into the corpus this session
{
    const KB = require(path.join(SITE, 'cert_std_kb_data.js'));
    const src = KB.chunks.map(c => c.source).join(' | ');
    const families = {
        'AC 23.1309-1E': /AC 23\.1309-1E/, '14 CFR §23.2510': /§23\.2510|23\.2510/, 'AC 25.1309-1B': /AC 25\.1309-1B/,
        'SC-VTOL / MOC': /SC-VTOL|MOC VTOL/, 'AC 29-2C': /AC 29-2C/, 'AC 27-1B': /AC 27-1B/, 'PS-ASW-27-15': /PS-ASW-27-15/,
        '§33.75 / AC 33.75-1A': /33\.75/, '§35.15': /35\.15/, 'AC 20-174': /AC 20-174/, 'AC 20-115D': /20-115D/,
        'AC 20-152A': /20-152A/, 'AMC 25.1309': /AMC 25\.1309/, 'EASA CS-23': /CS-23/, 'EASA CS-27': /CS-27/,
        'EASA CS-29': /CS-29/, 'EASA CS-E': /CS-E/, 'MIL-STD-882E': /882E/, '14 CFR Part 21': /Part 21|§21\.1(6|7)|§21\.101/
    };
    const absent = Object.keys(families).filter(f => !families[f].test(src));
    check('CAMPAIGN CENSUS — all ' + Object.keys(families).length + ' fetched cert-basis families are present in the corpus', absent.length === 0, 'absent: ' + absent.join(', '));
    const ver = (read('cert_std_kb_data.js').match(/window\.SL_CERTSTD_KB = \{ version: (\d+)/) || [])[1];
    check('corpus is coherent: >= 60 chunks, unique contiguous ids, version >= 9',
        KB.chunks.length >= 60 && new Set(KB.chunks.map(c => c.id)).size === KB.chunks.length && Number(ver) >= 9, 'n=' + KB.chunks.length + ' v=' + ver);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

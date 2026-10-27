#!/usr/bin/env node
/*
 * Regression: the MF&MS seed sweep never takes its own seeds' verification copies for real MF&MS pages (27 Oct 2026).
 *
 * FOUND: regression_bookkeeping_writes [B] went red in the browser, "removed 11, seeded 0", more often on a busy
 *   machine. The sample project seeds 12 multi-system trees; verify_sync.js then gives each one its verification copy
 *   (id "ver-idp-pg-<n>-<stamp>", name "MF&MS · FC-03 — seeded (Verification)", verifies = the seed). The sweep matched
 *   real MF&MS pages by "mac-pg-" or "MF&MS" in the name, so the copies counted as real pages covering the condition
 *   and every untouched seed was deleted, its verification copy left behind. Probed live: the 12 extra "covering"
 *   pages at the moment of removal were exactly the 12 verification copies.
 * EXECUTED: the real idp_seed_trees.js in a vm (the regression_perf_idp_sweep harness): a seed with its verification
 *   copy is kept; a real MF&MS page (mac-pg-) still takes the seed's place, as designed; and the ASA triage's own
 *   match leaves verification copies out.
 * MUTATION PROOF: SL_IDPMIRROR_MUTATE=1 takes the verification check out of the sweep: red.
 * Run: node tests/regression_idp_seed_mirror_20261027.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
let SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'idp_seed_trees.js'), 'utf8');
if (process.env.SL_IDPMIRROR_MUTATE) SRC = SRC.replace("function _isVerification(p) { return !!p && (p.verifies != null || String(p.id).indexOf('ver-') === 0); }", 'function _isVerification(p) { return false; }');
const ASA = fs.readFileSync(path.join(__dirname, '..', 'site', 'asa_triage.js'), 'utf8');

function sandbox() {
    const sb = {
        console, Math, JSON, Set, Map, Object, Array, String, Number, Date, Error,
        setTimeout: () => 0, setInterval: () => 1,
        document: { readyState: 'complete', addEventListener() {} },
        internalIdCounter: 1,
        acFhaData: [{ internalId: 1003, fcId: 'FC-03', fcDesc: 'Loss of braking' }],
        systemsData: [{ id: 'sysA', name: 'A', fha: [] }, { id: 'sysB', name: 'B', fha: [] }],
        resourcesData: [], projectConfig: { interdep: { cells: {} } }, ftaPages: [],
        idpContributors: () => ['sysA', 'sysB'], idpIndexBatch: fn => fn(), renderFTASidebar() {}, scheduleAutosave() {}
    };
    sb.window = sb; vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'idp_seed_trees.js' });
    return sb;
}

console.log('[1] a seed and its verification copy');
let sb = sandbox();
let r = sb.SL_IDP.run();
check('the first sweep seeds the multi-system condition', r.seeded === 1, JSON.stringify(r));
const seed = sb.ftaPages.find(p => p.id === 'idp-pg-1003');
// the copy as verify_sync.js makes it
sb.ftaPages.push({ id: 'ver-idp-pg-1003-mvq1f41y', name: seed.name + ' (Verification)', root: { id: 9, type: 'gate', children: [] }, mode: 'bottom-up', verifies: seed.id, linkedFhaId: 1003, treeLevel: 'aircraft' });
r = sb.SL_IDP.run();
check('the next sweep keeps the seed (removed none)', r.removed === 0 && r.kept === 1 && sb.ftaPages.some(p => p.id === 'idp-pg-1003'), JSON.stringify(r));
check('...and leaves its verification copy where it is', sb.ftaPages.some(p => p.id === 'ver-idp-pg-1003-mvq1f41y'));
// a copy recognized by its id alone (an older build that did not write verifies)
sb.ftaPages[sb.ftaPages.length - 1].verifies = undefined;
r = sb.SL_IDP.run();
check('a "ver-" copy without verifies is not taken for a real page either', r.removed === 0 && r.kept === 1, JSON.stringify(r));

console.log('[2] a REAL MF&MS page still takes the seed\'s place, as designed (the control)');
sb = sandbox(); sb.SL_IDP.run();
sb.ftaPages.push({ id: 'mac-pg-mac-sf03', name: 'MF&MS · FC-03', root: { id: 7, type: 'gate', children: [] }, mode: 'top-down', linkedFhaId: 1003, treeLevel: 'aircraft' });
r = sb.SL_IDP.run();
check('an untouched seed goes once a real MF&MS page covers the condition', r.removed === 1 && !sb.ftaPages.some(p => p.id === 'idp-pg-1003'), JSON.stringify(r));

console.log('[3] the ASA triage\'s MF&MS match');
check('verification copies are left out of the triage\'s MF&MS pages', /_pages\(\)\.filter\(p => p && p\.root && p\.verifies == null && String\(p\.id\)\.indexOf\('ver-'\) !== 0 &&/.test(ASA));
const H = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
check('index.html loads idp_seed_trees.js 1.5 or later and asa_triage.js 1.14 or later', /idp_seed_trees\.js\?v=1\.([5-9]|\d\d)"/.test(H) && /asa_triage\.js\?v=1\.(1[4-9]|[2-9]\d)"/.test(H));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

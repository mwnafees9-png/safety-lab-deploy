#!/usr/bin/env node
/*
 * Regression — perf fix 3 (23 Sep 2026): batch-scoped interdependence index.
 *
 * _idpSystemsImplementing and _idpFnOwner were linear scans over every
 * system's functions, called inside FC x system loops. Inside
 * idpIndexBatch(fn) they are answered from maps built once from systemsData;
 * outside any batch they scan exactly as before, and the maps are dropped
 * when the outermost batch ends, so an in-place edit can never be answered
 * from a stale map.
 *
 * Pins: identical answers batched vs unbatched on a randomized fixture
 * (duplicate funcIds, legacy traceId, nulls, duplicate system ids); the scan
 * count collapses inside a batch; no staleness after a batch; nesting; an
 * exception still closes the batch; the aggregate entry points are batched.
 * Run: node tests/regression_perf_idp_index.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const H = S('helpers_modules.js');

const a = H.indexOf('function _idpCellKey');
const b = H.indexOf('function renderInterdepPage');
check('idp logic region extracts cleanly', a > 0 && b > a);
const logic = H.slice(a, b);
function makeIdp(state) {
    const factory = new Function('projectConfig', 'systemsData', 'resourcesData', 'acFhaData',
        logic + '\n return { idpIndexBatch, _idpSystemsImplementing, _idpFnOwner, idpColumns, idpContributors, idpStats, _depth: () => _idpIdxDepth, _idx: () => _idpIdx };');
    return factory(state.projectConfig, state.systemsData, state.resourcesData, state.acFhaData);
}

// ---- randomized fixture ------------------------------------------------------------
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = rng(7);
const SUBS = Array.from({ length: 40 }, (_, i) => 'SF-' + i);
let readsOfFunctions = 0;
const systemsData = [];
for (let i = 0; i < 60; i++) {
    const fns = [];
    const nf = Math.floor(r() * 5);
    for (let k = 0; k < nf; k++) {
        const x = r();
        const f = { funcId: (x < 0.1 ? 'DUP' : 'F' + i + '_' + k), funcName: 'fn' };
        if (x < 0.2) f.traceId = SUBS[Math.floor(r() * SUBS.length)];                      // legacy single trace
        else f.traceIds = [SUBS[Math.floor(r() * SUBS.length)], SUBS[Math.floor(r() * SUBS.length)]];
        fns.push(f);
    }
    if (r() < 0.1) fns.push(null);
    const sys = { id: (i === 59 ? 'S0' : 'S' + i), name: 'sys' + i, fha: [] };           // S0 duplicated on purpose
    Object.defineProperty(sys, 'functions', { enumerable: true, get() { readsOfFunctions++; return fns; } });
    systemsData.push(sys);
}
const state = { projectConfig: { interdep: { cells: {}, cra: {} } }, systemsData, resourcesData: [], acFhaData: [] };
const I = makeIdp(state);

// ---- 1. identical answers ----------------------------------------------------------------
const ask = () => ({
    impl: SUBS.concat(['nope', '', null]).map(s => I._idpSystemsImplementing(s)),
    own: ['DUP', 'F3_0', 'F10_1', 'missing', 3].map(id => { const o = I._idpFnOwner(id); return o ? o.system.name + '/' + JSON.stringify(o.fn) : null; })
});
const plain = ask();
const batched = I.idpIndexBatch(ask);
check('_idpSystemsImplementing: identical answers (order included) batched vs unbatched',
    JSON.stringify(plain.impl) === JSON.stringify(batched.impl), JSON.stringify(plain.impl).slice(0, 200));
check('_idpFnOwner: identical owner (first system, first function) batched vs unbatched',
    JSON.stringify(plain.own) === JSON.stringify(batched.own), JSON.stringify([plain.own, batched.own]).slice(0, 300));
check('a batched answer is a copy (a caller mutating it cannot corrupt the index)',
    I.idpIndexBatch(() => { const x = I._idpSystemsImplementing('SF-1'); x.push('JUNK'); return I._idpSystemsImplementing('SF-1').indexOf('JUNK') === -1; }));

// ---- 2. the scan collapses inside a batch --------------------------------------------------
readsOfFunctions = 0;
for (let i = 0; i < 200; i++) I._idpSystemsImplementing(SUBS[i % SUBS.length]);
const unbatchedReads = readsOfFunctions;
readsOfFunctions = 0;
I.idpIndexBatch(() => { for (let i = 0; i < 200; i++) { I._idpSystemsImplementing(SUBS[i % SUBS.length]); I._idpFnOwner('F3_0'); } });
const batchedReads = readsOfFunctions;
check('inside a batch the systems are scanned ONCE (not once per call)',
    batchedReads <= systemsData.length && unbatchedReads >= 200 * 10, 'batched=' + batchedReads + ' unbatched=' + unbatchedReads);

// ---- 3. no staleness ---------------------------------------------------------------------------
const before = I._idpSystemsImplementing('SF-NEW');
I.idpIndexBatch(() => I._idpSystemsImplementing('SF-1'));
systemsData[5].functions.push({ funcId: 'NEWF', traceIds: ['SF-NEW'] });   // in-place edit, no hook
check('the index is dropped when the batch ends', I._depth() === 0 && I._idx() === null);
check('an in-place edit after a batch is seen outside a batch',
    before.length === 0 && I._idpSystemsImplementing('SF-NEW').join() === 'S5');
check('…and by the next batch (fresh index)', I.idpIndexBatch(() => I._idpSystemsImplementing('SF-NEW').join()) === 'S5');

// ---- 4. nesting + exceptions ----------------------------------------------------------------------
I.idpIndexBatch(() => { I.idpIndexBatch(() => I._idpSystemsImplementing('SF-1')); check('a nested batch keeps the outer index alive', I._idx() !== null && I._depth() === 1); });
check('the outermost batch end drops it', I._idx() === null && I._depth() === 0);
try { I.idpIndexBatch(() => { I._idpSystemsImplementing('SF-1'); throw new Error('boom'); }); } catch (_) {}
check('an exception inside a batch still closes it', I._depth() === 0 && I._idx() === null);

// ---- 5. aggregate entry points are batched (same answers as before: regression_idp_functions pins them)
check('idpColumns runs in a batch', /function idpColumns\(\) \{ return idpIndexBatch\(_idpColumnsImpl\); \}/.test(H));
check('idpContributors runs in a batch', /function idpContributors\(fc\) \{ return idpIndexBatch\(\(\) => _idpContributorsImpl\(fc\)\); \}/.test(H));
check('idpStats runs in a batch', /function idpStats\(\) \{ return idpIndexBatch\(_idpStatsImpl\); \}/.test(H));
check('the combination candidates and the seed sweep run in a batch',
    /idpIndexBatch\(_candidatesImpl\)/.test(S('fc_variants.js')) && /idpIndexBatch\(run\)/.test(S('idp_seed_trees.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

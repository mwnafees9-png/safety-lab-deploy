#!/usr/bin/env node
/*
 * Regression — perf round 2 (23 Sep 2026): large-project background work.
 *
 *   A. minimalCutsetSnapshots (fta_quant_modules.js) — the independence
 *      ledger's cut sets, remembered per tree content: identical to
 *      bddMinimalCutsets, a repeat does no BDD work, a label/probability/
 *      structure change is a miss, and callers get copies.
 *   B. model_checks.js — each tree's single-failure events remembered per
 *      tree content: mcSpfList identical to the old algorithm (verbatim copy
 *      below), repeat does no BDD work, a change is a miss.
 *   C. ipLedger's compromise flag keeps its first timestamp while unchanged
 *      (it was rewritten every run: a save + sync every ~10 s forever).
 *   D. idpContributors memo inside a batch: identical answers, and in-place
 *      edits to systems / resources / the FC / its cells are never answered
 *      from memory.
 *   E. the system directory is written once, not with innerHTML += per card.
 * Run: node tests/regression_perf_round2.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- engine sandbox (index.html order) + model_checks ----------------------------------
const invs = {};
const p = { window: {}, console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object,
    Array, String, Number, isFinite, parseFloat, parseInt, Date, Int32Array, Float64Array, Uint32Array, Uint8Array,
    Promise, Error, RangeError, TypeError, setTimeout: () => 0, clearTimeout() {},
    setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
    document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) },
    localStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: { userAgent: 'node' },
    SEVERITY_RANK: { 'No Safety Effect': 0, Minor: 1, Major: 2, Hazardous: 4, Catastrophic: 5 },
    projectConfig: {}, acFhaData: [], systemsData: [], ftaPages: [] };
p.window = p; p.globalThis = p; p.self = p;
p.invRegister = inv => { invs[inv.id] = inv; };
vm.createContext(p);
let loadErr = null;
for (const name of ['fta_engine.js', 'fta_quant_modules.js', 'engine_modules.js', 'model_checks.js']) {
    try { vm.runInContext(read(name), p, { filename: name }); } catch (e) { loadErr = name + ': ' + e.message; }
}
check('engine files + model_checks.js load in index.html order', !loadErr, loadErr || '');
let builds = 0;
const realBuild = p.buildBDDFromFT;
p.buildBDDFromFT = function () { builds++; return realBuild.apply(this, arguments); };

let nid = 1;
const be = (prob, extra) => Object.assign({ id: nid++, type: 'basic', probability: prob, name: 'E' + nid, displayId: 'BE-' + nid, children: [] }, extra || {});
const gate = (gt, kids, extra) => Object.assign({ id: nid++, type: 'gate', gateType: gt, name: 'G', children: kids }, extra || {});
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randomTree(seed) {
    const r = rng(seed), types = ['AND', 'OR', 'OR', 'AND', 'VOTING'];
    const shared = [1, 2, 3].map(i => ({ logicalId: 'S' + seed + '_' + i }));
    function mk(depth) {
        if (depth === 0 || r() < 0.3) {
            const x = r();
            if (x < 0.25) return be(1e-4, { logicalId: shared[Math.floor(r() * 3)].logicalId });
            if (x < 0.35) return be(2e-3, { ccfGroup: 'G' + seed, beta: 0.1 });
            return be(Math.round(r() * 1e4) / 1e7);
        }
        const gt = types[Math.floor(r() * types.length)];
        const kids = []; const n = 2 + Math.floor(r() * 2); for (let i = 0; i < n; i++) kids.push(mk(depth - 1));
        return gate(gt, kids, gt === 'VOTING' ? { votingK: 2 } : {});
    }
    return mk(3);
}
const snap = n => ({ id: n.id, logicalId: n.logicalId, displayId: n.displayId, name: n.name, ccfGroup: n.ccfGroup, beta: n.beta, eventClass: n.eventClass });

// ---- A. cut-set snapshots -------------------------------------------------------------------
{
    let same = true, why = '';
    for (let s = 1; s <= 30 && same; s++) {
        const t = randomTree(s);
        const want = JSON.stringify((p.bddMinimalCutsets(t) || []).map(cs => cs.map(snap)));
        const got = JSON.stringify(p.minimalCutsetSnapshots(t));
        if (want !== got) { same = false; why = 'seed ' + s; }
    }
    check('A: cut-set snapshots equal bddMinimalCutsets (same sets, same order) on 30 trees', same, why);
    const T = randomTree(77);
    p.minimalCutsetSnapshots(T); builds = 0;
    const r1 = p.minimalCutsetSnapshots(T);
    check('A: a repeat does no BDD work', builds === 0);
    r1[0] && (r1[0][0].name = 'TAMPERED');
    check('A: callers get copies (mutating a result cannot corrupt the cache)', JSON.stringify(p.minimalCutsetSnapshots(T)).indexOf('TAMPERED') === -1);
    const leaf = (function f(n) { return n.type === 'gate' ? f(n.children[0]) : n; })(T);
    [['a name (a label the ledger shows)', () => { leaf.name = 'renamed'; }], ['a displayId', () => { leaf.displayId = 'BE-NEW'; }],
     ['a structure change', () => { T.children.push(be(0.1)); }]].forEach(([n, fn]) => {
        fn(); builds = 0;
        const got = JSON.stringify(p.minimalCutsetSnapshots(T));
        check('A: ' + n + ' is a miss with the fresh answer', builds === 1 && got === JSON.stringify((p.bddMinimalCutsets(T) || []).map(cs => cs.map(snap))));
    });
    check('A: the ledger uses the snapshots', /minimalCutsetSnapshots\(page\.root\)/.test(read('helpers_modules.js')));
}

// ---- B. model checks: single-failure events -------------------------------------------------
function oldSpf() {                       // verbatim logic of the pre-memo mcSpfList (rows before the acceptance store)
    const found = new Map();
    const rank = s => p.SEVERITY_RANK[s] || 0;
    p.ftaPages.forEach(page => {
        const f = p.acFhaData.find(x => String(x.internalId) === String(page.linkedFhaId));
        if (!f || rank(f.severity) < 4) return;
        const worst = f;
        let built; try { built = realBuild(page.root); } catch (_) { return; }
        const { bdd, varOrder, varMeta } = built;
        if (!bdd || bdd.isTerminal) return;
        if (p._mcMinOrder(bdd) > 1) return;
        for (let v = 0; v < varOrder.length; v++) {
            let n = bdd; while (!n.isTerminal) n = (n.varIdx === v) ? n.high : n.low;
            if (n.value !== true) continue;
            const meta = varMeta[v] || {};
            if (meta.type === 'group') continue;
            const node = meta.node || varOrder[v];
            const lid = node.logicalId != null ? node.logicalId : node.id;
            if (String(lid).indexOf('macsys:') === 0) continue;
            const key = 'lid:' + lid, name = (node.displayId ? node.displayId + ' — ' : '') + (node.name || '');
            const prob = node.probability || 0;
            const fp = name + '|' + (typeof prob === 'number' ? prob.toExponential(6) : String(prob));
            let row = found.get(key);
            if (!row) { row = { key, name, fingerprint: fp, severity: worst.severity, pages: [], fcIds: [] }; found.set(key, row); }
            if (rank(worst.severity) > rank(row.severity)) row.severity = worst.severity;
            if (row.pages.indexOf(page.name) < 0) row.pages.push(page.name);
            if (worst.fcId && row.fcIds.indexOf(worst.fcId) < 0) row.fcIds.push(worst.fcId);
        }
    });
    return Array.from(found.values()).sort((a, b) => (a.key < b.key ? -1 : 1)).map(r => [r.key, r.name, r.fingerprint, r.severity, r.pages, r.fcIds]);
}
{
    const pages = [];
    for (let s = 1; s <= 12; s++) {
        const root = s % 3 === 0 ? gate('OR', [be(1e-5), gate('AND', [be(1e-3), be(1e-3)])]) : randomTree(100 + s);
        pages.push({ id: 'pg' + s, name: 'Tree ' + s, root, linkedFhaId: s });
        p.acFhaData.push({ internalId: s, fcId: 'FC-' + s, severity: s % 2 ? 'Catastrophic' : 'Hazardous' });
    }
    p.acFhaData.push({ internalId: 99, fcId: 'FC-99', severity: 'Major' });
    pages.push({ id: 'pgM', name: 'Major tree', root: gate('OR', [be(0.1)]), linkedFhaId: 99 });
    vm.runInContext('ftaPages = globalThis.ftaPages; acFhaData = globalThis.acFhaData;', p);
    pages.forEach(x => p.ftaPages.push(x));
    const cur = () => JSON.stringify(p.mcSpfList().map(r => [r.key, r.name, r.fingerprint, r.severity, r.pages, r.fcIds]));
    const want = JSON.stringify(oldSpf());
    check('B: mcSpfList identical to the old algorithm', cur() === want && JSON.parse(want).length > 0, 'rows ' + JSON.parse(want).length);
    builds = 0; cur();
    check('B: a repeat does no BDD work (it rebuilt every Cat/Haz tree, twice per sweep)', builds === 0, 'builds=' + builds);
    const pg = p.ftaPages[2];
    pg.root.children[0].probability = 3e-5;
    builds = 0;
    const after = cur();
    check('B: a probability change is a miss (only that tree rebuilt) and matches the old algorithm', builds === 1 && after === JSON.stringify(oldSpf()), 'builds=' + builds);
    pg.root.children[0].name = 'Renamed event';
    check('B: a rename is a miss and the new name shows', cur().indexOf('Renamed event') !== -1 && cur() === JSON.stringify(oldSpf()));
    check('B: MC-01 and MC-02 still register', !!invs['MC-01'] && !!invs['MC-02']);
}

// ---- C. compromise flag keeps its timestamp ----------------------------------------------------
{
    const H = read('helpers_modules.js');
    const a = H.indexOf('// C1 (gap 5) — COMPROMISE CASCADE'), b = H.indexOf('_ipCache = { at: Date.now(), list };');
    const block = H.slice(a, b);
    check('C: cascade block found', a > 0 && b > a);
    const run = new Function('allReq', 'cmaData', 'list', block + '\n');
    const req = { id: 'R1' }, cma = { internalId: 5, linkedGateIds: ['pg:1'] };
    const P = [{ state: 'compromised', members: [{ label: 'A' }, { label: 'B' }], reqs: [req], gateGids: ['pg:1'], gateCompromised: true }];
    run([req], [cma], P);
    const at1 = req.ipCompromised && req.ipCompromised.at, cat1 = cma.ipCompromised && cma.ipCompromised.at;
    const t0 = Date.now(); while (Date.now() === t0) { /* next millisecond */ }
    run([req], [cma], P);
    check('C: an unchanged compromise keeps its first timestamp (no change → no save)', req.ipCompromised.at === at1 && cma.ipCompromised.at === cat1 && !!at1);
    P[0].gateCompromised = false; P[0].contradiction = true;
    run([req], [cma], P);
    check('C: a changed reason is a new flag', req.ipCompromised.why === 'CCF contradiction between members' && req.ipCompromised.at !== at1);
    P[0].state = 'verified';
    run([req], [cma], P);
    check('C: a healed principle clears the flag', !req.ipCompromised && !cma.ipCompromised);
}

// ---- D. contributor memo -------------------------------------------------------------------------
{
    const H = read('helpers_modules.js');
    const a = H.indexOf('function _idpCellKey'), b = H.indexOf('function renderInterdepPage');
    const st = {
        projectConfig: { interdep: { cells: {}, cra: {} } },
        systemsData: [
            { id: 's1', name: 'S1', functions: [{ funcId: 'f1', traceIds: ['SF-1'] }], fha: [] },
            { id: 's2', name: 'S2', functions: [{ funcId: 'f2', traceIds: ['SF-1'] }], fha: [] },
            { id: 's3', name: 'S3', functions: [{ funcId: 'f3', traceIds: ['SF-2'] }], fha: [] }],
        resourcesData: [], acFhaData: []
    };
    const I = new Function('projectConfig', 'systemsData', 'resourcesData', 'acFhaData', H.slice(a, b) + '\nreturn { idpIndexBatch, idpContributors };')(st.projectConfig, st.systemsData, st.resourcesData, st.acFhaData);
    const fc = { internalId: 1, fcId: 'FC-1', subId: 'SF-1' };
    const plain = () => JSON.stringify(I.idpContributors(fc));                 // lone call: no memo
    const batched = () => JSON.stringify(I.idpIndexBatch(() => I.idpContributors(fc)));
    check('D: batched (memo) answer equals the plain answer', batched() === plain() && plain() === '["s1","s2"]', plain());
    st.systemsData[2].functions[0].traceIds.push('SF-1');                       // in-place system edit
    check('D: an in-place SYSTEM edit is seen by the next batch', batched() === plain() && plain() === '["s1","s2","s3"]', batched());
    fc.subId = 'SF-2';                                                          // in-place FC edit
    check('D: an FC edit is seen', batched() === plain() && plain() === '["s3"]', batched());
    st.projectConfig.interdep.cells['1§s1'] = { state: 'asserted', by: 'W' };  // a cell for this FC
    check('D: a new interdependence cell is seen', batched() === plain() && plain().indexOf('s1') !== -1, batched());
    st.resourcesData.push({ resId: 'R', name: 'Bus', providedBy: ['s2'], consumedBy: ['SF-2'], consumedBySystems: [] });
    check('D: a new resource is seen', batched() === plain() && plain().indexOf('s2') !== -1, batched());
}

// ---- E. system directory written once ---------------------------------------------------------------
{
    const H = read('helpers_modules.js');
    const a = H.indexOf('function renderSystemDirectory()'), b = H.indexOf('function openSystemWorkspace', a);
    const body = H.slice(a, b);
    check('E: renderSystemDirectory builds one string and writes it once', a > 0 && !/^\s*grid\.innerHTML \+=/m.test(body) && /grid\.innerHTML = html;/.test(body));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

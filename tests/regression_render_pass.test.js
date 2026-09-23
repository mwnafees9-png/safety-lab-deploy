#!/usr/bin/env node
/*
 * Regression — render_pass.js: one read-only pass per dashboard render and per
 * project check (23 Sep 2026, perf round 4).
 *
 * Inside SLPass.run(...) repeated lookups are answered from indexes built once;
 * outside it everything behaves as before. Pinned here:
 *   P1  the API: pages() is null outside a pass; inside, a candidate list in
 *       page order that is a SUPERSET of every original predicate (so callers
 *       that keep their predicate get identical answers); rebuilt if the page
 *       list changes mid-pass; null keys defer to a full scan; nesting and
 *       exceptions close the pass; the pass opens an idpIndexBatch
 *   P2  EXECUTED with the real files: budgetLedgerRows (budget_ledger.js) and
 *       the invariant sweep (invariants.js) give identical results inside and
 *       outside a pass, on a fixture with links in both forms, mirrors, and
 *       AC <-> system traces; the old per-FC scans are reproduced verbatim as
 *       the reference for INV-02/INV-11 coverage
 *   P3  applyCockpitStatuses (misc_fn_modules.js) evaluates the checklists once
 *       per pass and writes the same statuses onto every caller's phases
 *   P4  GUARD: nothing derived from a fault tree's CONTENT is memoized per pass
 *       (the CCMR interval search changes leaf values mid-render and asks again)
 *   P5  wiring: updateDashboard, invRun and budgetLedgerRows run as passes
 * Run: node tests/regression_render_pass.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

function ctx(extra) {
    const c = Object.assign({ console, Math, JSON, Set, Map, WeakMap, WeakSet, Object, Array, String, Number, Date, Error, isFinite, parseFloat,
        setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, document: { readyState: 'complete', addEventListener() {}, getElementById: () => null } }, extra || {});
    c.window = c; c.globalThis = c;
    vm.createContext(c);
    return c;
}

// ---- P1 -------------------------------------------------------------------------------
{
    let batches = 0;
    const c = ctx({ idpIndexBatch: fn => { batches++; return fn(); } });
    vm.runInContext(read('render_pass.js'), c, { filename: 'render_pass.js' });
    vm.runInContext('var ftaPages = [];', c);
    const P = c.SLPass;
    const pages = [
        { id: 'p1', linkedFhaIds: [1, '2'], systemId: 's1' },
        { id: 'p2', linkedFhaId: 1 },
        { id: 'p3', linkedFhaIds: ['AC_3'], verifies: 'p1' },
        { id: 'p4', linkedFhaIds: [], linkedFhaId: 2, systemId: 's1' },
        { id: 'p5' }
    ];
    pages.forEach(p => c.ftaPages.push(p));
    check('P1: outside a pass pages() is null and memo() just computes', P.pages('link', 1) === null && P.memo('k', () => 7) === 7 && !P.active());
    let memoCalls = 0;
    const got = P.run('t', () => ({
        l1: P.pages('link', 1).map(p => p.id), l2: P.pages('link', '2').map(p => p.id),
        sys: P.pages('system', 's1').map(p => p.id), ver: P.pages('verifies', 'p1').map(p => p.id),
        none: P.pages('link', 99), nul: P.pages('link', undefined),
        m1: P.memo('x', () => ++memoCalls), m2: P.memo('x', () => ++memoCalls), act: P.active()
    }));
    check('P1: link candidates cover the array form and the scalar form, in page order, number and string keys alike',
        got.l1.join() === 'p1,p2' && got.l2.join() === 'p1,p4');
    check('P1: system and verifies candidates', got.sys.join() === 'p1,p4' && got.ver.join() === 'p3');
    check('P1: an unknown key gives no candidates; an undefined key defers to a full scan (null)', got.none.length === 0 && got.nul === null);
    check('P1: memo computes once per pass; the pass is active inside', memoCalls === 1 && got.m1 === 1 && got.m2 === 1 && got.act);
    check('P1: a pass opens one idpIndexBatch', batches === 1);
    check('P1: after the pass, nothing is remembered', P.pages('link', 1) === null && P.memo('x', () => 'fresh') === 'fresh');
    const grown = P.run('t', () => { P.pages('link', 1); c.ftaPages.push({ id: 'p6', linkedFhaId: 1 }); return P.pages('link', 1).map(p => p.id).join(); });
    check('P1: a page added mid-pass is seen (indexes rebuild when the page list changes)', grown === 'p1,p2,p6', grown);
    P.run('outer', () => { P.run('inner', () => 1); check('P1: nesting keeps the outer pass open', P.active()); });
    try { P.run('boom', () => { throw new Error('x'); }); } catch (_) {}
    check('P1: an exception still closes the pass', !P.active());
    // superset property on random pages with every predicate the callers use
    const r = (() => { let a = 7; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
    const vals = [1, 2, '1', '2', 3, 'x', null, undefined];
    const rnd = () => vals[Math.floor(r() * vals.length)];
    c.ftaPages.length = 0;
    for (let i = 0; i < 300; i++) {
        const p = { id: 'r' + i };
        if (r() < 0.6) p.linkedFhaIds = [rnd(), rnd()].filter(x => r() < 0.8);
        if (r() < 0.5) p.linkedFhaId = rnd();
        if (r() < 0.5) p.systemId = rnd();
        if (r() < 0.3) p.verifies = 'r' + Math.floor(r() * 300);
        c.ftaPages.push(p);
    }
    const preds = {
        strict: (p, k) => (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.indexOf(k) !== -1) || p.linkedFhaId === k,
        ledger: (p, k) => { const L = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId != null ? [p.linkedFhaId] : []); return L.map(String).indexOf(String(k)) !== -1; },
        system: (p, k) => p.systemId === k, verifies: (p, k) => p.verifies === k
    };
    let superset = true, why = '';
    P.run('t', () => {
        [1, 2, '1', '2', 3, 'x', 99].forEach(k => {
            [['strict', 'link'], ['ledger', 'link'], ['system', 'system']].forEach(([pn, kind]) => {
                const want = c.ftaPages.filter(p => preds[pn](p, k)).map(p => p.id).join();
                const gotc = (P.pages(kind, k) || c.ftaPages).filter(p => preds[pn](p, k)).map(p => p.id).join();
                if (want !== gotc) { superset = false; why = pn + ' key ' + k; }
            });
        });
        ['r5', 'r77', 'r299'].forEach(k => {
            const want = c.ftaPages.filter(p => preds.verifies(p, k)).map(p => p.id).join();
            const gotc = (P.pages('verifies', k) || c.ftaPages).filter(p => preds.verifies(p, k)).map(p => p.id).join();
            if (want !== gotc) { superset = false; why = 'verifies ' + k; }
        });
    });
    check('P1: candidates + the original predicate give the exact original answer (300 random pages, 4 predicates)', superset, why);
}

// ---- P2: budget ledger + invariants, executed ---------------------------------------------
function fixture() {
    const acFhaData = [], systemsData = [], ftaPages = [];
    for (let i = 1; i <= 30; i++) acFhaData.push({ internalId: i, fcId: 'FC-' + i, fcDesc: 'fc ' + i, severity: ['Catastrophic', 'Hazardous', 'Major'][i % 3] });
    for (let s = 1; s <= 4; s++) {
        const fha = [];
        for (let j = 1; j <= 6; j++) fha.push({ internalId: 1000 * s + j, fcId: 'S' + s + '-' + j, severity: ['Catastrophic', 'Hazardous', 'Minor'][j % 3],
            acTrace: (j % 2) ? ((s * j) % 30) + 1 : undefined, acTraces: (j % 3 === 0) ? [String(((s + j) % 30) + 1)] : undefined });
        systemsData.push({ id: 'sys' + s, name: 'System ' + s, fha, functions: [], req: [], asm: [] });
    }
    const leaf = p => ({ id: Math.random(), type: 'basic', probability: p, children: [] });
    for (let i = 1; i <= 30; i++) {
        if (i % 4 === 0) continue;
        const pg = { id: 'pg' + i, name: 'Tree ' + i, mode: 'top-down', root: { id: 'g' + i, type: 'gate', gateType: 'OR', children: [leaf(1e-6), leaf(2e-6)] } };
        if (i % 2) pg.linkedFhaIds = [i]; else pg.linkedFhaId = i;
        ftaPages.push(pg);
        if (i % 3 === 0) ftaPages.push({ id: 'mir' + i, name: 'Mirror ' + i, verifies: 'pg' + i, root: { id: 'm' + i, type: 'gate', gateType: 'OR', children: [leaf(5e-7)] } });
    }
    ftaPages.push({ id: 'sp1', name: 'Sys tree', systemId: 'sys1', linkedFhaIds: ['SYS_1001', 1002], root: { id: 'sg', type: 'gate', gateType: 'AND', children: [leaf(1e-3), leaf(1e-3)] } });
    return { acFhaData, systemsData, ftaPages };
}
{
    const F = fixture();
    const c = ctx({ projectConfig: {}, acFhaData: F.acFhaData, systemsData: F.systemsData, SEVERITY_RANK: { Minor: 1, Major: 2, Hazardous: 4, Catastrophic: 5 },
        getSafetyTarget: s => ({ prob: s === 'Catastrophic' ? 1e-9 : 1e-7 }), computeExactProbability: r => ({ prob: r.children.reduce((a, n) => a + (n.probability || 0), 0) }),
        idpIndexBatch: fn => fn() });
    vm.runInContext('var ftaPages = [];', c);
    F.ftaPages.forEach(p => c.ftaPages.push(p));
    vm.runInContext(read('render_pass.js'), c, { filename: 'render_pass.js' });
    let loadErr = null;
    for (const f of ['budget_ledger.js', 'invariants.js']) { try { vm.runInContext(read(f), c, { filename: f }); } catch (e) { loadErr = f + ': ' + e.message; } }
    check('P2: budget_ledger.js and invariants.js load in the harness', !loadErr, loadErr);
    const strip = o => JSON.stringify(o, (k, v) => (k === 'at' ? undefined : v));
    const out1 = strip(c.budgetLedgerRows());
    // force the non-pass path by hiding SLPass
    const saved = c.SLPass; c.SLPass = undefined;
    const out0 = strip(c.budgetLedgerRows());
    c.SLPass = saved;
    check('P2: budget ledger rows identical with and without the pass', out1 === out0 && JSON.parse(out0).length > 20, JSON.parse(out0).length + ' rows');
    const inv1 = strip(c.invRun());
    c.SLPass = undefined; const inv0 = strip(c.invRun()); c.SLPass = saved;
    check('P2: the whole invariant sweep is identical with and without the pass', inv1 === inv0);
    // reference: the ORIGINAL per-FC coverage scan, verbatim
    const pageIds = p => { const ids = Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds.slice() : []; if (p.linkedFhaId != null) ids.push(p.linkedFhaId); return ids.map(x => String(x).replace(/^(AC_|SYS_)/, '')); };
    const acTr = f => { const ids = Array.isArray(f.acTraces) ? f.acTraces.slice() : []; if (f.acTrace != null) ids.push(f.acTrace); return ids.map(String); };
    const oldCovered = f => {
        const linked = new Set(); c.ftaPages.forEach(p => { if (p && p.root && !p.verifies) pageIds(p).forEach(id => linked.add(String(id))); });
        const sys = F.systemsData.find(s => (s.fha || []).indexOf(f) >= 0) || null;
        const out = [String(f.internalId)];
        if (sys) acTr(f).forEach(id => out.push(id));
        else F.systemsData.forEach(s => (s.fha || []).forEach(sf => { if (sf && acTr(sf).indexOf(String(f.internalId)) >= 0) out.push(String(sf.internalId)); }));
        return out.some(id => linked.has(id));
    };
    const all = F.acFhaData.map(f => ({ f, scope: 'AC' })).concat(F.systemsData.flatMap(s => s.fha.map(f => ({ f, scope: s.name }))));
    const want02 = all.filter(({ f }) => f.severity === 'Catastrophic' && !oldCovered(f)).length;
    const want11 = all.filter(({ f }) => f.severity === 'Hazardous' && !oldCovered(f)).length;
    const res = JSON.parse(inv1).results;
    const r02 = res.find(r => r.id === 'INV-02'), r11 = res.find(r => r.id === 'INV-11');
    check('P2: INV-02 / INV-11 coverage equals the original per-FC scan (reproduced verbatim)', r02 && r11 && r02.failCount === want02 && r11.failCount === want11 && want02 + want11 > 0,
        JSON.stringify({ got: [r02 && r02.failCount, r11 && r11.failCount], want: [want02, want11] }));
}

// ---- P3: checklist evaluation once per pass --------------------------------------------------
{
    const M = read('misc_fn_modules.js');
    const a = M.indexOf('const _CKPT_APPLIED_FIELDS'), b = M.indexOf('\n}\n', M.indexOf('function _applyCockpitStatusesImpl(phases)')) + 3;
    check('P3: the checklist block extracts', a > 0 && b > a);
    let evals = 0;
    const c = ctx({ projectConfig: { ckptHandoffs: {} } });
    vm.runInContext(read('render_pass.js'), c);
    c.CKPT_CHECKLISTS = { A: 1, B: 1 };
    c._ckptEvalCtx = () => ({});
    c.evalCkptChecklist = (key) => { evals++; return { items: [], ready: key === 'A' }; };
    c._ckptFingerprint = () => 'x';
    c.computePhaseStatus = () => ({ A: { status: 'in-progress', ratio: 0.5 }, B: { status: 'not-started', ratio: 0 } });
    vm.runInContext(M.slice(a, b) + '\nthis.applyCockpitStatuses = applyCockpitStatuses;', c);
    const outside1 = c.applyCockpitStatuses(c.computePhaseStatus()), e0 = evals;
    evals = 0;
    const res = c.SLPass.run('t', () => {
        const p1 = c.computePhaseStatus(); c.applyCockpitStatuses(p1);
        const p2 = c.applyCockpitStatuses(c.computePhaseStatus());
        return [p1, p2];
    });
    check('P3: inside a pass the checklists are evaluated once for two callers', evals === e0 && e0 === 2, 'evals=' + evals);
    check('P3: both callers get exactly the statuses a normal evaluation gives', JSON.stringify(res[0]) === JSON.stringify(outside1) && JSON.stringify(res[1]) === JSON.stringify(outside1));
}

// ---- P4 / P5 -------------------------------------------------------------------------------------
{
    const Q = read('fta_quant_modules.js'), RP = read('render_pass.js');
    const keyFn = Q.slice(Q.indexOf('function _ptopKey('), Q.indexOf('\n}\n', Q.indexOf('function _ptopKey(')));
    check('P4: the tree content key is always walked from the tree as it is now (no pass memo)', keyFn.length > 0 && !/SLPass/.test(keyFn) && !/objMemo/.test(RP));
    const H = read('helpers_modules.js'), I = read('invariants.js'), B = read('budget_ledger.js');
    check('P5: updateDashboard runs as a pass', /function updateDashboard\(\) \{\n    return \(typeof SLPass !== 'undefined' && SLPass\) \? SLPass\.run\('updateDashboard', _updateDashboardImpl\)/.test(H));
    check('P5: invRun runs as a pass', /function invRun\(\) \{\n        return \(typeof SLPass !== 'undefined' && SLPass\) \? SLPass\.run\('invRun', _invRunImpl\)/.test(I));
    check('P5: budgetLedgerRows runs as a pass', /SLPass\.run\('budgetLedgerRows', _budgetLedgerRowsImpl\)/.test(B));
    const idx = read('index.html');
    check('P5: render_pass.js is loaded (after data_change.js)', idx.indexOf('render_pass.js?v=') > idx.indexOf('data_change.js?v=') && idx.indexOf('data_change.js?v=') > 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

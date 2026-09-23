#!/usr/bin/env node
/*
 * Regression — perf fix 1 (23 Sep 2026): coupled Cat/Haz candidates.
 *
 * combinationCandidates() (fc_variants.js) was all-pairs over Cat/Haz FCs and
 * re-derived each FC's implementing systems inside the inner loop; a large
 * project hung the FHA tab, and the panel rendered every pair. Now:
 *   · each FC's systems are derived ONCE, a system -> FC index yields only
 *     pairs that really share a system, and the OUTPUT IS IDENTICAL to the old
 *     algorithm (pairs, order, shared list, disposition) — pinned here against
 *     a verbatim copy of the old code on randomized projects;
 *   · the panel shows undispositioned pairs first, 50 at a time, with
 *     "show more"; the counts and INV-30 still cover ALL pairs.
 * Run: node tests/regression_perf_fcv_candidates.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const H = S('helpers_modules.js');
const FCV = S('fc_variants.js');

// ---- sandbox: the real idp logic + the real fc_variants.js ------------------------------------
function makeWorld(state) {
    let host = null;
    const view = { appendChild(el) { host = el; } };
    const invs = {};
    const sb = {
        console, Math, JSON, Set, Map, Object, Array, String, Number, Date, Error,
        setInterval: () => 0, clearInterval() {}, setTimeout: () => 0,
        SEVERITY_RANK: { 'No Safety Effect': 0, Minor: 1, Major: 2, Hazardous: 3, Catastrophic: 4 },
        document: {
            readyState: 'complete', addEventListener() {},
            getElementById: id => id === 'view-ac-fha' ? view : (id === 'fcv-panel' ? host : null),
            createElement: () => ({ style: {}, innerHTML: '' })
        },
        projectConfig: state.projectConfig, systemsData: state.systemsData, resourcesData: [], acFhaData: state.acFhaData
    };
    sb.window = sb;
    sb.invRegister = inv => { invs[inv.id] = inv; };
    vm.createContext(sb);
    const a = H.indexOf('function _idpCellKey'), b = H.indexOf('function renderInterdepPage');
    vm.runInContext(H.slice(a, b), sb, { filename: 'helpers_modules.js(idp)' });
    vm.runInContext(FCV, sb, { filename: 'fc_variants.js' });
    return { sb, invs, html: () => (host ? host.innerHTML : '') };
}

// ---- the OLD algorithm, verbatim (the reference) ----------------------------------------------
function oldCandidates(sb) {
    const _fha = () => sb.acFhaData, _isCatHaz = s => /catastrophic|hazardous/i.test(String(s || ''));
    const _pairKey = (a, b) => [String(a), String(b)].sort().join('∧');
    const _subsOf = f => [f.subId].concat(Array.isArray(f.subIds) ? f.subIds : []).filter(Boolean);
    const _disp = () => { const pc = sb.projectConfig; if (!pc.fcCombDispositions) pc.fcCombDispositions = {}; return pc.fcCombDispositions; };
    function _implSystems(f) { const set = new Set(); _subsOf(f).forEach(su => { try { sb._idpSystemsImplementing(su).forEach(id => set.add(id)); } catch (_) {} }); return set; }
    const rows = _fha().filter(f => f && !f.deleted && _isCatHaz(f.severity) && !(f.combinedOf && f.combinedOf.length));
    const covered = new Set();
    _fha().forEach(f => { if (f && Array.isArray(f.combinedOf) && f.combinedOf.length >= 2) for (let i = 0; i < f.combinedOf.length; i++) for (let j = i + 1; j < f.combinedOf.length; j++) covered.add(_pairKey(f.combinedOf[i], f.combinedOf[j])); });
    const disp = _disp(), out = [];
    for (let i = 0; i < rows.length; i++) {
        const si = _implSystems(rows[i]); if (!si.size) continue;
        for (let j = i + 1; j < rows.length; j++) {
            const a = rows[i], b = rows[j];
            if (_subsOf(a).some(s => _subsOf(b).indexOf(s) !== -1)) continue;
            const shared = [..._implSystems(b)].filter(x => si.has(x)); if (!shared.length) continue;
            const key = _pairKey(a.fcId, b.fcId); if (covered.has(key)) continue;
            out.push({ a, b, key, shared, disposition: disp[key] || null });
        }
    }
    return out;
}
const sig = list => JSON.stringify(list.map(c => [c.a.fcId, c.b.fcId, c.key, c.shared, c.disposition]));

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function project(seed, nFc, nSys, nSub) {
    const r = rng(seed), SEV = ['Catastrophic', 'Hazardous', 'Major', 'Minor', 'Hazardous'];
    const subs = Array.from({ length: nSub }, (_, i) => 'SF-' + i);
    const systemsData = Array.from({ length: nSys }, (_, i) => ({ id: 'S' + i, name: 's' + i, fha: [],
        functions: Array.from({ length: 1 + Math.floor(r() * 3) }, (_, k) => ({ funcId: 'F' + i + k, traceIds: [subs[Math.floor(r() * nSub)]] })) }));
    const acFhaData = Array.from({ length: nFc }, (_, i) => {
        const f = { internalId: i + 1, fcId: 'FC-' + i, subId: subs[Math.floor(r() * nSub)], severity: SEV[Math.floor(r() * SEV.length)] };
        if (r() < 0.15) f.subIds = [subs[Math.floor(r() * nSub)]];
        if (r() < 0.05) f.deleted = true;
        return f;
    });
    // a combined FC covering one pair, plus a dispositioned pair
    acFhaData.push({ internalId: 9999, fcId: 'FC-C', subId: 'SF-0', severity: 'Catastrophic', combinedOf: ['FC-0', 'FC-1', 'FC-2'] });
    const projectConfig = { interdep: { cells: {}, cra: {} }, fcCombDispositions: { ['FC-3∧FC-4']: { by: 'W', note: 'n' } } };
    return { projectConfig, systemsData, acFhaData };
}

// ---- 1. identical output ------------------------------------------------------------------------
let same = true, why = '';
for (let seed = 1; seed <= 12 && same; seed++) {
    const W = makeWorld(project(seed, 60 + seed * 5, 8 + seed, 10 + seed));
    const got = W.sb.fcvCandidates(), want = oldCandidates(W.sb);
    if (sig(got) !== sig(want)) { same = false; why = 'seed ' + seed + ' got ' + got.length + ' want ' + want.length; }
    else if (seed === 1 && !want.length) { same = false; why = 'fixture produced no pairs — the comparison would be vacuous'; }
}
check('identical to the old algorithm on 12 randomized projects (pairs, order, shared list, disposition)', same, why);

// ---- 2. complexity: systems derived once per FC, not once per pair ---------------------------------
{
    const W = makeWorld(project(77, 800, 400, 400));
    let calls = 0;
    const real = W.sb._idpSystemsImplementing;
    W.sb._idpSystemsImplementing = function (s) { calls++; return real(s); };
    W.sb.systemsData[0].functions.push({ funcId: 'FORCE', traceIds: ['SF-FORCE'] });   // a relevant change: the search must run
    const t0 = Date.now();
    const n = W.sb.fcvCandidates().length;
    const ms = Date.now() - t0;
    const catHaz = W.sb.acFhaData.filter(f => /catastrophic|hazardous/i.test(f.severity)).length;
    check('one _idpSystemsImplementing call per FC sub-function (linear, not per pair)', calls > 0 && calls <= catHaz * 2 + 5, 'calls=' + calls + ' catHaz=' + catHaz);
    check('800 FCs x 400 systems completes quickly', ms < 2000, ms + 'ms, ' + n + ' pairs');
}

// ---- 3. paginated render, counts and INV-30 over ALL pairs ------------------------------------------
{
    // every Cat/Haz FC on its own sub, all implemented by ONE system → n(n-1)/2 pairs
    const n = 20;
    const W = makeWorld({
        projectConfig: { interdep: { cells: {}, cra: {} }, fcCombDispositions: { ['FC-0∧FC-1']: { by: 'W', note: 'fine' } } },
        systemsData: [{ id: 'HUB', name: 'hub', fha: [], functions: Array.from({ length: n }, (_, i) => ({ funcId: 'H' + i, traceIds: ['SF-' + i] })) }],
        acFhaData: Array.from({ length: n }, (_, i) => ({ internalId: i + 1, fcId: 'FC-' + i, subId: 'SF-' + i, severity: 'Catastrophic' }))
    });
    const total = n * (n - 1) / 2, open = total - 1;
    W.sb._renderFcVariants();
    let h = W.html();
    const rows = (h.match(/fcvCombine\('FC-/g) || []).length + (h.match(/>clear<\/a>/g) || []).length;
    check('renders 50 pairs, not all ' + total, rows === 50, 'rows=' + rows);
    check('the header count still covers ALL undispositioned pairs', h.indexOf('<strong>' + open + '</strong> coupled Cat/Haz pair(s) undispositioned') !== -1);
    check('says how many are shown and offers "show more"', /showing 50 of 190, undispositioned first/.test(h) && /fcvShowMore\(\)/.test(h) && /Show 50 more \(140 not shown\)/.test(h));
    check('undispositioned pairs come first (the dispositioned one is not on page 1)', h.indexOf('✍ W') === -1);
    W.sb.fcvShowMore(); W.sb.fcvShowMore(); W.sb.fcvShowMore();
    h = W.html();
    const rows2 = (h.match(/fcvCombine\('FC-/g) || []).length + (h.match(/>clear<\/a>/g) || []).length;
    check('"show more" extends the list to all ' + total + ' and the dispositioned pair appears last',
        rows2 === total && !/fcvShowMore\(\)/.test(h) && h.lastIndexOf('fcvCombine(') < h.indexOf('✍ W'), 'rows=' + rows2);
    const inv = W.invs['INV-30'] && W.invs['INV-30'].run();
    check('INV-30 still checks and COUNTS every pair (failCount), with sample messages for the first ones', inv && inv.checked === total && inv.failCount === open && inv.fails.length === Math.min(open, 20) && /FC-\d+ \+ FC-\d+ share implementing system\(s\) HUB/.test(inv.fails[0]), JSON.stringify(inv && { c: inv.checked, n: inv.failCount, f: inv.fails.length }));
}

// ---- 4. the remembered pair list: hits only when every input is unchanged ------------------------
{
    const W = makeWorld(project(5, 120, 14, 16));
    let calls = 0;
    const real = W.sb._idpSystemsImplementing;
    W.sb._idpSystemsImplementing = function (s) { calls++; return real(s); };
    const base = sig(W.sb.fcvCandidates());
    calls = 0;
    const same = (name, mutate) => {
        mutate(); calls = 0;
        const got = W.sb.fcvCandidates();
        check('memo HIT after ' + name + ' (no search) and the output still matches the old algorithm', calls === 0 && sig(got) === sig(oldCandidates(W.sb)), 'calls=' + calls);
    };
    const miss = (name, mutate) => {
        mutate(); calls = 0;
        const got = W.sb.fcvCandidates();
        check('memo MISS after ' + name + ' and the output matches the old algorithm', calls > 0 && sig(got) === sig(oldCandidates(W.sb)), 'calls=' + calls);
    };
    const catHaz = () => W.sb.acFhaData.find(f => /catastrophic|hazardous/i.test(f.severity) && !f.deleted && !f.combinedOf);
    same('an effect/description edit', () => { W.sb.acFhaData[0].fcDesc = 'changed text'; W.sb.acFhaData[0].effAc = 'x'; });
    same('Major -> Minor on a non-Cat/Haz row', () => { const f = W.sb.acFhaData.find(x => x.severity === 'Major'); if (f) f.severity = 'Minor'; });
    same('Catastrophic -> Hazardous (still eligible)', () => { const f = W.sb.acFhaData.find(x => x.severity === 'Catastrophic' && !x.combinedOf); if (f) f.severity = 'Hazardous'; });
    miss('a Cat/Haz row demoted to Major', () => { catHaz().severity = 'Major'; });
    miss('a row deleted', () => { catHaz().deleted = true; });
    miss('a sub-function changed', () => { catHaz().subId = 'SF-3'; });
    miss('an extra sub-function added', () => { catHaz().subIds = ['SF-5']; });
    miss('an fcId renamed', () => { catHaz().fcId = 'FC-RENAMED'; });
    miss('a system function trace changed', () => { W.sb.systemsData[2].functions[0].traceIds = W.sb.systemsData[2].functions[0].traceIds.concat(['SF-1']); });
    miss('a legacy single trace added', () => { W.sb.systemsData[3].functions.push({ funcId: 'L', traceId: 'SF-2' }); });
    miss('a system id changed', () => { W.sb.systemsData[4].id = 'S-NEW'; });
    miss('a combined FC added (covers a pair)', () => { const c = W.sb.fcvCandidates()[0]; W.sb.acFhaData.push({ internalId: 7777, fcId: 'FC-CC', subId: 'SF-9', severity: 'Catastrophic', combinedOf: [c.a.fcId, c.b.fcId] }); });
    miss('the FHA replaced by a copy with a new row', () => { W.sb.acFhaData = W.sb.acFhaData.concat([{ internalId: 8888, fcId: 'FC-NEW', subId: 'SF-1', severity: 'Hazardous' }]); vm.runInContext('acFhaData = window.acFhaData', W.sb); });
    // dispositions are live, never remembered
    const c0 = W.sb.fcvCandidates()[0];
    W.sb.projectConfig.fcCombDispositions[c0.key] = { by: 'W', note: 'live' };
    calls = 0;
    const c1 = W.sb.fcvCandidates().find(c => c.key === c0.key);
    check('a new disposition shows immediately without re-running the search', calls === 0 && c1 && c1.disposition && c1.disposition.note === 'live');
    check('returned objects are the CURRENT rows (never objects from an older search)', c1 && W.sb.acFhaData.indexOf(c1.a) !== -1 && W.sb.acFhaData.indexOf(c1.b) !== -1);
    void base;
}

check('the renderACFHA wrapper and lazy skip are intact', /_fcvWrapped/.test(FCV) && /SLLazy\.skipped\('ac-fha-body'\)/.test(FCV));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

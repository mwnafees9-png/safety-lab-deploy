#!/usr/bin/env node
/*
 * Regression — perf fix 2 (23 Sep 2026): the MF&MS seed sweep is change-driven.
 *
 * idp_seed_trees.js swept every FC x system every 8 s whether or not anything
 * moved (a multi-second stall every 8 s on a large project). tick() now sweeps
 * only when the project data changed, per the shared detector data_change.js
 * (the real file is loaded here):
 *   · an EDIT — every edit reaches scheduleAutosave;
 *   · a REPLACEMENT — a load or undo assigns new store objects.
 * The sweep's own save does not re-dirty it; boot is dirty; the kill switch
 * still holds; the sweep runs inside one idpIndexBatch.
 * Run: node tests/regression_perf_idp_sweep.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'idp_seed_trees.js'), 'utf8');
const DC = fs.readFileSync(path.join(__dirname, '..', 'site', 'data_change.js'), 'utf8');

let contribCalls = 0, saves = 0, batches = 0;
const CONTRIB = { 101: ['sysA', 'sysB'] };
const intervals = [];
const sb = {
    console, Math, JSON, Set, Map, Object, Array, String, Number, Date, Error,
    setTimeout: () => 0, setInterval: (fn, ms) => { intervals.push({ fn, ms }); return 1; },
    document: { readyState: 'complete', addEventListener() {} },
    internalIdCounter: 1,
    acFhaData: [{ internalId: 101, fcId: 'FC-1', fcDesc: 'x' }, { internalId: 102, fcId: 'FC-2', fcDesc: 'y' }],
    systemsData: [{ id: 'sysA', name: 'A', fha: [] }, { id: 'sysB', name: 'B', fha: [] }],
    resourcesData: [],
    projectConfig: { interdep: { cells: {} } },
    ftaPages: [],
    idpContributors: fc => { contribCalls++; return (CONTRIB[fc.internalId] || []).slice(); },
    idpIndexBatch: fn => { batches++; return fn(); },
    renderFTASidebar() {}
};
sb.window = sb;
sb.scheduleAutosave = function () { saves++; };
vm.createContext(sb);
vm.runInContext(DC, sb, { filename: 'data_change.js' });       // index.html order: data_change before idp_seed_trees
vm.runInContext(SRC, sb, { filename: 'idp_seed_trees.js' });
const IDP = sb.SL_IDP;
const tick = () => { contribCalls = 0; const r = IDP.tick(); return { r, calls: contribCalls }; };

check('exposes tick/markDirty next to run/status', IDP && typeof IDP.tick === 'function' && typeof IDP.markDirty === 'function' && typeof IDP.run === 'function');
check('the timer drives tick(), never run() directly', intervals.length === 1 && /tick\(\)/.test(String(intervals[0].fn)) && !/\brun\(\)/.test(String(intervals[0].fn)));

let t = tick();
check('boot: the first tick sweeps (and seeds)', t.calls === 2 && !t.r.skipped && t.r.seeded === 1, JSON.stringify(t));
check('the sweep runs inside one index batch', batches === 1);
t = tick();
check('the sweep\'s own save did not re-dirty it: next tick is a no-op', t.r.skipped === true && t.calls === 0, JSON.stringify(t));
t = tick();
check('nothing changed → still a no-op', t.r.skipped === true && t.calls === 0);

// an edit: every edit path goes through scheduleAutosave (commitSaveChanges is built on it)
sb.acFhaData[1].fcDesc = 'edited in place';
sb.scheduleAutosave();
check('the save wrapper still calls the real save', saves >= 2);
t = tick();
check('after an edit (scheduleAutosave) the next tick sweeps', !t.r.skipped && t.calls === 2, JSON.stringify(t));
check('…then goes quiet again', tick().r.skipped === true);

// replacements: project load / sync pull / undo assign new store objects
const REPL = [
    ['acFhaData', () => { sb.acFhaData = sb.acFhaData.slice(); }],
    ['systemsData', () => { sb.systemsData = sb.systemsData.slice(); }],
    ['resourcesData', () => { sb.resourcesData = []; }],
    ['projectConfig', () => { sb.projectConfig = { interdep: { cells: {} } }; }],
    ['projectConfig.interdep', () => { sb.projectConfig.interdep = { cells: {} }; }],
    ['ftaPages', () => { sb.ftaPages = sb.ftaPages.slice(); }]
];
REPL.forEach(([name, fn]) => {
    fn();
    const a = tick(), b = tick();
    check('a replaced ' + name + ' triggers exactly one sweep', !a.r.skipped && a.calls > 0 && b.r.skipped === true, JSON.stringify([a, b]));
});

// markDirty is public for modules that change inputs without a save
IDP.markDirty();
check('markDirty() forces the next sweep', !tick().r.skipped);

// kill switch
sb.SL_IDP_SEED_OFF = true; IDP.markDirty();
check('the kill switch still disables the sweep', tick().r.off === true);
sb.SL_IDP_SEED_OFF = false;

// run() remains the one deterministic sweep (regression_idp_seed pins its lifecycle)
check('run() is unchanged and still callable directly', typeof IDP.run().kept === 'number');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

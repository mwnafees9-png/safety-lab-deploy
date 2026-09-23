#!/usr/bin/env node
/*
 * Regression — data_change.js (23 Sep 2026, perf round 2): the one shared
 * "has the project data changed since I last looked?" detector that the
 * background sweeps (MF&MS seeds, FTA proposals) use instead of blind timers.
 *
 * Pins: an edit (scheduleAutosave, through any later wrapper chain) bumps the
 * generation; replacing any synced store bumps it; nothing changing leaves it
 * still; the save hook is installed ONCE (no wrapper pile-up when other
 * modules wrap scheduleAutosave over it) and passes the return value through
 * (save_watch.js relies on `=== true`); the file is wired in index.html right
 * after save_watch.js and before both sweeps; both sweeps use it.
 * Run: node tests/regression_data_change.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

let saves = 0;
const sb = { console, Object, Array, JSON, document: {}, acFhaData: [], systemsData: [], ftaPages: [], resourcesData: [],
    projectConfig: { interdep: { cells: {} } } };
sb.window = sb;
sb.scheduleAutosave = function () { saves++; return true; };
vm.createContext(sb);
vm.runInContext(S('data_change.js'), sb, { filename: 'data_change.js' });
const DC = sb.SLDataChange;

check('exposes gen/bump', DC && typeof DC.gen === 'function' && typeof DC.bump === 'function');
const g0 = DC.gen();
check('nothing changed → same generation', DC.gen() === g0 && DC.gen() === g0);
check('the save hook passes the return value through (save_watch needs === true)', sb.scheduleAutosave() === true && saves === 1);
const g1 = DC.gen();
check('an edit (scheduleAutosave) bumps the generation', g1 > g0);

// another module wraps over ours later (lock_enforce / rename_guard pattern)
const inner = sb.scheduleAutosave;
sb.scheduleAutosave = function () { return inner.apply(this, arguments); };
const g2 = DC.gen();
sb.scheduleAutosave();
const g3 = DC.gen();
check('a save through a later wrapper still bumps exactly once (hook installed once, no pile-up)', g3 === g2 + 1, g2 + ' -> ' + g3);

[['acFhaData', () => { sb.acFhaData = []; }], ['systemsData', () => { sb.systemsData = []; }], ['ftaPages', () => { sb.ftaPages = []; }],
 ['resourcesData', () => { sb.resourcesData = []; }], ['projectConfig', () => { sb.projectConfig = { interdep: {} }; }],
 ['projectConfig.interdep', () => { sb.projectConfig.interdep = {}; }]].forEach(([n, fn]) => {
    const a = DC.gen(); fn(); const b = DC.gen(); const c = DC.gen();
    check('replacing ' + n + ' bumps once', b === a + 1 && c === b);
});

const idx = S('index.html');
const at = f => idx.indexOf(f + '?v=');
check('wired after save_watch.js and misc_fn_modules.js (scheduleAutosave exists), before both sweeps',
    at('data_change.js') > at('save_watch.js') && at('data_change.js') > at('misc_fn_modules.js') &&
    at('data_change.js') < at('idp_seed_trees.js') && at('data_change.js') < at('fta_proposals.js') && at('save_watch.js') > 0);
check('the seed sweep uses it', /SLDataChange/.test(S('idp_seed_trees.js')) && !/setInterval\(_tick, 8000\);[\s\S]*run\(\)/.test(''));
check('the FTA proposals sweep uses it', /SLDataChange/.test(S('fta_proposals.js')));
check('the proposals sweep builds the ledger once per sweep, not per finding', !/forEach\(function \(f\) \{\s*var p = _ledger\(\)/.test(S('fta_proposals.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

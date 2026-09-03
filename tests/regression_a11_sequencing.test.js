#!/usr/bin/env node
/*
 * Regression — A11: agentic sequencing over the ARP4761A workflow (3 Aug 2026).
 *
 * The design under pin: the PLAN IS DATA (hard-coded from the standard — the
 * model never plans), every step invokes the EXISTING launcher lane through
 * SafetyLabAI.launcherActions() (same run fn, same accept gate), statuses are
 * PURE STORE READS (a step is done because its artifacts exist, never because
 * it was "run"), advisory lanes are never auto-advanced, and the module adds
 * ZERO write paths of its own.
 *
 * HANDOFF §7.3: order/membership assertions, never index or count literals —
 * the sequence will grow (STPA, contingency phases, deep-read items).
 *
 * Run: node tests/regression_a11_sequencing.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'a11_sequencing.js'), 'utf8');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const loader = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');

// ---- load the module in vm with a controllable world ------------------------
// The world builder reproduces the BROWSER'S SCOPING exactly: the app's stores
// are top-level let declarations — bare-accessible across classic scripts but
// NOT on window. Seeding them as context properties would hide the exact bug
// this suite exists to pin (caught live: 46 FCIM rows reading as "ready"
// because the module used window[name]). Stores go in via a `let` prelude;
// window-attached surfaces (PROGRAM_PLAN, rgScan, invRun, Review) via opts.win.
function world(opts) {
    opts = opts || {};
    // legacy call shape: bare store overrides at the top level
    const storeKeys = ['acFunctionsData', 'acFcimData', 'acFhaData', 'praData', 'zsaData', 'cmaData', 'fmeaData', 'ftaPages'];
    const stores = Object.assign(
        { acFunctionsData: [], acFcimData: [], acFhaData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], ftaPages: [] },
        opts.stores || {});
    const win = Object.assign({}, opts.win || {});
    Object.keys(opts).forEach(k => {
        if (storeKeys.includes(k)) stores[k] = opts[k];
        else if (!['stores', 'win'].includes(k)) win[k] = opts[k];
    });
    const sb = Object.assign({
        console, Array, String, Promise, JSON, Math, Date, setInterval: () => 1, clearInterval: () => {},
        document: { getElementById: () => null, createElement: () => ({ style: {}, addEventListener: () => {} }), body: { appendChild: () => {} } }
    }, win);
    sb.window = sb;
    vm.createContext(sb);
    const prelude = 'let projectConfig = {};\n' +
        Object.keys(stores).map(k => 'let ' + k + ' = ' + JSON.stringify(stores[k]) + ';').join('\n');
    vm.runInContext(prelude, sb);      // global LEXICAL scope — not on sb/window
    vm.runInContext(src, sb);
    sb.__storesOnWindow = storeKeys.some(k => sb[k] !== undefined);
    return sb;
}

// ---- [1] the plan is data, in the standard's order --------------------------
console.log('\n[a11] the plan');
const w = world();
const seq = w.A11_DESK._seq;
const ids = seq.map(s => s.id);
const before = (a, b) => ids.indexOf(a) >= 0 && ids.indexOf(b) >= 0 && ids.indexOf(a) < ids.indexOf(b);
check('the sequence exists as data with stable ids', Array.isArray(seq) && ids.includes('fcim') && ids.includes('afha'));
check('standard order: functions → FCIM → FHA → trees (§7.3: relative order, not indexes)',
  before('functions', 'fcim') && before('fcim', 'afha') && before('afha', 'trees'));
check('the parallel CCA track follows the thread: trees before PRA/ZSA/CMA',
  before('trees', 'pra') && before('trees', 'zsa') && before('trees', 'cma'));
check('every step names its clause anchor', seq.every(s => typeof s.std === 'string' && s.std.length > 0));
check('every step binds to a lane by LAUNCHER LABEL (the single source of truth)',
  seq.every(s => typeof s.launcherLabel === 'string' && s.launcherLabel.length > 3));
check('the launcher actually offers every bound label',
  seq.every(s => ai.includes("label: '" + s.launcherLabel + "'")),
  seq.filter(s => !ai.includes("label: '" + s.launcherLabel + "'")).map(s => s.launcherLabel).join(', '));
check('advisory lanes carry NO doneWhen (never auto-advanced): tree review, requirements, HF, comments, doc review',
  ['treeReview', 'requirements', 'hf', 'comments', 'docReview'].every(id => { const s = seq.find(x => x.id === id); return s && s.doneWhen == null; }));

// ---- [2] statuses are pure store reads, executed ----------------------------
console.log('\n[a11] statuses, executed');
check('empty store → READY (not done, nothing remembered)',
  w.A11_DESK._stateOf(seq.find(s => s.id === 'fcim')) === 'ready');
const w2 = world({ acFcimData: [{ subId: 'SF-01' }], ftaPages: [{ root: { id: 1 } }] });
check('THE HARNESS ITSELF reproduces browser let-scoping — stores are NOT on window',
  w2.__storesOnWindow === false,
  'if stores land on window the harness can no longer catch the window[name] bug class');
check('seeded store → DONE, purely from the artifacts existing',
  w2.A11_DESK._stateOf(w2.A11_DESK._seq.find(s => s.id === 'fcim')) === 'done' &&
  w2.A11_DESK._stateOf(w2.A11_DESK._seq.find(s => s.id === 'trees')) === 'done');
check('an advisory step reports ADVISORY regardless of stores',
  w2.A11_DESK._stateOf(w2.A11_DESK._seq.find(s => s.id === 'requirements')) === 'advisory');

// Program Planning scoping — a lane the plan turned OFF is skipped; unknown ids stay on.
const w3 = world({ PROGRAM_PLAN: { CATALOGUE: [{ id: 'pra' }, { id: 'zsa' }], laneOn: id => id !== 'pra' } });
check('a lane the plan turned OFF is SKIPPED (not hidden, labelled)',
  w3.A11_DESK._stateOf(w3.A11_DESK._seq.find(s => s.id === 'pra')) === 'skipped-not-in-plan');
check('a lane the plan committed stays live', w3.A11_DESK._stateOf(w3.A11_DESK._seq.find(s => s.id === 'zsa')) === 'ready');
check('an UNKNOWN lane id fails SAFE — treated as committed, never silently hidden',
  w3.A11_DESK._laneOn('cma') === true,
  'the catalogue lacks cma; hiding a standard step on catalogue drift would be the dangerous direction');
check('with no Program Planning module at all, everything applies', w.A11_DESK._laneOn('pra') === true);

// ---- [3] auto-advance picks the FIRST ready drafting step -------------------
console.log('\n[a11] auto-advance selection');
const w4 = world({ acFunctionsData: [{}], acFcimData: [{}] });   // functions + fcim done → next is afha
check('next auto step is the first READY drafting step in standard order',
  (w4.A11_DESK._nextAutoStep() || {}).id === 'afha');
const w5 = world({ acFunctionsData: [{}], acFcimData: [{}], acFhaData: [{}], ftaPages: [{ root: {} }], praData: [{}], zsaData: [{}], cmaData: [{}], fmeaData: [{}] });
check('with every drafting step done, auto-advance has nothing to run (advisory steps are yours)',
  w5.A11_DESK._nextAutoStep() === null);

// ---- [4] the guards ---------------------------------------------------------
console.log('\n[a11] guards');
const w6 = world({ rgScan: () => ({ renames: [{}], deletions: [] }) });
check('a dirty rename desk blocks (stale upstream references)', w6.A11_DESK._renameDeskDirty() === true);
const w7 = world({ invRun: () => ({ hardFails: 2 }) });
check('hard invariant failures are read from the registry', w7.A11_DESK._hardInvariantFails() === 2);
check('runStep refuses while the rename desk is dirty (source pin)',
  /_renameDeskDirty\(\)\) \{ _note\('Blocked/.test(src));
check('auto-advance stops on hard invariant failures (source pin)',
  /hard > 0\) \{ _stopPolling\(\); _note\('Auto-advance stopped/.test(src));
check('a lane rejection stops the chain (source pin)',
  /\.catch\(function \(e\) \{\s*_stopPolling\(\);/.test(src));
check('a step that never lands pauses the chain — the dismissed panel is respected',
  src.includes('has not landed in the model'));

// ---- [5] doctrine: zero new write paths -------------------------------------
console.log('\n[a11] doctrine');
check('the module never mutates a data store (no push/splice on any *Data / ftaPages)',
  !/(acFcimData|acFhaData|acFunctionsData|acReqData|praData|zsaData|cmaData|fmeaData|ftaPages)\s*\.\s*(push|splice|unshift|pop)/.test(src));
check('the module calls no model — no Provider, no fetch',
  !/Provider\.|fetch\s*\(|XMLHttpRequest/.test(src));
check('steps are invoked THROUGH the launcher actions (same lanes, same gates)',
  src.includes('launcherActions') && /Promise\.resolve\(\)\.then\(action\.run\)/.test(src));
check('desk state lives in projectConfig (travels with the project), not localStorage',
  src.includes('projectConfig') && !src.includes('localStorage'));

// ---- [6] wiring -------------------------------------------------------------
console.log('\n[a11] wiring');
check('ai_assistant exposes launcherActions on the AI export',
  ai.includes('launcherActions: function () { try { return _launcherActions(); }'));
check('the launcher offers the desk itself',
  ai.includes("label: 'Run the ARP4761A workflow'") && ai.includes('window.A11_DESK'));
check('index.html loads a11_sequencing (1.1+, the let-scoping fix) and loader 4.8+',
  PIN.atLeast(idx, 'a11_sequencing.js', '1.1') &&
  PIN.atLeast(idx, 'ai_loader.js', '4.8'));
check('loader pin moved past the A11 ship (71.7+)',
  PIN.atLeast(loader, 'ai_assistant.js', '71.7'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

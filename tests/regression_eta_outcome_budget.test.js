#!/usr/bin/env node
/*
 * Regression — the event-tree outcome budget (7 Aug 2026).
 *
 * THE DEFECT: etaEvaluate enumerates 2^N paths for N barriers and had no guard of
 * any kind, while the fault-tree side has refused above CUTSET_BUDGET (200,000) for
 * years. Measured on the real engine before the fix:
 *
 *     16 barriers →    65,536 outcomes →   371 ms, +2.6 MB
 *     18 barriers →   262,144 outcomes → 1,724 ms, +269 MB
 *     20 barriers → 1,048,576 outcomes → 8,219 ms, +1,062 MB
 *
 * Twenty barriers is a large but entirely plausible ETA. The renderer would simply
 * die, with no message naming the cause — the opposite of the documented fail-safe
 * philosophy ("degrade by telling you, not by quietly being wrong").
 *
 * A partial enumeration is deliberately NOT offered: a truncated outcome set
 * under-reports the consequences the analysis exists to enumerate, and Σp would stop
 * summing to 1 — the property this evaluation is checked against.
 *
 * Run: node tests/regression_eta_outcome_budget.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');

const el = () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, querySelectorAll: () => [] });
const ctx = { window: { addEventListener() {} }, console: { log() {}, warn() {}, error() {} },
    document: { getElementById: () => null, createElement: el, body: el(), querySelectorAll: () => [], addEventListener() {} },
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0,
    Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date };
ctx.window.window = ctx.window; ctx.globalThis = ctx;
vm.createContext(ctx);
ctx.projectConfig = { eventTrees: [] };
vm.runInContext(fs.readFileSync(path.join(SITE, 'event_trees.js'), 'utf8'), ctx, { filename: 'event_trees.js' });
const ev = ctx.window.etaEvaluate;

const mk = n => { const barriers = []; for (let i = 0; i < n; i++) barriers.push({ name: 'B' + i, pFail: 0.1 });
    return { id: 'T', name: 'T', initiator: { desc: 'i', freq: 1e-6 }, barriers, consequences: {} }; };

console.log('\n[eta-budget] the engine is reachable and still evaluates');
check('etaEvaluate loads', typeof ev === 'function');
check('a small tree still evaluates and Σp = 1',
    (() => { const r = ev(mk(4)); return r && Math.abs(r.sum - 1) < 1e-12 && r.outcomes.length === 16; })(),
    'the guard must not disturb the property the evaluation exists to check');
check('a 10-barrier tree evaluates (1,024 outcomes)',
    (() => { const r = ev(mk(10)); return r.outcomes.length === 1024 && Math.abs(r.sum - 1) < 1e-9; })());

console.log('\n[eta-budget] the guard refuses, by name, with the numbers in the message');
{
    let e = null; try { ev(mk(20)); } catch (x) { e = x; }
    check('20 barriers now THROWS instead of allocating a gigabyte', !!e,
        'before the fix this returned after 8.2 s and +1.06 GB');
    check('the error is named EtaExplosionError', e && e.name === 'EtaExplosionError');
    check('it carries the barrier count, what it would have enumerated, and the budget',
        e && e.barriers === 20 && e.wouldEnumerate === Math.pow(2, 20) && e.budget > 0);
    check('the message tells the engineer what to DO, not just that it failed',
        e && /[Dd]ecompose/.test(e.message) && /second event tree/.test(e.message),
        'a refusal with no route forward is just a wall');
    check('the message states that NOTHING was computed',
        e && /[Nn]othing has been computed/.test(e.message),
        'the reader must not think they have a partial answer');
    check('it explains WHY a partial enumeration is not offered',
        e && /under-report/.test(e.message) && /1/.test(e.message));
}

console.log('\n[eta-budget] the boundary is exact and does not drift');
{
    const ok = (() => { try { const r = ev(mk(17)); return r.outcomes.length === 131072; } catch (_) { return false; } })();
    check('17 barriers (131,072 outcomes) is INSIDE the budget and evaluates', ok);
    let e = null; try { ev(mk(18)); } catch (x) { e = x; }
    check('18 barriers is OUTSIDE and refuses', e && e.name === 'EtaExplosionError');
    check('the budget is a stated power of two, not a magic number',
        /ETA_MAX_BARRIERS\s*=\s*17/.test(fs.readFileSync(path.join(SITE, 'event_trees.js'), 'utf8')));
}

console.log('\n[eta-budget] the measurement that justifies the number is written down');
{
    const S = fs.readFileSync(path.join(SITE, 'event_trees.js'), 'utf8');
    check('the real measured figures are recorded at the constant',
        /1,048,576/.test(S) && /1\.06 GB/.test(S) && /7 Aug 2026/.test(S),
        'a budget with no measurement behind it gets raised by the next person who hits it');
    check('it says every extra barrier DOUBLES cost',
        /DOUBLES/.test(S) || /doubles/.test(S));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

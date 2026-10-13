#!/usr/bin/env node
/*
 * Regression: requirements derived by top-down allocation gates (13 Oct 2026, math fix 2).
 *
 * FOUND: top-down allocation happens before the design exists, so it cannot account for common
 *   cause; the agreed rule (Waqas, 12 to 13 Oct 2026) is that the allocation tree's GATES derive the
 *   requirements instead: an OR gate derives a no-single-point-failure requirement, an AND gate a
 *   physical AND functional independence requirement. The generator was inconsistent: physical
 *   independence only when the top event was Catastrophic (a Hazardous redundancy got functional
 *   independence alone); the no-single-failure requirement only at the very top gate (an OR gate
 *   below an OR top, still on the single-failure path, derived nothing); a 2-of-3 VOTING gate was
 *   filed as an OR gate (drawing a single-failure requirement it does not have, and no
 *   independence); SPARE drew nothing; verification mirrors derived everything twice. The
 *   allocator's own independence requirement named functional independence only.
 * FIX: every AND-family gate (AND, INHIBIT, PAND, SPARE, k>=2 VOTING) of an allocation tree derives
 *   functional AND physical independence; every OR-family gate (OR, XOR, 1-of-n VOTING) on a
 *   single-failure path to a Hazardous/Catastrophic failure condition derives no-single-failure;
 *   mirrors derive nothing; _independenceReq names physical and functional independence. Common
 *   cause is NOT added to the allocation math (the budget split is untouched).
 * EXECUTED: the REAL genGateIndependence (assurance_modules.js) over hand-built allocation trees,
 *   against the expected set worked out by hand from the gate logic (independent of the generator),
 *   and the real allocateDAL for the requirement wording. Mutation proof: the generator from the
 *   production base (when the history is available) misses requirements the rule demands.
 * Run: node tests/regression_alloc_reqs_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const slice = (src, from, to, label) => {
    const a = src.indexOf(from), b = src.indexOf(to, a);
    if (a < 0 || b < 0) throw new Error('slice anchors missing: ' + label);
    return src.slice(a, b);
};

// One sandbox per assurance source, so the production base can be run beside the fix.
function mkGen(asr) {
    const c = { console, Math, JSON, String, Array, Object, Set, Map, Number, parseInt, Date };
    c.window = c; c.globalThis = c;
    vm.createContext(c);
    vm.runInContext('var SEVERITY_RANK = { Minor: 2, Major: 3, Hazardous: 4, Catastrophic: 5 }; var cmaData = []; var projectConfig = {}; var ftaPages = []; var __sev = {};', c);
    vm.runInContext(slice(asr, 'function hashStr', 'function walkAllPages', 'fp'), c);
    vm.runInContext(slice(asr, 'function _midSentence', 'function _governingFhaForPage', 'text helpers'), c);
    vm.runInContext(slice(asr, 'function findPathTo', '// Determine top-event severity', 'findPathTo'), c);
    vm.runInContext(slice(asr, 'function isAndFamily', '// ----- Generator 5', 'gate independence'), c);
    vm.runInContext('function pageTopSeverity(p){ return __sev[p.id] || null; }' +
        'function walkPagesInScope(scope, cb){ ftaPages.forEach(function(p){ (function w(n){ if(!n) return; cb(n, p); (n.children||[]).forEach(w); })(p.root); }); }', c);
    return c;
}
const NEW = mkGen(S('assurance_modules.js'));
let BASE = null;
for (const rev of ['fd6e4de', '7e1a988']) {
    try { BASE = mkGen(cp.execSync('git show ' + rev + ':site/assurance_modules.js', { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).toString()); break; } catch (_) { BASE = null; }
}

let nid = 1;
const be = (name) => ({ id: nid++, displayId: 'BE-' + nid, logicalId: 'L' + nid, type: 'basic', name: name, children: [] });
const g = (gt, name, kids, extra) => Object.assign({ id: nid++, displayId: 'G-' + nid, type: 'gate', gateType: gt, name: name, children: kids }, extra || {});
function run(C, pages, sevs) {
    C.ftaPages = pages; C.__sev = sevs;
    return vm.runInContext('genGateIndependence("ac")', C);
}
const byGate = (rows, node) => rows.filter(r => r.traceId === node.displayId).map(r => r.reqSource.generator).sort();

// ---- [1] the hand-worked expectations -----------------------------------------------------------
console.log('\n[1] every gate derives what its logic demands');
// Hazardous FC:  TOP = OR( A1 = OR(a, b),  R = AND(c, d),  V = 2oo3(e, f, h),  S = SPARE(p, q) )
const a = be('Pump A fails'), b = be('Pump B fails'), cc = be('Lane C fails'), d = be('Lane D fails');
const e = be('Sensor E fails'), f = be('Sensor F fails'), h = be('Sensor H fails'), p = be('Primary fails'), q = be('Spare fails');
const A1 = g('OR', 'Loss of supply path', [a, b]);
const R = g('AND', 'Loss of both lanes', [cc, d]);
const V = g('VOTING', 'Two of three sensors lost', [e, f, h], { votingK: 2 });
const SP = g('SPARE', 'Loss of primary and spare', [p, q]);
const TOP = g('OR', 'Loss of braking', [A1, R, V, SP]);
// A second tree under an AND top: its OR child sits below redundancy and must derive no NSPF.
const o1 = be('Valve 1 fails'), o2 = be('Valve 2 fails'), m = be('Monitor fails');
const OR2 = g('OR', 'Channel 1 lost', [o1, o2]);
const TOP2 = g('AND', 'Loss of both channels', [OR2, m]);
const pages = [{ id: 'P1', name: 'Haz tree', root: TOP }, { id: 'P2', name: 'Cat tree', root: TOP2 },
    { id: 'P1v', name: 'Haz tree (verification)', verifies: 'P1', root: JSON.parse(JSON.stringify(TOP)) }];
const rows = run(NEW, pages, { P1: 'Hazardous', P2: 'Catastrophic', P1v: 'Hazardous' });
const IND = ['gate-indep-and', 'gate-indep-phys'];
check('top OR of a Hazardous FC: no single failure', JSON.stringify(byGate(rows, TOP)) === JSON.stringify(['gate-indep-or']), byGate(rows, TOP).join(','));
check('an OR gate under the OR top (still a single-failure path) derives no single failure too (was nothing)', JSON.stringify(byGate(rows, A1)) === JSON.stringify(['gate-indep-or']), byGate(rows, A1).join(','));
check('an AND gate in a Hazardous tree derives functional AND physical independence (physical was Catastrophic-only)', JSON.stringify(byGate(rows, R)) === JSON.stringify(IND), byGate(rows, R).join(','));
check('a 2-of-3 VOTING gate is redundancy: physical and functional independence, no single-failure row', JSON.stringify(byGate(rows, V)) === JSON.stringify(IND), byGate(rows, V).join(','));
check('a SPARE gate (primary AND spare) derives physical and functional independence (was nothing)', JSON.stringify(byGate(rows, SP)) === JSON.stringify(IND), byGate(rows, SP).join(','));
check('an OR gate below an AND (redundancy above it) derives no single-failure requirement', byGate(rows, OR2).length === 0, byGate(rows, OR2).join(','));
check('the Catastrophic AND top derives physical and functional independence', JSON.stringify(byGate(rows, TOP2)) === JSON.stringify(IND), byGate(rows, TOP2).join(','));
check('a verification mirror derives nothing (no duplicates)', rows.every(r => !/:P1v:/.test(r.reqSource.sourceId)), rows.filter(r => /:P1v:/.test(r.reqSource.sourceId)).length + ' mirror rows');
const physR = rows.find(r => r.traceId === R.displayId && r.reqSource.generator === 'gate-indep-phys');
const funcR = rows.find(r => r.traceId === R.displayId && r.reqSource.generator === 'gate-indep-and');
check('the wording names physical independence and functional independence, one shall each',
    / shall be physically independent\.$/.test(physR.text) && / shall be functionally independent\.$/.test(funcR.text)
    && (physR.text.match(/shall/g) || []).length === 1 && (funcR.text.match(/shall/g) || []).length === 1, physR.text + ' | ' + funcR.text);
check('the physical rationale says what physical independence means (location, routing, power source)', /location, routing and power source/.test(physR.rat));
const nspfA1 = rows.find(r => r.traceId === A1.displayId);
check('the derived no-single-failure text names the gate event and the rationale names its members',
    nspfA1.text === 'No single failure shall result in loss of supply path.' && /Pump A fails/.test(nspfA1.rat) && /Pump B fails/.test(nspfA1.rat), nspfA1.text);
check('the top-gate requirement keeps its original text and sourceId (no churn)',
    rows.find(r => r.traceId === TOP.displayId).text === 'No single failure shall result in loss of braking.' && rows.find(r => r.traceId === TOP.displayId).reqSource.sourceId === 'ac:gate-indep:P1:' + TOP.id);
// Major FC: no regulatory single-failure requirement; independence still derived for the AND.
const mA = be('x'), mB = be('y'), MAJ = g('OR', 'Loss of lighting', [g('AND', 'Both lamps out', [mA, mB])]);
const rowsMaj = run(NEW, [{ id: 'PM', name: 'Major', root: MAJ }], { PM: 'Major' });
check('a Major FC: no single-failure row (25.1309(b) fail-safe is Hazardous/Catastrophic), AND independence still derived',
    !rowsMaj.some(r => r.reqSource.generator === 'gate-indep-or') && rowsMaj.filter(r => IND.indexOf(r.reqSource.generator) >= 0).length === 2);

// ---- [2] mutation proof: the production generator misses what the rule demands ------------------
console.log('\n[2] mutation proof');
if (BASE) {
    nid = 1000;
    const rowsB = run(BASE, pages, { P1: 'Hazardous', P2: 'Catastrophic', P1v: 'Hazardous' });
    const miss = [];
    if (byGate(rowsB, A1).indexOf('gate-indep-or') < 0) miss.push('A1 no-single-failure');
    if (byGate(rowsB, R).indexOf('gate-indep-phys') < 0) miss.push('R physical');
    if (byGate(rowsB, SP).length === 0) miss.push('SPARE nothing');
    if (byGate(rowsB, V).indexOf('gate-indep-and') < 0) miss.push('2oo3 independence');
    check('the production base fails the same expectations (' + miss.join(', ') + ')', miss.length >= 3, miss.join(', '));
} else console.log('  (production base not in this git history; the expectations in [1] are the proof)');

// ---- [3] the allocator's own independence requirement names both; allocation math untouched ----
console.log('\n[3] the allocator wording; no common cause in the allocation math');
{
    const C = { console, Math, JSON, String, Array, Object, Set, Map, Number, parseInt };
    C.window = C; C.globalThis = C; vm.createContext(C);
    vm.runInContext(S('safety_targets.js').replace(/^const /gm, 'var '), C);
    const fnText = (src, name) => { const at = src.indexOf('function ' + name + '('); const o = src.indexOf('{', src.indexOf(')', at)); let k = 0; for (let i = o; i < src.length; i++) { if (src[i] === '{') k++; else if (src[i] === '}') { k--; if (k === 0) return src.slice(at, i + 1); } } };
    vm.runInContext('var projectConfig = {}; var ftaPages = [];' + fnText(S('helpers_modules.js'), 'dalDecrement') + fnText(S('helpers_modules.js'), 'dalMax') + fnText(S('support_modules.js'), 'dalRowComplianceBasis') + fnText(S('support_modules.js'), 'allocateDAL'), C);
    const gg = { id: 1, displayId: 'G-1', type: 'gate', gateType: 'AND', children: [{ id: 2, type: 'basic' }, { id: 3, type: 'basic' }] };
    C.__g = gg; vm.runInContext('allocateDAL(__g, "A", new Set(), null, null)', C);
    check('the AND gate independence requirement names physical and functional independence', gg._independenceReq && gg._independenceReq.text === 'Members of G-1 shall be physically and functionally independent.', gg._independenceReq && gg._independenceReq.text);
    const q = S('fta_quant_modules.js');
    const alloc = slice(q, 'function allocateTopDown', '\nfunction ', 'allocateTopDown');
    check('the allocation split itself carries no common-cause term (beta is not read by allocateTopDown)', !/\bbeta\b|ccfGroup/.test(alloc));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

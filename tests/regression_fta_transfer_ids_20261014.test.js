#!/usr/bin/env node
/* Regression F1 (fourth audit, 14 Oct 2026): node ids repeat across pages. A transferred page whose root (or any node)
 * reuses an id from the calling page was silently dropped, because visits were keyed by node id: AND(A, B) behind a
 * transfer with root 'G1' gave no effect. Visits are now keyed by the node itself in the engine (collect, cut sets,
 * FDEP scan, dynamic gate info, common cause notes), the app's bottom-up quantification and the non-monotone scan.
 * Ids repeated inside ONE page are reported (MC-07) and refused by the zonal / PRA impact. 13 Nov 2026: both messages name the
 * tree and every shared ID in plain words (they stopped at 5 and 10); MC-07 is run on the trees here, not read as source. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const ENG = read('fta_engine.js'), CZ = read('cad_zonal.js');
const L = (id, s, p) => ({ id, type: 'basic', displayId: id, name: id, probability: p || 1e-3, identity: { kind: 'item', systemId: s } });
const G = (id, t, ch, x) => Object.assign({ id, type: 'gate', gateType: t, displayId: id, name: id, children: ch }, x || {});
function pages(rid, leafId) { return [{ id: 'T1', name: 'T1', linkedFhaIds: [1], root: G('G1', 'OR', [G('TR', 'TRANSFER', [], { linkedPageId: 'T2' })]) },
    { id: 'T2', name: 'T2', linkedFhaIds: [], root: G(rid, 'AND', [L(leafId || 'a2', 'A', 1e-3), L('b2', 'B', 2e-3)]) }]; }
function ctx(P, engSrc, czSrc) {
    const sb = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, parseInt, Int32Array, Float32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {},
        systemsData: [{ id: 'A' }, { id: 'B' }], acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'x', severity: 'Catastrophic' }], ftaPages: P, ftaConfig: { exposureTime: 1 } };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb); vm.runInContext(read('zonal_model.js'), sb); vm.runInContext(engSrc || ENG, sb); vm.runInContext(czSrc || CZ, sb); return sb;
}
function run(engSrc, czSrc) {
    const out = {};
    ['G1', 'H1'].forEach(rid => { const sb = ctx(pages(rid), engSrc, czSrc), E = sb.SLFTAEngine, root = sb.ftaPages[0].root;
        out[rid] = { impact: sb.SLCadZonal.impactOfEquipment(['A', 'B']).worst, p: E.computeExactProbability(root).prob, cs: E.getCutsets(root).map(c => c.map(n => n.id).sort().join('+')).join(',') }; });
    // a leaf of the linked page with the same id as the calling page's root: 'G1'
    { const sb = ctx(pages('H1', 'G1'), engSrc, czSrc), E = sb.SLFTAEngine; out.leafG1 = { impact: sb.SLCadZonal.impactOfEquipment(['A', 'B']).worst, p: E.computeExactProbability(sb.ftaPages[0].root).prob }; }
    return out;
}
const R = run();
// hand calculation: top = AND(a2, b2) = 1e-3 x 2e-3 = 2e-6; one cut set {a2, b2}
check('F1 auditor d1c: AND(A,B) behind a transfer whose linked root reuses the id G1: Catastrophic, as with H1', R.G1.impact === 'Catastrophic' && R.H1.impact === 'Catastrophic', JSON.stringify(R));
check('F1: exact probability 2e-6 and the cut set {a2, b2} whether the linked root is G1 or H1', Math.abs(R.G1.p - 2e-6) < 1e-15 && Math.abs(R.H1.p - 2e-6) < 1e-15 && R.G1.cs === 'a2+b2' && R.H1.cs === 'a2+b2', JSON.stringify(R));
check('F1: a leaf of the linked page with the calling root\'s id (G1) is kept: Catastrophic, 2e-6', R.leafG1.impact === 'Catastrophic' && Math.abs(R.leafG1.p - 2e-6) < 1e-15, JSON.stringify(R.leafG1));
// bottom-up quantification (the app's fta_quant_modules) on the same trees
{ const sb = ctx(pages('G1')); try { vm.runInContext(read('engine_modules.js').replace(/^const BDD = /m, 'var BDD_APP = '), sb); } catch (_) {} vm.runInContext(read('fta_quant_modules.js'), sb);
  const bu = sb.calcBottomUp(sb.ftaPages[0].root, new Set());
  check('F1: bottom-up quantification through the transfer with the reused root id: 2e-6', Math.abs(bu - 2e-6) < 1e-15, String(bu)); }
// duplicate ids inside one page (wording of 13 Nov 2026): the zonal / PRA impact refuses the tree (Not evaluated) and names
// the tree and every shared ID in plain words; MC-07 (hard) says the same. MC-07 is run here on the same trees, not read as text.
const mc07 = (P, mcSrc) => { const regs = [], sb = ctx(P); sb.invRegister = r => regs.push(r); sb.setInterval = () => 0; sb.clearInterval = () => {};
    vm.runInContext(mcSrc || read('model_checks.js'), sb); const r = regs.find(x => x.id === 'MC-07'); return r ? r.run() : null; };
const MANY = Array.from({ length: 12 }, (_, i) => 'd' + String(i + 1).padStart(2, '0'));
const manyPages = () => [{ id: 'T9', name: 'Many dup tree', linkedFhaIds: [1], root: G('G1', 'OR', MANY.map((id, i) => G('M' + i, 'AND', [L(id, 'A'), L(id, 'B')]))) }];
function manyResult(czSrc, mcSrc) { const P = manyPages(), sb = ctx(P, null, czSrc), d = sb.SLFTAEngine.duplicateNodeIds(P[0].root), im = sb.SLCadZonal.impactOfEquipment(['A']); sb.SLCadZonal.takeRefusals(); return { d, im, m: mc07(P, mcSrc) }; }
const manyOk = r => r.im.worst === null && (r.im.notEvaluated || '').indexOf('Fault tree Many dup tree: 12 IDs are each shared by two or more events or gates (' + r.d.join(', ') + '). Give each its own ID; until then this tree gets no zonal result.') >= 0 && MANY.every(id => r.im.notEvaluated.indexOf(id) >= 0);
const manyMcOk = r => !!r.m && r.m.checked === 1 && r.m.fails.length === 1 && r.m.fails[0] === 'Many dup tree: 12 IDs are each shared by two or more events or gates (' + r.d.join(', ') + '). Give each its own ID.' && MANY.every(id => r.m.fails[0].indexOf(id) >= 0);
{ const P = [{ id: 'T1', name: 'Dup tree', linkedFhaIds: [1], root: G('G1', 'OR', [L('x', 'A'), G('G2', 'AND', [L('x', 'B'), L('y', 'A')])]) }], sb = ctx(P);
  const d = sb.SLFTAEngine.duplicateNodeIds(P[0].root), im = sb.SLCadZonal.impactOfEquipment(['A']); sb.SLCadZonal.takeRefusals();
  check('F1: one ID used twice inside one page: the impact is Not evaluated, naming the tree and the ID in plain words', d.join() === 'x' && im.worst === null && (im.notEvaluated || '').indexOf('Fault tree Dup tree: two or more events or gates share the ID x. Give each its own ID; until then this tree gets no zonal result.') >= 0, JSON.stringify([d, im.notEvaluated]));
  check('F1: the screen warning for it reads "Not evaluated:" with that message', /^<div data-not-evaluated[^>]*>Not evaluated: fault tree\(s\) not evaluated: Fault tree Dup tree: two or more events or gates share the ID x\./.test(sb.SLCadZonal.notEvaluatedHtml(im.notEvaluated)), sb.SLCadZonal.notEvaluatedHtml(im.notEvaluated));
  const m = mc07(P);
  check('F1: model check MC-07 (hard), run on the same tree, names the tree and the ID and ends "Give each its own ID."', !!m && m.checked === 1 && m.fails.length === 1 && m.fails[0] === 'Dup tree: two or more events or gates share the ID x. Give each its own ID.', JSON.stringify(m)); }
{ const r = manyResult();
  check('F1: twelve IDs shared inside one page: all twelve found', r.d.slice().sort().join() === MANY.join(), JSON.stringify(r.d));
  check('F1: twelve shared IDs: Not evaluated, "12 IDs are each shared ...", the tree and every one of the twelve named (the old message stopped at 5)', manyOk(r), r.im.notEvaluated);
  check('F1: twelve shared IDs: MC-07 names the tree and every one of the twelve (the old message stopped at 10)', manyMcOk(r), JSON.stringify(r.m)); }
check('F1: the page and the worker load the same engine version', (read('index.html').match(/fta_engine\.js\?v=([\d.]+)/) || [])[1] === (read('fta_worker.js').match(/importScripts\('fta_engine\.js\?v=([\d.]+)'\)/) || [])[1]);
const mut = (name, file, from, to, test) => { const S = file === 'eng' ? ENG : CZ; if (S.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let red = false; try { red = !test(file === 'eng' ? run(S.replace(from, to)) : run(null, S.replace(from, to))); } catch (e) { red = true; } check('mutation goes red: ' + name, red); };
mut('collect keyed by node id again', 'eng', "if (visitedNodes.has(node)) return;   // F1: by the node itself, not its id (a transferred page may reuse an id)\n        visitedNodes.add(node);", "if (visitedNodes.has(node.id)) return;\n        visitedNodes.add(node.id);", r => r.G1.impact === 'Catastrophic' && Math.abs(r.G1.p - 2e-6) < 1e-15);
mut('cut sets keyed by node id again', 'eng', "if (!node) return []; if (visited.has(node)) return []; visited.add(node);", "if (!node) return []; if (visited.has(node.id)) return []; visited.add(node.id);", r => r.G1.cs === 'a2+b2');
{ const czFrom = "dupIds.length + ' IDs are each shared by two or more events or gates (' + dupIds.join(', ') + ')'", czTo = "dupIds.length + ' IDs are each shared by two or more events or gates (' + dupIds.slice(0, 5).join(', ') + ')'";
  const mcFrom = "d.length + ' IDs are each shared by two or more events or gates (' + d.join(', ') + ')'", mcTo = "d.length + ' IDs are each shared by two or more events or gates (' + d.slice(0, 10).join(', ') + ')'", MC = read('model_checks.js');
  check('anchor present: zonal names every shared ID', CZ.indexOf(czFrom) >= 0); check('anchor present: MC-07 names every shared ID', MC.indexOf(mcFrom) >= 0);
  let red = false; try { red = !manyOk(manyResult(CZ.replace(czFrom, czTo))); } catch (e) { red = true; } check('mutation goes red: zonal message cut to the first 5 IDs again', red);
  red = false; try { red = !manyMcOk(manyResult(null, MC.replace(mcFrom, mcTo))); } catch (e) { red = true; } check('mutation goes red: MC-07 message cut to the first 10 IDs again', red); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);

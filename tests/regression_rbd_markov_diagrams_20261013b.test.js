#!/usr/bin/env node
/*
 * Regression - 13 Oct 2026 (fix3-M). The reliability block diagram (IEC 61078) and the Markov
 * state diagram (IEC 61165) drawn by hand on the one diagram editor.
 *
 * FOUND: the RBD was nested HTML boxes made from a fault tree or a typed formula: no canvas, no
 *   standby redundancy, no bridges or general networks, no start and end, no marking of a block
 *   drawn in two places (and the formula math counted such a block as two independent ones). The
 *   Markov model was two tables with no state diagram, no start state or starting distribution,
 *   no degraded states and no failure / repair distinction.
 * FIX: site/rbd_net.js (network engine: exact decision diagram over the drawn network, standby
 *   groups as small Markov chains, brute-force second leg), rbd_module.js v2.0 (the diagram on the
 *   editor; derive-from-fault-tree and import-formula stay as shortcuts that give an editable
 *   diagram; a derived diagram is checked against its tree; old models open unchanged and read
 *   only until "Edit by hand"), rbd_xcheck.js v0.3 (four-way cross-check of drawn networks),
 *   markov_diagram.js (the state diagram, two views of one model with the tables), markov_ctmc.js
 *   v1.2 (starting distribution), fta_quant_modules.js (tables: type, start, failure / repair, ids,
 *   renames carried), sysml_model.js v1.1 + library (export / import of both), diagram_editor.js
 *   v1.1 (ctx.model, refreshShapes, field apply, offerOnDrag).
 * EXECUTED: the real site files in node vm (independent closed forms and enumerations, mutation
 *   proofs on the engine), the SysML v2 validators when installed, and Chromium on the real app
 *   with the Halcyon showcase (draw from blank with the mouse, edit, undo, links, derived content
 *   edited, old data unchanged).
 * Run: node tests/regression_rbd_markov_diagrams_20261013b.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), cp = require('child_process'), http = require('http');
let pass = 0, fail = 0; const skips = [];
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' -- ' + String(d).slice(0, 500) : '')); } };
const REPO = path.join(__dirname, '..'), SITE = path.join(REPO, 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const close = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-12 : tol);
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

function load(files, extra) {
  const ctx = Object.assign({ console, Math, JSON, Date, setTimeout, clearTimeout }, extra || {});
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  files.forEach(f => vm.runInContext(typeof f === 'string' ? S(f) : f.src, ctx, { filename: typeof f === 'string' ? f : f.name }));
  return ctx;
}
const G = load(['rbd_net.js']);
const N = G.RBD_NET;
const el = (id, kind, props, label) => ({ id, kind, x: 0, y: 0, w: 10, h: 10, label: label == null ? id : label, props: props || {} });
const ln = (a, b, k) => ({ id: a + '>' + b, kind: k || 'link', from: a, to: b, props: {} });
const L = r => -Math.log(r);            // lambda giving R = r at t = 1

// ============================================================ [1] the network engine
console.log('\n[1] rbd_net.js: exact network reliability against independent closed forms');
{
  // series, parallel, 2oo3 drawn as networks
  const ser = { elements: [el('S', 'start'), el('E', 'end'), el('a', 'block', { lambda: L(0.9) }), el('b', 'block', { lambda: L(0.8) })], connectors: [ln('S', 'a'), ln('a', 'b'), ln('b', 'E')] };
  check('series of 0.9 and 0.8 gives 0.72', close(N.reliability(N.analyze(ser), 1), 0.72));
  const par = { elements: [el('S', 'start'), el('E', 'end'), el('a', 'block', { lambda: L(0.9) }), el('b', 'block', { lambda: L(0.8) })], connectors: [ln('S', 'a'), ln('S', 'b'), ln('a', 'E'), ln('b', 'E')] };
  check('parallel of 0.9 and 0.8 gives 0.98', close(N.reliability(N.analyze(par), 1), 0.98));
  const koon = { elements: [el('S', 'start'), el('E', 'end'), el('j', 'node'), el('v', 'vote', { k: 2 }), el('a', 'block', { lambda: L(0.9) }), el('b', 'block', { lambda: L(0.9) }), el('c', 'block', { lambda: L(0.9) })],
    connectors: [ln('S', 'j'), ln('j', 'a'), ln('j', 'b'), ln('j', 'c'), ln('a', 'v'), ln('b', 'v'), ln('c', 'v'), ln('v', 'E')] };
  check('2-out-of-3 at 0.9 gives 3(0.81)(0.1) + 0.729 = 0.972', close(N.reliability(N.analyze(koon), 1), 0.972, 1e-12));
  // the bridge: pivot on the middle block by hand
  const a = 0.9, b = 0.8, c = 0.7, d = 0.6, x = 0.95;
  const bridge = { elements: [el('S', 'start'), el('E', 'end'), el('A', 'block', { lambda: L(a) }), el('B', 'block', { lambda: L(b) }), el('C', 'block', { lambda: L(c) }), el('D', 'block', { lambda: L(d) }), el('X', 'block', { lambda: L(x) }), el('n1', 'node'), el('n2', 'node')],
    connectors: [ln('S', 'A'), ln('S', 'B'), ln('A', 'n1'), ln('B', 'n2'), ln('n1', 'X', 'link2'), ln('X', 'n2', 'link2'), ln('n1', 'C'), ln('n2', 'D'), ln('C', 'E'), ln('D', 'E')] };
  const bridgeR = x * (1 - (1 - a) * (1 - b)) * (1 - (1 - c) * (1 - d)) + (1 - x) * (1 - (1 - a * c) * (1 - b * d));
  const AB = N.analyze(bridge);
  check('bridge (two-way middle link): the network is found to have a loop and is solved from its routes', AB.ok && AB.method === 'routes' && AB.routes === 4, AB.method + ' ' + AB.routes);
  check('bridge: R equals the pivotal decomposition on the middle block (0.85966)', close(N.reliability(AB, 1), bridgeR), N.reliability(AB, 1) + ' vs ' + bridgeR);
  const bf = N.bruteForce(AB, cc => N.compR(cc, 1));
  check('bridge: brute-force enumeration of all 32 states agrees (independent reachability, no decision diagram)', bf.ok && bf.states === 32 && close(bf.value, bridgeR));
  const nm = s => s.map(cc => cc.name).sort().join('');
  check('bridge: minimal path sets AC, BD, AXD, BXC', JSON.stringify(N.pathSets(AB).map(nm).sort()) === JSON.stringify(['AC', 'ADX', 'BCX', 'BD']), JSON.stringify(N.pathSets(AB).map(nm)));
  check('bridge: minimal cut sets AB, CD, AXD, BXC', JSON.stringify(N.cutSets(AB).map(nm).sort()) === JSON.stringify(['AB', 'ADX', 'BCX', 'CD']), JSON.stringify(N.cutSets(AB).map(nm)));
  // the same bridge with one-way middle links (A side to B side only) is a different, smaller system
  const bridge1 = JSON.parse(JSON.stringify(bridge)); bridge1.connectors.forEach(k => { if (k.kind === 'link2') k.kind = 'link'; });
  const oneWay = x * (1 - (1 - a) * (1 - b)) * (1 - (1 - c) * (1 - d)) * 0;   // placeholder, computed below by enumeration by hand
  let manual = 0;
  for (let m = 0; m < 32; m++) {
    const up = [a, b, c, d, x].map((p, i) => ((m >> i) & 1) === 1), pr = [a, b, c, d, x].reduce((s, p, i) => s * (up[i] ? p : 1 - p), 1);
    const [A_, B_, C_, D_, X_] = up;
    const n1 = A_, n2 = B_ || (n1 && X_);          // one-way: n1 -> X -> n2 only
    if ((n1 && C_) || (n2 && D_)) manual += pr;
  }
  check('one-way middle link: flow order is used and the answer matches a hand-written enumeration', close(N.reliability(N.analyze(bridge1), 1), manual) && N.analyze(bridge1).method === 'flow' && !close(manual, bridgeR, 1e-6), manual + oneWay);
  // repeated block: one component drawn twice
  const rep = { elements: [el('S', 'start'), el('E', 'end'), el('p1', 'block', { lambda: L(0.9), component: 'P' }), el('p2', 'block', { lambda: L(0.9), component: 'P' }), el('q', 'block', { lambda: L(0.8) }), el('r', 'block', { lambda: L(0.7) })],
    connectors: [ln('S', 'p1'), ln('p1', 'q'), ln('q', 'E'), ln('S', 'r'), ln('r', 'p2'), ln('p2', 'E')] };
  const AR = N.analyze(rep);
  // P shared: R = P(p up) * P(q or r up) = 0.9 * (1 - 0.2*0.3) = 0.846; independent copies would give 1-(1-0.72)(1-0.63) = 0.8964
  check('repeated block: one component in two places, R = 0.9 x (1 - 0.2 x 0.3) = 0.846 (not 0.8964 as two independent copies)', AR.comps.length === 3 && close(N.reliability(AR, 1), 0.846, 1e-12), N.reliability(AR, 1));
  const rep2 = JSON.parse(JSON.stringify(rep)); rep2.elements[3].props.lambda = L(0.5);
  check('repeated block with different failure rates in its places is refused by name', !N.analyze(rep2).ok && /drawn in 2 places with different values/.test(N.analyze(rep2).errors[0]));
  // standby
  const lam = 1e-3, t = 500;
  check('standby, 2 units cold, switch 0.9: R = e^(-lt)(1 + 0.9 lt)', close(N.standbyR({ lambda: lam, units: 2, warmK: 0, switchP: 0.9 }, t), Math.exp(-lam * t) * (1 + 0.9 * lam * t), 1e-13));
  const k = 0.3;
  check('standby, 2 units warm (k = 0.3), perfect switch: R = e^(-lt) + (1/k)(e^(-lt) - e^(-(1+k)lt))', close(N.standbyR({ lambda: lam, units: 2, warmK: k, switchP: 1 }, t), Math.exp(-lam * t) + (1 / k) * (Math.exp(-lam * t) - Math.exp(-(1 + k) * lam * t)), 1e-13));
  check('standby, hot (k = 1), perfect switch, equals 2 units in parallel', close(N.standbyR({ lambda: lam, units: 2, warmK: 1, switchP: 1 }, t), 1 - Math.pow(1 - Math.exp(-lam * t), 2), 1e-13));
  // 3 units cold, perfect switch: Erlang survival e^(-lt)(1 + lt + (lt)^2/2)
  check('standby, 3 units cold, perfect switch: Erlang e^(-lt)(1 + lt + (lt)^2/2)', close(N.standbyR({ lambda: lam, units: 3, warmK: 0, switchP: 1 }, t), Math.exp(-0.5) * (1 + 0.5 + 0.125), 1e-13));
  // 3 units warm with imperfect switch against the CTMC solver in markov_ctmc.js (a different code path)
  const MC = require(path.join(SITE, 'markov_ctmc.js'));
  const w = 0.2, p = 0.95;
  const chain = { states: [{ name: 's2' }, { name: 's1' }, { name: 's0' }, { name: 'F', isFailed: true }],
    transitions: [{ from: 's2', to: 's1', rate: lam * p + 2 * w * lam }, { from: 's2', to: 'F', rate: lam * (1 - p) }, { from: 's1', to: 's0', rate: lam * p + w * lam }, { from: 's1', to: 'F', rate: lam * (1 - p) }, { from: 's0', to: 'F', rate: lam }] };
  const ct = MC.solveMarkovTransient(chain, 2000);
  check('standby, 3 units warm, switch 0.95: equals the uniformization CTMC solver on the same chain', ct.ok && close(N.standbyR({ lambda: lam, units: 3, warmK: w, switchP: p }, 2000), 1 - ct.pFailed, 1e-11));
  // standby against the seeded Monte Carlo of rbd_mc.js (2 units, where its warm model is the same)
  const MCC = load([{ name: 'rbd_mc.js', src: S('rbd_mc.js') }], { document: undefined, projectConfig: undefined });
  const sim = MCC.mcRun([{ name: 'm', duration: 1500, model: { type: 'standby', lambda: lam, units: 2, switchP: 0.9, warmK: 0.4 } }], 200000, 7);
  const ex = N.standbyR({ lambda: lam, units: 2, warmK: 0.4, switchP: 0.9 }, 1500);
  check('standby, 2 units warm 0.4, switch 0.9: the seeded Monte Carlo (200,000 trials) lands within 4 standard errors', Math.abs(sim.r - ex) <= 4 * sim.se, sim.r + ' vs ' + ex + ' se ' + sim.se);
  // standby inside a network
  const sbn = { elements: [el('S', 'start'), el('E', 'end'), el('g', 'standby', { lambda: lam, units: 2, warmK: 0, switchP: 0.9 }), el('m', 'block', { lambda: 2e-4 })], connectors: [ln('S', 'g'), ln('g', 'm'), ln('m', 'E')] };
  check('a standby group in series with a block multiplies through', close(N.reliability(N.analyze(sbn), t), Math.exp(-lam * t) * (1 + 0.9 * lam * t) * Math.exp(-2e-4 * t), 1e-13));
  check('availability with a standby group is refused with the reason', !N.availability(N.analyze(sbn)).ok && /standby groups/.test(N.availability(N.analyze(sbn)).reason));
  // MTTF and availability
  const p2 = { elements: [el('S', 'start'), el('E', 'end'), el('a', 'block', { lambda: 1e-3, mu: 0.1 }), el('b', 'block', { lambda: 1e-3, mu: 0.1 })], connectors: [ln('S', 'a'), ln('S', 'b'), ln('a', 'E'), ln('b', 'E')] };
  check('MTTF of two parallel blocks = 1.5 / lambda', close(N.mttf(N.analyze(p2)), 1500, 1e-3), N.mttf(N.analyze(p2)));
  check('MTTF of 2-out-of-3 = (5/6) / lambda', close(N.mttf(N.analyze({ elements: koon.elements.map(e => e.kind === 'block' ? Object.assign({}, e, { props: { lambda: 1e-3 } }) : e), connectors: koon.connectors })), 5000 / 6, 1e-3));
  const Ai = 0.1 / 0.101;
  check('steady availability of two repairable blocks in parallel = 1 - (1 - mu/(l+mu))^2', close(N.availability(N.analyze(p2)).value, 1 - (1 - Ai) * (1 - Ai), 1e-14));
  check('availability needs a repair rate on every block that can fail (named)', !N.availability(N.analyze(ser)).ok && /needs a repair rate/.test(N.availability(N.analyze(ser)).reason));
  // refusals, named
  check('no start, no end: named', /Add the start/.test(N.analyze({ elements: [el('E', 'end')], connectors: [] }).errors.join(' ')) && /Add the end/.test(N.analyze({ elements: [el('S', 'start')], connectors: [] }).errors.join(' ')));
  check('end not reachable: named', /cannot be reached from the start/.test(N.analyze({ elements: [el('S', 'start'), el('E', 'end'), el('a', 'block', { lambda: 1 })], connectors: [ln('S', 'a')] }).errors.join(' ')));
  check('a block with no failure rate is named', /needs a failure rate/.test(N.analyze({ elements: [el('S', 'start'), el('E', 'end'), el('a', 'block', {}, 'Pump')], connectors: [ln('S', 'a'), ln('a', 'E')] }).errors.join(' ')));
  const badK = JSON.parse(JSON.stringify(koon)); badK.elements.find(e => e.id === 'v').props.k = 4;
  check('k above the number of incoming links is named', /needs k between 1 and 3/.test(N.analyze(badK).errors.join(' ')));
  const loopVote = JSON.parse(JSON.stringify(bridge)); loopVote.elements.push(el('v', 'vote', { k: 1 })); loopVote.connectors = loopVote.connectors.filter(cn => cn.to !== 'E'); loopVote.connectors.push(ln('C', 'v'), ln('D', 'v'), ln('v', 'E'));
  check('a k-out-of-n node inside a loop of two-way links is refused with the reason', /loop/.test(N.analyze(loopVote).errors.join(' ')));
  check('a shape off every route is a note, not an error', N.analyze({ elements: ser.elements.concat([el('z', 'block', { lambda: 1 }, 'Spare')]), connectors: ser.connectors }).ok && /"Spare" is not on any route/.test(N.analyze({ elements: ser.elements.concat([el('z', 'block', { lambda: 1 }, 'Spare')]), connectors: ser.connectors }).warnings.join(' ')));

  // mutation proofs: break the engine three ways, the checks above must see it
  const src = S('rbd_net.js');
  const mut = (name, from, to) => { if (src.indexOf(from) < 0) return null; return load([{ name: 'rbd_net_mut.js', src: src.replace(from, to) }]).RBD_NET; };
  const M1 = mut('repeat', "function compKey(el) { var c = el.props && el.props.component; c = c == null ? '' : String(c).trim(); return c || el.id; }", 'function compKey(el) { return el.id; }');
  check('mutation: counting a repeated block as two components is caught (0.8964, not 0.846)', M1 && !close(M1.reliability(M1.analyze(rep), 1), 0.846, 1e-6));
  const M2 = mut('dormant', 'Q[s][s - 1] += s * w * lam;', '');
  check('mutation: dropping the dormant failures of a warm standby is caught', M2 && !close(M2.standbyR({ lambda: lam, units: 2, warmK: k, switchP: 1 }, t), Math.exp(-lam * t) + (1 / k) * (Math.exp(-lam * t) - Math.exp(-(1 + k) * lam * t)), 1e-6));
  const M3 = mut('vote', 'reach[id] = bdd.atLeast(Math.round(num(e.props.k)), ins); return;', 'reach[id] = ins.reduce(function (a, f) { return bdd.or(a, f); }, 0); return;');
  check('mutation: treating k-out-of-n as plain parallel is caught (0.999 is not 0.972)', M3 && !close(M3.reliability(M3.analyze(koon), 1), 0.972, 1e-6));
  const M4 = mut('twoway', "if (c.kind === 'link2') addEdge(c.to, c.from);", '');
  check('mutation: ignoring the second direction of a two-way link is caught on the bridge', M4 && !close(M4.reliability(M4.analyze(bridge), 1), bridgeR, 1e-6));
}

// ============================================================ [2] from a formula and from a fault tree
console.log('\n[2] derived diagrams: formula and fault tree shortcuts give an editable network with the same answer');
const RB = (() => {
  const ctx = load(['rbd_net.js'], { projectConfig: { rbd: { models: [] } }, ftaConfig: { exposureTime: 10 }, ftaPages: [], slPrompt: async () => null, slConfirm: async () => true, slAlert: async () => true });
  vm.runInContext(S('rbd_module.js'), ctx, { filename: 'rbd_module.js' });
  return ctx;
})();
{
  const dsl = 'series( block(Engine, 1e-4), parallel( block(Pump A, 2e-5), block(Pump B, 2e-5) ), koon(2, block(G1,1e-4), block(G2,1e-4), block(G3,1e-4)) )';
  const st = RB._rbdParseDsl(dsl);
  let n = 0; const dg = N.fromStructure(st, () => 'id' + (++n));
  const A = N.analyze(dg);
  check('a formula becomes a network: start, end, 6 blocks, junctions and a 2-out-of-3 node', A.ok && dg.elements.filter(e => e.kind === 'block').length === 6 && dg.elements.filter(e => e.kind === 'vote').length === 1 && dg.elements.filter(e => e.kind === 'node').length >= 2);
  check('the drawn network gives the formula\'s own answer (rbd_module qOf) at 1, 100 and 5000 h', [1, 100, 5000].every(t => close(N.reliability(A, t), RB._rbdR(st, t), 1e-14)));
  check('every shape has a position and a size (it is a drawing, not a formula)', dg.elements.every(e => isFinite(e.x) && isFinite(e.y) && e.w > 0 && e.h > 0) && new Set(dg.elements.map(e => e.x + ',' + e.y)).size === dg.elements.length);
  // repeated names: the formula counted them twice, the drawing once
  const st2 = RB._rbdParseDsl('parallel( series(block(Bus, 1e-3), block(A, 1e-3)), series(block(Bus, 1e-3), block(B, 1e-3)) )');
  const A2 = N.analyze(N.fromStructure(st2));
  const t = 300, r = Math.exp(-1e-3 * t);
  check('a name used twice in a formula is one component in the drawing: R = r(1-(1-r)^2), not 1-(1-r^2)^2', close(N.reliability(A2, t), r * (1 - (1 - r) * (1 - r)), 1e-14) && close(RB._rbdR(st2, t), 1 - Math.pow(1 - r * r, 2), 1e-14));
  // fault tree dual and the check against it
  const tree = { type: 'gate', gateType: 'OR', children: [{ type: 'basic', displayId: 'BE-1', name: 'Engine fails', lambda: 1e-4 },
    { type: 'gate', gateType: 'AND', children: [{ type: 'basic', displayId: 'BE-2', name: 'Pump A', lambda: 2e-5 }, { type: 'basic', displayId: 'BE-3', name: 'Pump B', lambda: 2e-5 }] },
    { type: 'gate', gateType: 'VOTING', k: 2, children: [{ type: 'basic', displayId: 'BE-4', name: 'G1', lambda: 1e-4 }, { type: 'basic', displayId: 'BE-5', name: 'G2', lambda: 1e-4 }, { type: 'basic', displayId: 'BE-6', name: 'G3', lambda: 1e-4 }] }] };
  RB.ftaPages.push({ id: 'pg1', name: 'Loss of thrust', root: tree });
  const d = RB._rbdFromPage('pg1');
  const dd = N.fromStructure(d.structure);
  const blocks = dd.elements.filter(e => e.kind === 'block');
  check('derived from a fault tree: blocks show the event names and keep the event ids as their component', blocks.map(b => b.label).join('|') === 'Engine fails|Pump A|Pump B|G1|G2|G3' && blocks.map(b => b.props.component).join('|') === 'BE-1|BE-2|BE-3|BE-4|BE-5|BE-6');
  // independent: P(top) of the tree by hand; R = 1 - P(top)
  const T = 1000, q = l => 1 - Math.exp(-l * T), qa = q(1e-4), qp = q(2e-5) * q(2e-5), qg = 1 - (Math.pow(1 - q(1e-4), 3) + 3 * Math.pow(1 - q(1e-4), 2) * q(1e-4));
  const Ptop = 1 - (1 - qa) * (1 - qp) * (1 - qg);
  const cmp = N.compareWithStructure(dd, d.structure, T);
  check('fault tree check: the derived diagram matches the tree (same success logic, same rates) and R = 1 - P(top) by hand', cmp.ok && cmp.sameStructure && !cmp.rateDiffs.length && close(cmp.rDiagram, 1 - Ptop, 1e-13) && close(cmp.rTree, 1 - Ptop, 1e-13));
  // edit the diagram by hand: remove pump B -> the logic differs from the tree, and the check says so
  const edited = JSON.parse(JSON.stringify(dd)), pb = edited.elements.find(e => e.label === 'Pump B');
  edited.elements = edited.elements.filter(e => e !== pb); edited.connectors = edited.connectors.filter(c => c.from !== pb.id && c.to !== pb.id);
  const c2 = N.compareWithStructure(edited, d.structure, T);
  check('edited by hand (Pump B removed): the fault tree check reports a different success logic and names what the tree has', c2.ok && !c2.sameStructure && c2.missing.indexOf('BE-3') >= 0 && c2.rDiagram < c2.rTree);
  const e3 = JSON.parse(JSON.stringify(dd)); e3.elements.find(e => e.label === 'G2').props.lambda = 5e-4;
  const c3 = N.compareWithStructure(e3, d.structure, T);
  check('a failure rate changed by hand: same logic, the rate difference is named', c3.ok && c3.sameStructure && c3.rateDiffs.length === 1 && c3.rateDiffs[0].name === 'BE-5' && c3.rateDiffs[0].tree === 1e-4);
  // old models open unchanged: the legacy view is drawn with stable ids, nothing is written
  const legacy = { id: 'RBD-old', name: 'Old', dsl: null, fromPage: 'pg1' };
  RB.projectConfig.rbd.models.push(legacy, { id: 'RBD-f', name: 'Formula', dsl: dsl, fromPage: null });
  const before = JSON.stringify(RB.projectConfig.rbd);
  const v1 = RB._rbdDiagramOf(legacy), v2 = RB._rbdDiagramOf(legacy);
  check('a model saved before this build is shown as a drawing with the same ids every time, and nothing is written', JSON.stringify(v1) === JSON.stringify(v2) && JSON.stringify(RB.projectConfig.rbd) === before && RB._rbdIsLegacy(legacy) && v1.elements.length > 5);
  check('a legacy model keeps its legacy meaning (rbd_module qOf on the live tree)', close(RB._rbdR(RB._rbdFromPage('pg1').structure, T), 1 - Ptop, 1e-13));
}

// ============================================================ [3] the cross-check
console.log('\n[3] rbd_xcheck.js v0.3: a drawn network is computed four ways and they must agree');
{
  const XC = require(path.join(SITE, 'rbd_xcheck.js'));
  const a = 0.9, b = 0.8, c = 0.7, d = 0.6, x = 0.95;
  const bridge = { elements: [el('S', 'start'), el('E', 'end'), el('A', 'block', { lambda: L(a) }), el('B', 'block', { lambda: L(b) }), el('C', 'block', { lambda: L(c) }), el('D', 'block', { lambda: L(d) }), el('X', 'block', { lambda: L(x) }), el('n1', 'node'), el('n2', 'node')],
    connectors: [ln('S', 'A'), ln('S', 'B'), ln('A', 'n1'), ln('B', 'n2'), ln('n1', 'X', 'link2'), ln('X', 'n2', 'link2'), ln('n1', 'C'), ln('n2', 'D'), ln('C', 'E'), ln('D', 'E')] };
  const r = XC.xcheckNet(bridge, 1);
  check('bridge: decision diagram, enumeration, path-set and cut-set inclusion-exclusion all run and agree', r.agree && r.legs.length === 4 && r.legs.every(l => close(l.r, 0.85966, 1e-12)), JSON.stringify(r.legs));
  check('an incomplete diagram is refused, not computed', throws(() => XC.xcheckNet({ elements: [el('S', 'start')], connectors: [] }, 1), /not complete/));
  // a disagreement is a refusal: break the cut-set leg
  const src = S('rbd_xcheck.js').replace("legs.push({ id: 'cut', label: cuts.length + ' minimal cut sets', r: 1 - _unionProb(cuts, p.map(x => 1 - x)) });", "legs.push({ id: 'cut', label: cuts.length + ' minimal cut sets', r: 1 - _unionProb(cuts, p) });");
  const ctx = { console, module: { exports: {} }, require: q => require(path.join(SITE, path.basename(q))) }; vm.createContext(ctx); vm.runInContext(src, ctx, { filename: 'rbd_xcheck_mut.js' });
  check('mutation: a wrong cut-set leg throws DISAGREEMENT instead of showing a number', throws(() => ctx.module.exports.xcheckNet(bridge, 1), /DISAGREEMENT/));
  // INV-33 sweeps drawn diagrams too
  const XG = load(['rbd_net.js'], { invRegister: () => {}, projectConfig: { rbd: { models: [{ id: 'R1', name: 'Bridge', diagram: bridge }, { id: 'R2', name: 'Formula', dsl: 'series(block(a, 1e-4), block(b, 1e-4))' }] } }, ftaConfig: { exposureTime: 1 } });
  vm.runInContext(S('rbd_module.js'), XG); vm.runInContext(S('rbd_xcheck.js'), XG);
  const inv = XG.RBD_XCHECK._invRun();
  check('INV-33 checks drawn and formula models alike, no findings', inv.checked === 2 && inv.fails.length === 0, JSON.stringify(inv));
}

// ============================================================ [4] Markov: two views of one model
console.log('\n[4] markov_diagram.js: the state diagram and the tables are two views of one model');
const MD = load(['markov_ctmc.js', 'markov_diagram.js']).SLMarkovDiagram;
const MCT = require(path.join(SITE, 'markov_ctmc.js'));
const QM = load(['fta_quant_modules.js', 'markov_ctmc.js', 'markov_diagram.js'], { projectConfig: { markovModels: [] }, ftaConfig: { exposureTime: 3 } });
QM.renderMarkovModels = () => {}; QM.scheduleAutosave = () => {};
// the Halcyon showcase model, exactly as the demo stores it (no ids, no positions, no start)
const HAL = () => ({ id: 'mkv-powertrain', name: 'Hybrid powertrain', states: [{ name: 'Both paths available', isFailed: false }, { name: 'Generation path only', isFailed: false }, { name: 'Store path only', isFailed: false }, { name: 'No propulsion energy', isFailed: true }],
  transitions: [{ from: 'Both paths available', to: 'Generation path only', rate: 3.3e-5 }, { from: 'Both paths available', to: 'Store path only', rate: 5.3e-5 }, { from: 'Generation path only', to: 'No propulsion energy', rate: 5.3e-5 },
    { from: 'Store path only', to: 'No propulsion energy', rate: 3.3e-5 }, { from: 'Generation path only', to: 'Both paths available', rate: 2.0e-3 }, { from: 'Store path only', to: 'Both paths available', rate: 2.0e-3 }] });
{
  const m = HAL(), d = MD.toDiagram(m);
  check('an old model is drawn: a start, 4 states (3 operational, 1 failed), a start arrow and 6 transitions', d.elements.filter(e => e.kind === 'start').length === 1 && d.elements.filter(e => e.kind === 'operational').length === 3 && d.elements.filter(e => e.kind === 'failed').length === 1 && d.connectors.filter(c => c.kind === 'initial').length === 1 && d.connectors.filter(c => c.kind === 'failure' || c.kind === 'repair').length === 6);
  check('drawing it twice gives the same ids and positions, and the model is not written to', JSON.stringify(MD.toDiagram(m)) === JSON.stringify(d) && JSON.stringify(m) === JSON.stringify(HAL()));
  const kinds = d.connectors.filter(c => c.kind !== 'initial').map(c => c.kind).join(',');
  check('restorations back toward the start are drawn as repairs (mu), the rest as failures (lambda)', kinds === 'failure,failure,failure,failure,repair,repair', kinds);
  // save the drawing back: the math does not move
  const m2 = HAL(); MD.applyDiagram(m2, JSON.parse(JSON.stringify(d)));
  const T = 3, s1 = MCT.solveMarkovTransient(HAL(), T), s2 = MCT.solveMarkovTransient(m2, T), ss1 = QM.solveMarkovModel(HAL()), ss2 = QM.solveMarkovModel(m2);
  check('drawing and saving back changes no number (transient at T and steady state identical)', s1.pFailed === s2.pFailed && ss1.pFailed === ss2.pFailed && JSON.stringify(ss1.pi) === JSON.stringify(ss2.pi));
  check('saved back: stable ids, positions, start, transition kinds; names, rates and order unchanged', m2.states.every((s, i) => s.id === 'st-' + i && isFinite(s.x) && s.name === HAL().states[i].name) && m2.initialState === 'Both paths available' && m2.transitions.every((t, i) => t.rate === HAL().transitions[i].rate && t.from === HAL().transitions[i].from && (t.kind === 'failure' || t.kind === 'repair')));
  check('round trip: drawing the saved model gives the same drawing', JSON.stringify(MD.toDiagram(m2)) === JSON.stringify(d));
  // rename on the diagram: transitions and the start follow (they are joined by id, not by name)
  const d3 = MD.toDiagram(m2); d3.elements.find(e => e.id === 'st-0').label = 'Both up';
  MD.applyDiagram(m2, d3);
  check('a state renamed on the diagram is renamed in its transitions and as the start', m2.states[0].name === 'Both up' && m2.transitions.filter(t => t.from === 'Both up').length === 2 && m2.transitions.filter(t => t.to === 'Both up').length === 2 && m2.initialState === 'Both up' && MCT.solveMarkovTransient(m2, T).pFailed === s1.pFailed);
  // degraded and failed types; an absorbing state is named
  const d4 = MD.toDiagram(m2); d4.elements.find(e => e.id === 'st-1').kind = 'degraded'; MD.applyDiagram(m2, d4);
  check('a degraded state is stored as degraded and still counts as working', m2.states[1].degraded === true && m2.states[1].isFailed === false && MCT.solveMarkovTransient(m2, T).pFailed === s1.pFailed);
  check('the checks name the absorbing state', MD.checks(m2).some(x => /absorbing.*No propulsion energy/.test(x)));
  // a starting distribution: linearity gives the independent expected value
  const d5 = MD.toDiagram(m2); d5.connectors.find(c => c.kind === 'initial').props.p = 0.7;
  d5.connectors.push({ id: 'i2', kind: 'initial', from: 'mk-start', to: 'st-1', props: { p: 0.3 } });
  MD.applyDiagram(m2, d5);
  const expect = 0.7 * MCT.solveMarkovTransient(m2, 50, { initial: 'Both up' }).pFailed + 0.3 * MCT.solveMarkovTransient(m2, 50, { initial: 'Generation path only' }).pFailed;
  check('two start arrows (0.7 and 0.3) are a starting distribution; the transient answer is the weighted sum', JSON.stringify(m2.initialProbs) === JSON.stringify({ 'Both up': 0.7, 'Generation path only': 0.3 }) && m2.initialState === undefined && close(MCT.solveMarkovTransient(m2, 50).pFailed, expect, 1e-15));
  const bad = JSON.parse(JSON.stringify(m2)); bad.initialProbs['Both up'] = 0.6;
  check('a starting distribution that does not add up to 1 is refused by name (not rescaled)', !MCT.solveMarkovTransient(bad, 50).ok && /add up to 0\.9/.test(MCT.validateMarkovModel(bad).errors.join(' ')));
  const ph = MCT.solveMarkovPhased(m2, { phases: [{ name: 'P1', duration: 20 }, { name: 'P2', duration: 30 }] });
  check('the phased solve starts from the distribution too (one model over two phases = one transient over the sum)', ph.ok && close(ph.pFailed, MCT.solveMarkovTransient(m2, 50).pFailed, 1e-13));
  check('a model with no starting distribution solves exactly as before (no initialProbs, same number)', MCT.solveMarkovTransient(HAL(), 50).pFailed === MCT.solveMarkovTransient(Object.assign(HAL(), {}), 50).pFailed);
  // a self-loop cannot be drawn
  const E = load(['diagram_editor.js', 'markov_ctmc.js', 'markov_diagram.js']); E.SLMarkovDiagram.register();
  const def = E.SLDiagramEditor.getDiagram('markov'), st = new E.SLDiagramEditor.core.Store(def, MD.toDiagram(HAL()));
  const r = E.SLDiagramEditor.core.canConnect(def, st, 'st-0', 'st-0', 'failure');
  check('a transition from a state back to itself cannot be drawn (refused in plain words)', !r.ok && /cannot connect a shape to itself/.test(r.reason));
  check('from the start, only a start arrow can be drawn', !E.SLDiagramEditor.core.canConnect(def, st, 'mk-start', 'st-1', 'failure').ok && E.SLDiagramEditor.core.canConnect(def, st, 'mk-start', 'st-1', 'initial').ok);
  // the tables (fta_quant_modules.js) write the same fields the diagram reads
  QM.projectConfig.markovModels = [HAL()];
  QM.setMarkovStateField('mkv-powertrain', 'Both paths available', 'name', 'All up');
  const qm = QM.projectConfig.markovModels[0];
  check('tables: renaming a state carries the rename into its transitions, and ids are assigned on the first edit', qm.states[0].name === 'All up' && qm.states.every((s, i) => s.id === 'st-' + i) && qm.transitions.filter(t => t.from === 'All up').length === 2);
  QM.setMarkovStateField('mkv-powertrain', 'Store path only', 'type', 'degraded');
  QM.setMarkovStateField('mkv-powertrain', 'All up', 'start', '0.5'); QM.setMarkovStateField('mkv-powertrain', 'Store path only', 'start', '0.5');
  check('tables: type and starting probabilities are the same fields the diagram draws', qm.states[2].degraded === true && JSON.stringify(qm.initialProbs) === JSON.stringify({ 'All up': 0.5, 'Store path only': 0.5 }) && MD.toDiagram(qm).connectors.filter(c => c.kind === 'initial').length === 2 && MD.toDiagram(qm).elements.find(e => e.id === 'st-2').kind === 'degraded');
  QM.setMarkovStateField('mkv-powertrain', 'All up', 'start', '1');
  check('tables: one start at 1 goes back to a plain starting state', qm.initialState === 'All up' && qm.initialProbs === undefined);
  QM.setMarkovTransition('mkv-powertrain', 4, 'kind', 'repair');
  check('tables: a transition marked repair is drawn dashed as a repair', qm.transitions[4].kind === 'repair' && MD.toDiagram(qm).connectors.find(c => c.id === 'tr-4').kind === 'repair');
  check('tables and diagram infer failure or repair with one rule', QM._markovTransitionKind(HAL(), HAL().transitions[5]) === 'repair' && QM._markovTransitionKind(HAL(), HAL().transitions[0]) === 'failure');
  // a basic event linked to a Markov model still quantifies from it
  const W = load(['markov_ctmc.js'], { effectiveProb: () => -1, getMarkovModel: id => (id === 'mkv-powertrain' ? HAL() : null), ftaConfig: { exposureTime: 7 } });
  check('a basic event with markovModelId still takes P(failed at its exposure time) from the model', close(W.effectiveProb({ markovModelId: 'mkv-powertrain' }, 7), MCT.solveMarkovTransient(HAL(), 7).pFailed, 0) && W.effectiveProb({}, 7) === -1);
  // phases shown per phase: rates scaled except repairs out of a failed state; or the other model
  const pm = HAL(); pm.transitions.push({ from: 'No propulsion energy', to: 'Both paths available', rate: 0.05 }); pm.phasePlan = { enabled: true, overrides: { Takeoff: { mult: 3 } } };
  const view = MD.phaseModel(pm, 'Takeoff').model;
  check('a phase with a rate multiplier is drawn with the failure rates scaled and the repair out of the failed state unchanged (as the phased solver reads it)', view.transitions[0].rate === 3 * 3.3e-5 && view.transitions[6].rate === 0.05 && pm.transitions[0].rate === 3.3e-5);
}

// ============================================================ [5] SysML v2 export / import
console.log('\n[5] SysML v2: drawn RBDs and the new Markov fields go out and come back');
const SYS = (() => { const ctx = { console, TextEncoder, TextDecoder, Uint8Array }; vm.createContext(ctx); vm.runInContext(S('sysml_model.js'), ctx, { filename: 'sysml_model.js' }); return ctx.SLSysML; })();
const C = SYS.core;
const emptyProject = () => ({ projectName: 'RBD and Markov', acFunctionsData: [], acFcimData: [], acFhaData: [], acReqData: [], acAssumptionsData: [], systemsData: [{ id: 'hyd', name: 'Hydraulics' }], praData: [], zsaData: [], cmaData: [], routingData: [], resourcesData: [], fmeaData: [],
  itemsData: [{ internalId: 501, itemId: 'PMP-A', name: 'Pump A', type: 'LRU', dal: 'B', daType: 'Hardware', owningSystemId: 'hyd', description: '', traceIds: [] }],
  stpaData: { cs: { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] }, dispositions: {}, causeDismissals: {}, scopeFcIds: [], meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' }, losses: [], hazards: [], constraints: [], responsibilities: [], csState: 'initial', sip: {} },
  ftaPages: [{ id: 'page-1', name: 'Untitled Fault Tree', root: null }], activeFTAPageId: 'page-1', internalIdCounter: 1, projectConfig: { regulation: 'Part 25', markovModels: [], interfaces: [], customLibrary: {}, sysml: { ns: '11111111-2222-4333-8444-555555555555' } } });
const P = emptyProject();
const drawn = { elements: [el('S', 'start', {}, 'Start'), el('E', 'end', {}, 'End'), el('A', 'block', { lambda: 1e-4, mu: 0.1 }, 'Pump A'), el('B', 'block', { lambda: 1e-4, component: 'A' }, 'Pump A'), el('G', 'standby', { lambda: 2e-4, units: 3, warmK: 0.1, switchP: 0.98 }, 'Generators'), el('j', 'node', {}, '')],
  connectors: [ln('S', 'A'), ln('S', 'j'), ln('j', 'G'), ln('G', 'B'), ln('A', 'E'), ln('B', 'E')] };
drawn.elements[2].sysmlRef = 'item:501';
drawn.elements[3].props.mu = 0.1;
P.projectConfig.rbd = { models: [{ id: 'RBD-D', name: 'Drawn supply', dsl: null, fromPage: null, diagram: drawn }] };
const mk = HAL(); MD.applyDiagram(mk, MD.toDiagram(mk)); mk.states[1].degraded = true; mk.initialProbs = { 'Both paths available': 0.9, 'Generation path only': 0.1 }; delete mk.initialState; mk.transitions[4].kind = 'repair'; mk.states[0].sysmlRef = 'sys:hyd';
P.projectConfig.markovModels = [mk];
const out = C.exportText(P, { at: '2026-10-13' });
const txt = out.text;
check('the drawn RBD exports one part per component (a block drawn twice is one part, places = 2) and a StandbyGroup with its settings', /part 'Pump A' : SafetyLab::RbdBlock \{[\s\S]*?:>> places = 2;/.test(txt) && /part '?Generators'? : SafetyLab::StandbyGroup \{[\s\S]*?:>> units = 3;[\s\S]*?:>> dormancyFactor = 0\.1;[\s\S]*?:>> switchSuccess = 0\.98;/.test(txt), txt.split('\n').filter(l => /Rbd|Standby|places/.test(l)).join(' | '));
check('the block\'s model link goes out as an About dependency to the item', /#About dependency from [^;]*'Pump A' to [^;]*'Pump A'/.test(txt) || /#About dependency from .*Pump A.* to .*PMP-A/.test(txt) || out.links >= 1);
check('the Markov export carries degraded, starting probabilities, the start as entry and the repair flag', /:>> degraded = true;/.test(txt) && /:>> initialProbability = 0\.9;/.test(txt) && /entry; then 'Both paths available';/.test(txt) && /@Rate \{ :>> perHour = 0\.002; :>> repair = true; \}/.test(txt));
const Q = emptyProject(); Q.itemsData = P.itemsData.slice(); Q.systemsData = P.systemsData.slice();
const plan = C.planImport(Q, [{ name: 'x.sysml', text: txt }, { name: 'SafetyLab.sysml', text: SYS.LIBRARY_TEXT }]);
let idn = 0; C.applyImport(Q, plan, { newId: () => 'q' + (idn++) });
const qr = (Q.projectConfig.rbd || {}).models || [], qk = Q.projectConfig.markovModels || [];
check('import rebuilds the same drawing (shapes, links, positions, rates, repeated block, standby settings, model link)', qr.length === 1 && JSON.stringify(qr[0].diagram) === JSON.stringify(drawn) && qr[0].dsl === null, JSON.stringify(qr[0] && qr[0].diagram).slice(0, 300));
check('import brings back degraded, the starting distribution and the repair kind', qk.length === 1 && qk[0].states[1].degraded === true && JSON.stringify(qk[0].initialProbs) === JSON.stringify(mk.initialProbs) && qk[0].transitions[4].kind === 'repair' && qk[0].states[0].sysmlRef === 'sys:hyd', JSON.stringify(qk[0]).slice(0, 400));
check('export, import, export again: the same text', C.exportText(Q, { at: '2026-10-13' }).text === txt);
{
  const one = HAL(); one.initialState = 'Store path only';
  const P2 = emptyProject(); P2.projectConfig.markovModels = [one];
  const t2 = C.exportText(P2, { at: '2026-10-13' }).text, Q2 = emptyProject();
  C.applyImport(Q2, C.planImport(Q2, [{ name: 'y', text: t2 }]), { newId: () => 'r' + (idn++) });
  check('a start state other than the first comes back as the start', /entry; then 'Store path only';/.test(t2) && Q2.projectConfig.markovModels[0].initialState === 'Store path only');
}
// the two validators, when installed (same harness as regression_sysml_v2_20261013b)
const VDIRS = [process.env.SL_SYSML_VALIDATORS, path.join(REPO, 'tools/sysml'), path.join(REPO, '..', 'syslab', 'tools', 'sysml'), path.join(REPO, '..', 'sys-lab', 'tools', 'sysml')].filter(Boolean);
const VD = VDIRS.find(d => fs.existsSync(path.join(d, 'node_modules/.bin/sysml-validate')) && fs.existsSync(path.join(d, 'node_modules/@openmbee/opensysml')));
if (!VD) { skips.push('SysML v2 validators not installed (npm install in tools/sysml)'); console.log('  SKIP  ' + skips[skips.length - 1]); }
else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-rbdmk-'));
  const lib = path.join(tmp, 'SafetyLab.sysml'), f = path.join(tmp, 'model.sysml'), both = path.join(tmp, 'both.sysml');
  fs.writeFileSync(lib, SYS.LIBRARY_TEXT); fs.writeFileSync(f, txt); fs.writeFileSync(both, SYS.LIBRARY_TEXT + '\n' + txt);
  const r1 = cp.spawnSync(path.join(VD, 'node_modules/.bin/sysml-validate'), [lib, f, '--format', 'json'], { encoding: 'utf8', timeout: 280000, maxBuffer: 1 << 28 });
  let diags = []; try { diags = (JSON.parse(r1.stdout).diagnostics || []).filter(d => /error|warn/i.test(d.severity || '')).map(d => d.code + ' ' + d.message + ' @' + (d.range && d.range.start.line)); } catch (e) { diags = ['no report ' + String(r1.stdout + r1.stderr).slice(0, 200)]; }
  check('sysml-validate: the library and the RBD + Markov export parse and link cleanly', diags.length === 0, diags.slice(0, 5).join(' | '));
  const OMB = path.join(REPO, 'tools/sysml/openmbee-check.mjs');
  // the checker must sit beside the validators' node_modules to find them (as in regression_sysml_v2_20261013b)
  const own = path.resolve(VD) === path.resolve(path.dirname(OMB)), mjs = own ? OMB : path.join(VD, '_sl_rbdmk_openmbee_check.mjs');
  if (!own) fs.copyFileSync(OMB, mjs);
  const r2 = cp.spawnSync('node', [mjs, both], { encoding: 'utf8', timeout: 240000, cwd: VD, maxBuffer: 1 << 28 });
  if (!own) { try { fs.unlinkSync(mjs); } catch (_) {} }
  let od = null; String(r2.stdout).trim().split('\n').forEach(l => { try { const j = JSON.parse(l); if (j.file === both) od = j.diagnostics.filter(d => /error|warn/i.test(d.severity || '')).map(d => d.code + ' ' + d.message + ' @' + d.startLine); } catch (_) {} });
  check('OpenMBEE: the RBD + Markov export with the library parses and links cleanly', od && od.length === 0, od ? od.slice(0, 5).join(' | ') : String(r2.stderr).slice(0, 300));
}

// ============================================================ [6] wiring and house rules
console.log('\n[6] wiring, versions, plain words');
{
  const idx = S('index.html'), pos = f => idx.indexOf(f);
  check('index.html: rbd_net.js loads right before rbd_module.js, after diagram_editor.js', /<script src="rbd_net\.js\?v=1\.0" defer><\/script>\s*<script src="rbd_module\.js\?v=2\.0" defer><\/script>/.test(idx) && pos('rbd_net.js') > pos('diagram_editor.js'));
  check('index.html: markov_diagram.js loads right after markov_ctmc.js', /<script src="markov_ctmc\.js\?v=1\.4" defer><\/script>\s*<!--[^>]*-->\s*<script src="markov_diagram\.js\?v=1\.0" defer><\/script>/.test(idx));
  check('index.html: versions bumped (diagram_editor 1.3, rbd_xcheck 0.3, sysml_model 1.3, fta_quant_modules 66.28; 1.3 after the integrate3 merge)', /diagram_editor\.js\?v=1\.[34]"/.test(idx) && /rbd_xcheck\.js\?v=0\.3"/.test(idx) && /sysml_model\.js\?v=1\.3"/.test(idx) && /fta_quant_modules\.js\?v=66\.(2[89]|[3-9]\d)"/.test(idx));
  const files = ['rbd_net.js', 'rbd_module.js', 'rbd_xcheck.js', 'markov_diagram.js', 'markov_ctmc.js', 'fta_quant_modules.js', 'sysml_model.js', 'diagram_editor.js'];
  check('every changed file carries a dated 13 Oct 2026 note', files.every(f => /13 Oct 2026/.test(S(f).slice(0, 3000))), files.filter(f => !/13 Oct 2026/.test(S(f).slice(0, 3000))).join(','));
  check('the library file and the copy embedded in sysml_model.js are identical', SYS.LIBRARY_TEXT === S('sysml_safety_lib.sysml'));
  check('no em dash in the new files', !/—/.test(S('rbd_net.js')) && !/—/.test(S('markov_diagram.js')));
  check('no native dialogs in the new code', !/\b(alert|confirm|prompt)\(/.test(S('rbd_net.js').replace(/sl(Alert|Confirm|Prompt)\(/g, '')) && !/[^.\w](alert|confirm|prompt)\(/.test(S('markov_diagram.js')) && !/[^.\w](alert|confirm|prompt)\(/.test(S('rbd_module.js').replace(/sl(Alert|Confirm|Prompt)\(/g, '')));
  const MDsrc = S('markov_diagram.js');
  check('Markov diagram editors mount only when their card scrolls into view (IntersectionObserver) and are kept across table redraws', /new IntersectionObserver/.test(MDsrc) && /rec\.ed\.reload\(\)/.test(MDsrc));
}

// ============================================================ [7] the real app in Chromium
console.log('\n[7] the real app in Chromium, Halcyon showcase');
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) { try { chromium = require('/opt/npm-tools/node_modules/playwright').chromium; } catch (_) {} }
if (!chromium) { skips.push('playwright is not installed: browser checks not run'); console.log('  SKIP  ' + skips[skips.length - 1]); finish(); }
else browser().then(finish, e => { check('browser run finished', false, e && e.stack); finish(); });

function finish() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (skips.length ? ', ' + skips.length + ' SKIPPED: ' + skips.join(' ') : ''));
  process.exit(fail ? 1 : 0);
}

async function browser() {
  const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.sysml': 'text/plain' };
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(SITE, p); if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  let b;
  try { b = await chromium.launch(); } catch (e) { skips.push('no Chromium (' + String(e.message).split('\n')[0] + ')'); console.log('  SKIP  ' + skips[skips.length - 1]); srv.close(); return; }
  const page = await b.newPage({ viewport: { width: 1500, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const E = (fn, arg) => page.evaluate(fn, arg);
  const wait = async ms => { await page.waitForTimeout(ms || 80); if ((ms || 80) >= 150) { await page.waitForTimeout(650); await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).some(x => /^(Acknowledge|Keep change)$/.test(x.textContent.trim()) && x.offsetParent), null, { timeout: 5000 }).catch(() => {}); } };
  try {
    await page.goto('http://127.0.0.1:' + srv.address().port + '/?demo=halcyon');
    await page.waitForFunction(() => typeof window.loadHalcyonDemo === 'function' && window.SLDiagramEditor && window.RBD_NET && window.SLMarkovDiagram, null, { timeout: 30000 });
    await wait(1500);
    await E(async () => {
      window.slConfirm = async () => true;
      const ung = () => { document.querySelectorAll('[aria-label="Sign in to Safety Lab Aero"]').forEach(g => g.remove()); document.documentElement.classList.remove('sl-auth-gate-blocked'); const t = document.getElementById('signup-modal-title'); if (t) { let o = t; while (o && o.parentElement && o.parentElement !== document.body) o = o.parentElement; if (o) o.style.display = 'none'; } document.querySelectorAll('.modal-overlay, .modal').forEach(o => { if (getComputedStyle(o).display !== 'none' && !o.closest('.sde') && o.id !== 'sl-dialog-overlay' && o.id !== 'sl-ack-overlay') o.style.display = 'none'; }); document.querySelectorAll('.toast, .sl-toast').forEach(x => x.remove()); };
      window.__ung = ung; ung(); window._ramHasAccess = () => true;
      await loadHalcyonDemo(); await new Promise(r => setTimeout(r, 1200)); ung();
      if (window.SLChangeAck && SLChangeAck.flush) { window.__ackAuto = true; }
    });
    // every change asks for acknowledgement (change_ack.js): answer "Acknowledge" whenever it shows, and count them
    await E(() => { window.__acks = 0; setInterval(() => { const k = Array.from(document.querySelectorAll('button')).find(x => /^(Acknowledge|Keep change)$/.test(x.textContent.trim()) && x.offsetParent); if (k) { window.__acks++; window.__lastAck = (k.closest('[role=dialog], .sl-ack-card') || document.body).textContent.slice(0, 300); k.click(); } }, 60); });
    const snap = () => E(() => JSON.stringify({ rbd: projectConfig.rbd, mk: projectConfig.markovModels }));
    const before = await snap();

    // ---------------- Markov: the old showcase model opens unchanged
    await E(() => { switchTab('markov'); __ung(); const c = document.querySelector('.mk-card'); c && c.scrollIntoView(); });
    await page.waitForFunction(() => document.querySelector('.mk-card .sde .sde-el'), null, { timeout: 8000 });
    await wait(300);
    check('browser: the Halcyon Markov model is drawn above its tables (4 states, the start, 6 transitions and a start arrow)', await E(() => { const ed = SLMarkovDiagram.editor('mkv-powertrain'); const m = ed.model(); return m.elements.length === 5 && m.connectors.length === 7; }));
    check('browser: opening the old Markov model and the RBD page writes nothing (project data identical)', (await snap()) === before);
    // ---------------- Markov: draw a model from blank with the mouse
    await E(() => { addMarkovModel(); });
    await wait(300);
    const newId = await E(() => projectConfig.markovModels[projectConfig.markovModels.length - 1].id);
    await E(id => { const c = document.querySelector('.mk-card[data-mk-id="' + id + '"]'); c.scrollIntoView({ block: 'start' }); window.scrollBy(0, -10); __ung(); }, newId);
    await page.waitForFunction(id => SLMarkovDiagram.editor(id), newId, { timeout: 8000 });
    await wait(200);
    const host = '.mk-card[data-mk-id="' + newId + '"]';
    const cv = await page.locator(host + ' .sde-canvas').boundingBox();
    const tool = await page.locator(host + ' .sde-tool[data-kind="degraded"]').boundingBox();
    await page.mouse.move(tool.x + 20, tool.y + 10); await page.mouse.down(); await page.mouse.move(cv.x + cv.width * 0.5, cv.y + cv.height * 0.75, { steps: 8 }); await page.mouse.up(); await wait(250);
    let mm = await E(id => projectConfig.markovModels.find(m => m.id === id), newId);
    check('browser: the diagram edit went through the change acknowledgement (one per gesture, named in plain words)', await E(() => window.__acks >= 1 && /Add degraded state/.test(window.__lastAck || '')), await E(() => window.__lastAck));
    check('browser: a degraded state dragged from the toolbox is a new state in the model (and in the table)', mm.states.length === 3 && mm.states[2].degraded === true && await E(id => document.querySelectorAll('.mk-card[data-mk-id="' + id + '"] tbody')[0].querySelectorAll('tr').length === 3, newId));
    const ed = () => `SLMarkovDiagram.editor(${JSON.stringify(newId)})`;
    const at = (id, fx, fy) => E(([eid, id2, fx2, fy2]) => { const e = SLMarkovDiagram.editor(eid); const x = e.model().elements.find(q => q.id === id2); const v = e.getView(); const r = e.root.querySelector('.sde-canvas').getBoundingClientRect(); return { x: r.left + v.x + (x.x + x.w * (fx2 == null ? 0.5 : fx2)) * v.k, y: r.top + v.y + (x.y + x.h * (fy2 == null ? 0.5 : fy2)) * v.k }; }, [newId, id, fx, fy]);
    const ids = await E(id => SLMarkovDiagram.editor(id).model().elements.map(e => e.id + ':' + e.kind), newId);
    const idOf = k => ids.find(s => s.endsWith(':' + k)).split(':')[0];
    const working = ids.find(s => s.endsWith(':operational')).split(':')[0], deg = idOf('degraded');
    // connect Working -> Degraded by dragging from a dot: two kinds fit, the chooser asks
    let p1 = await at(working); await page.mouse.move(p1.x, p1.y); await wait(100);
    const dot = await E(([eid, sid]) => { const c = SLMarkovDiagram.editor(eid).root.querySelector('.sde-port[data-el="' + sid + '"][data-port="s"]').getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; }, [newId, working]);
    await page.mouse.move(dot.x, dot.y, { steps: 3 }); await page.mouse.down();
    const p2 = await at(deg); await page.mouse.move(p2.x, p2.y, { steps: 10 }); await page.mouse.up(); await wait(150);
    check('browser: dragging a transition between two states asks failure or repair', await E(id => !!SLMarkovDiagram.editor(id).root.querySelector('.sde-menu'), newId));
    if (process.env.SL_SHOTS) await page.screenshot({ path: path.join(process.env.SL_SHOTS, 'mk_chooser.png') });
    await page.locator(host + ' .sde-menu button', { hasText: 'Failure' }).click({ timeout: 5000 }); await wait(250);
    // set its rate in the properties panel
    await page.locator(host + ' .sde-props input[data-key="props.rate"]').fill('4e-4'); await page.keyboard.press('Enter'); await wait(300);
    mm = await E(id => projectConfig.markovModels.find(m => m.id === id), newId);
    const tr = mm.transitions.find(t => t.to === mm.states[2].name);
    check('browser: the new failure transition and its rate typed in the panel are in the model and the table', tr && tr.rate === 4e-4 && tr.kind === 'failure' && await E(id => Array.from(document.querySelectorAll('.mk-card[data-mk-id="' + id + '"] input[type=number]')).some(i => Number(i.value) === 4e-4), newId));
    check('browser: the diagram labels it lambda = 4e-4', await E(id => /λ = 4e-4/.test(SLMarkovDiagram.editor(id).root.querySelector('.sde-gcn').textContent), newId));
    // undo in the diagram takes the rate back, then the transition
    await E(id => SLMarkovDiagram.editor(id).root.querySelector('.sde-canvas').focus(), newId);
    await page.keyboard.press('Control+z'); await wait(300);
    mm = await E(id => projectConfig.markovModels.find(m => m.id === id), newId);
    check('browser: Ctrl+Z in the diagram undoes the rate edit (the diagram keeps its undo history across the table redraw)', mm.transitions.find(t => t.to === mm.states[2].name).rate === 0);
    const focusCanvas = () => E(id => SLMarkovDiagram.editor(id).root.querySelector('.sde-canvas').focus(), newId);   // as the user clicks back into the diagram after acknowledging
    await focusCanvas(); await page.keyboard.press('Control+z'); await wait(300);
    mm = await E(id => projectConfig.markovModels.find(m => m.id === id), newId);
    check('browser: a second Ctrl+Z removes the transition again', !mm.transitions.some(t => t.to === mm.states[2].name));
    await focusCanvas(); await page.keyboard.press('Control+Shift+z'); await wait(300);
    mm = await E(id => projectConfig.markovModels.find(m => m.id === id), newId);
    check('browser: redo brings it back', mm.transitions.some(t => t.to === mm.states[2].name));
    // a self-loop is refused
    await E(() => { window.__toasts = []; const o = window.showToast; window.showToast = function (m) { __toasts.push(m); return o && o.apply(this, arguments); }; });
    const nb = mm.transitions.length;
    await E(([eid, sid]) => SLMarkovDiagram.editor(eid).connect(sid, sid, 'failure'), [newId, working]); await wait(200);
    check('browser: a self-loop is refused with a plain message and nothing is added', (await E(id => projectConfig.markovModels.find(m => m.id === id).transitions.length, newId)) === nb && await E(() => __toasts.some(t => /cannot connect a shape to itself/.test(t))));
    // edit the table: the diagram follows
    await E(id => { const m = projectConfig.markovModels.find(x => x.id === id); setMarkovStateField(id, m.states[0].name, 'name', 'Normal'); }, newId); await wait(300);
    check('browser: renaming a state in the table renames it on the diagram (same model)', await E(id => SLMarkovDiagram.editor(id).model().elements.some(e => e.label === 'Normal'), newId));
    // rename on the diagram (double-click): the table follows, transitions follow
    const pw = await at(working); await page.mouse.dblclick(pw.x, pw.y); await wait(150);
    await page.keyboard.press('Control+a'); await page.keyboard.type('Nominal'); await page.keyboard.press('Enter'); await wait(350);
    mm = await E(id => projectConfig.markovModels.find(m => m.id === id), newId);
    check('browser: renaming on the diagram renames the state in the table and in its transitions', mm.states[0].name === 'Nominal' && mm.transitions.every(t => t.from !== 'Normal' && t.to !== 'Normal') && mm.transitions.some(t => t.from === 'Nominal') && mm.initialState === 'Nominal');
    check('browser: the solver still answers for the hand-drawn model (P(failed) shown in the card)', await E(id => /P\(failed\) = \d/.test(document.querySelector('.mk-card[data-mk-id="' + id + '"]').textContent), newId));
    // a basic event linked to the Halcyon model still quantifies from it
    check('browser: a basic event linked to a Markov model (markovModelId) still takes the Markov answer', await E(() => { const m = getMarkovModel('mkv-powertrain'); const r = solveMarkovTransient(m, 2); return Math.abs(effectiveProb({ type: 'basic', markovModelId: 'mkv-powertrain', exposureMode: 'continuous' }, 2) - r.pFailed) < 1e-15; }));

    // ---------------- Markov: mission phases edited by hand and shown per phase
    await E(() => { const c = document.querySelector('.mk-card[data-mk-id="mkv-powertrain"]'); c.scrollIntoView(); const d = c.querySelector('details.mk-phases'); if (d) d.open = true; });
    await wait(200);
    const phases = await E(() => (MARKOV_CTMC.phaseSequence().seq || []).map(p => p.name));
    check('browser: the Mission phases section lists the project\'s flight phases', phases.length >= 2 && await E(n => document.querySelectorAll('.mk-card[data-mk-id="mkv-powertrain"] [data-mk-plan="mult"]').length === n, phases.length), phases.join(','));
    await page.locator('.mk-card[data-mk-id="mkv-powertrain"] [data-mk-plan="enabled"]').check(); await wait(400);
    await E(() => { const d = document.querySelector('.mk-card[data-mk-id="mkv-powertrain"] details.mk-phases'); if (d) d.open = true; });
    const mi = page.locator('.mk-card[data-mk-id="mkv-powertrain"] [data-mk-plan="mult"]').first();
    await mi.fill('4'); await mi.press('Tab'); await wait(500);
    const plan = await E(() => JSON.stringify(getMarkovModel('mkv-powertrain').phasePlan));
    check('browser: enabling phases and typing a multiplier writes the phase plan the phased solver reads', /"enabled":true/.test(plan) && new RegExp('"' + phases[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '":\\{"mult":4\\}').test(plan), plan);
    check('browser: the phased answer now quantifies events linked to the model (effectiveProb = solveMarkovPhased)', await E(() => { const r = solveMarkovPhased(getMarkovModel('mkv-powertrain')); return r.ok && Math.abs(effectiveProb({ type: 'basic', markovModelId: 'mkv-powertrain' }, 2) - r.pFailed) < 1e-15 && /\d\.\d{3}e/.test(document.querySelector('.mk-card[data-mk-id="mkv-powertrain"] details.mk-phases').textContent); }));
    await E(() => { const d = document.querySelector('.mk-card[data-mk-id="mkv-powertrain"] details.mk-phases'); if (d) d.open = true; });
    await page.locator('.mk-card[data-mk-id="mkv-powertrain"] details.mk-phases button[data-mk-phase]').first().click(); await wait(400);
    const pv = await E(() => { const c = document.querySelector('.mk-card[data-mk-id="mkv-powertrain"]'); const v = SLDiagramEditor.instances().find(e => c.querySelector('.mk-phase-view') && c.querySelector('.mk-phase-view').contains(e.root)); return v ? { ro: v.isReadOnly(), lab: v.root.querySelector('.sde-gcn').textContent, note: c.querySelector('.mk-phase-view').textContent.slice(0, 160), hidden: SLMarkovDiagram.editor('mkv-powertrain').root.parentNode.style.display } : null; });
    check('browser: "Show" draws the model as it is in that phase, read only, with the failure rates multiplied (3.3e-5 x 4)', pv && pv.ro && /λ = 1\.32e-4/.test(pv.lab) && /multiplied by 4/.test(pv.note) && pv.hidden === 'none', JSON.stringify(pv));
    await page.locator('.mk-card[data-mk-id="mkv-powertrain"] .mk-phase-tabs button[data-mk-phase=""]').click(); await wait(300);
    check('browser: "Model (all phases)" goes back to the editable diagram', await E(() => SLMarkovDiagram.editor('mkv-powertrain').root.parentNode.style.display === '' && !SLMarkovDiagram.editor('mkv-powertrain').isReadOnly()));

    // ---------------- RBD: old showcase RBDs are read only and computed as before
    await E(() => { switchTab('ram-rbd'); __ung(); document.getElementById('ram-rbd-host').scrollIntoView(); });
    await page.waitForFunction(() => document.querySelector('#rbd-editor-host .sde'), null, { timeout: 8000 });
    const leg = await E(() => ({ n: projectConfig.rbd.models.length, legacy: projectConfig.rbd.models.every(m => !m.diagram), ro: window._rbdEditor().isReadOnly(), note: document.getElementById('rbd-note-host').textContent }));
    check('browser: the showcase\'s saved RBDs open as drawings, read only, with "Edit by hand" (not converted on open)', leg.n > 3 && leg.legacy && leg.ro && /Edit by hand/.test(leg.note), JSON.stringify(leg));
    check('browser: viewing the old RBDs changed nothing in the project', JSON.stringify(JSON.parse(await snap()).rbd) === JSON.stringify(JSON.parse(before).rbd));
    // ---------------- RBD: draw from blank
    await E(() => { window.slPrompt = async (m, d) => d; }); await E(() => rbdAddBlank()); await wait(500);
    await E(() => { __ung(); document.getElementById('rbd-editor-host').scrollIntoView({ block: 'center' }); });
    const R = () => E(() => { const m = projectConfig.rbd.models.find(x => x.id === document.getElementById('rbd-pick').value); return m; });
    let rm = await R();
    check('browser: a new diagram starts with a start and an end and is editable', rm.diagram.elements.length === 2 && !(await E(() => _rbdEditor().isReadOnly())));
    const rcv = await page.locator('#rbd-editor-host .sde-canvas').boundingBox();
    const dropBlock = async (kind, fx, fy) => { const tb = await page.locator('#rbd-editor-host .sde-tool[data-kind="' + kind + '"]').boundingBox(); await page.mouse.move(tb.x + 20, tb.y + 10); await page.mouse.down(); await page.mouse.move(rcv.x + rcv.width * fx, rcv.y + rcv.height * fy, { steps: 8 }); await page.mouse.up(); await wait(200); };
    await dropBlock('block', 0.35, 0.3); await dropBlock('block', 0.35, 0.7);
    rm = await R();
    const [b1, b2] = rm.diagram.elements.filter(e => e.kind === 'block').map(e => e.id);
    const sId = rm.diagram.elements.find(e => e.kind === 'start').id, eId = rm.diagram.elements.find(e => e.kind === 'end').id;
    check('browser: blocks dragged from the toolbox land on the diagram and in the project', !!b1 && !!b2);
    const rat = id => E(([id2]) => { const e = _rbdEditor(); const x = e.model().elements.find(q => q.id === id2); const v = e.getView(); const r = e.root.querySelector('.sde-canvas').getBoundingClientRect(); return { x: r.left + v.x + (x.x + x.w / 2) * v.k, y: r.top + v.y + (x.y + x.h / 2) * v.k }; }, [id]);
    const dragLink = async (from, to) => { const a = await rat(from); await page.mouse.move(a.x, a.y); await wait(100); const d = await E(([id2]) => { const ps = Array.from(_rbdEditor().root.querySelectorAll('.sde-port[data-el="' + id2 + '"]')); const c = (ps.find(p => p.getAttribute('data-port') === 'e') || ps[0]).getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; }, [from]); await page.mouse.move(d.x, d.y, { steps: 3 }); await page.mouse.down(); const bb = await rat(to); await page.mouse.move(bb.x, bb.y, { steps: 10 }); await page.mouse.up(); await wait(220); };
    await dragLink(sId, b1); await dragLink(sId, b2); await dragLink(b1, eId); await dragLink(b2, eId);
    rm = await R();
    check('browser: links drawn by dragging from the dots (no chooser: a plain drag makes a one-way link)', rm.diagram.connectors.length === 4 && rm.diagram.connectors.every(c => c.kind === 'link'), JSON.stringify(rm.diagram.connectors.map(c => c.kind)));
    check('browser: the checks ask for the failure rates before computing', /needs a failure rate/.test(await E(() => document.getElementById('rbd-results').textContent)));
    // rates from the properties panel
    const setRate = async (id, v) => { const p = await rat(id); await page.mouse.click(p.x, p.y); await wait(120); await page.locator('#rbd-editor-host .sde-props input[data-key="props.lambda"]').fill(v); await page.keyboard.press('Enter'); await wait(250); };
    await setRate(b1, '1e-3'); await setRate(b2, '2e-3');
    const T = await E(() => (typeof ftaConfig === 'object' && ftaConfig && parseFloat(ftaConfig.exposureTime)) || 1);
    const want = 1 - (1 - Math.exp(-1e-3 * T)) * (1 - Math.exp(-2e-3 * T));
    const shown = await E(() => document.getElementById('rbd-results').textContent);
    check('browser: R(mission) of the hand-drawn parallel pair is shown, and equals 1 - q1 q2 by hand', new RegExp('R\\(mission ' + T + ' h\\)\\s*' + want.toPrecision(10).replace('.', '\\.')).test(shown) || new RegExp(want.toPrecision(6).replace('.', '\\.')).test(shown), shown.slice(0, 200) + ' want ' + want);
    check('browser: the results say how they were checked (decision diagram, enumeration agrees)', /decision diagram over 2 components/.test(shown) && /agrees/.test(shown));
    // repeated block: duplicate block 1 and link it in series with block 2 as the same component
    await E(([id1, id2, eid]) => _rbdEditor().change('test: repeat', tx => { const c = tx.addElement('block', 900, 300, { label: 'Block', props: { lambda: 1e-3, component: id1 } }); tx.removeConnector(tx.model.connectors.find(k => k.from === id2 && k.to === eid).id); tx.addConnector('link', id2, c.id); tx.addConnector('link', c.id, eid); }), [b1, b2, eId]); await wait(400);
    const rr = await E(() => document.getElementById('rbd-results').textContent);
    // R = P(b1) * 1 [if b1 up the top path works]... b1 shared: system works iff b1 up (top path) or (b2 and b1 up) => R = r1
    check('browser: a block repeated in two places is one component (R = r1, not the independent-copies value) and is marked x2 on the drawing', new RegExp(Math.exp(-1e-3 * T).toPrecision(6).replace('.', '\\.')).test(rr) && await E(() => (_rbdEditor().toSvg().match(/class="rbd-rep"/g) || []).length === 2), rr.slice(0, 160));
    await E(() => _rbdEditor().undo()); await wait(300);
    check('browser: Undo takes the repeated block back out', (await R()).diagram.elements.filter(e => e.kind === 'block').length === 2);
    // model link: the properties panel uses the SysML picker (provider set by the page)
    check('browser: the diagram editor links elements through the SysML v2 picker (SLSysML.editorProvider)', await E(() => { const p = SLDiagramEditor.getSysmlProvider(); return !!p && typeof p.pick === 'function' && p.describe('sys:' + (systemsData[0] || {}).id) === SLSysML.refLabel('sys:' + (systemsData[0] || {}).id); }));
    await E(([id1]) => _rbdEditor().linkSysml(id1, 'item:' + itemsData[0].internalId), [b1]); await wait(250);
    check('browser: a block linked to an item stores the model ref and the SysML export carries it as About', await E(([id1]) => { const m = projectConfig.rbd.models.find(x => x.id === document.getElementById('rbd-pick').value); const b = m.diagram.elements.find(e => e.id === id1); const t = SLSysML.exportProject({ area: 'rbd' }).modelText; return b.sysmlRef === 'item:' + itemsData[0].internalId && /#About dependency/.test(t); }, [b1]));
    // ---------------- RBD: derive from a fault tree, then edit the derived diagram
    await E(() => { const sel = document.getElementById('rbd-tree-pick'); const opt = Array.from(sel.options).find(o => /Verification/.test(o.textContent)) || sel.options[0]; return rbdAddFromTree(opt.value); }); await wait(600);
    let dn = await E(() => document.getElementById('rbd-note-host').textContent);
    check('browser: derived from a fault tree: editable, linked to its tree, and the fault tree check says it matches', /Fault tree check: matches/.test(dn) && !(await E(() => _rbdEditor().isReadOnly())) && !!(await R()).fromPage, dn);
    rm = await R();
    const victim = rm.diagram.elements.find(e => e.kind === 'block');
    await E(([vid]) => { _rbdEditor().select([vid]); return _rbdEditor().deleteSelection(); }, [victim.id]); await wait(400);
    dn = await E(() => document.getElementById('rbd-note-host').textContent);
    check('browser: a derived diagram edited by hand is checked against the tree and the difference is named, with "Redraw from the fault tree"', /differs/.test(dn) && /Redraw from the fault tree/.test(dn) || /not possible until the diagram is complete/.test(dn), dn);
    await E(() => rbdRefreshFromTree()); await wait(500);
    check('browser: Redraw from the fault tree brings the derived diagram back in line', /matches/.test(await E(() => document.getElementById('rbd-note-host').textContent)));
    // ---------------- RBD: Edit by hand on an old model converts it, and only then
    await E(() => { const old = projectConfig.rbd.models.find(m => !m.diagram && m.fromPage); rbdSelect(old.id); }); await wait(300);
    await E(() => rbdEditByHand()); await wait(500);
    check('browser: Edit by hand turns an old model into an editable drawing linked to the same tree', await E(() => { const m = projectConfig.rbd.models.find(x => x.id === document.getElementById('rbd-pick').value); return !!m.diagram && !!m.fromPage && !_rbdEditor().isReadOnly(); }));
    check('browser: the INV-33 card covers drawn diagrams (four ways, AGREE)', /decision diagram [\d.]+ · enumeration of \d+ states/.test(await E(() => (document.getElementById('rbd-xc-card') || {}).textContent || '')));
    // ---------------- import a formula: an editable drawing
    await E(() => { const answers = ['Pitch channel', 'series(block(FCC, 2e-5), parallel(block(Lane A, 1e-4), block(Lane B, 1e-4)))']; window.slPrompt = async () => answers.shift(); return rbdAddManual(); }); await wait(500);
    const fm = await R();
    check('browser: Import formula gives an editable drawing (start, 3 blocks, junctions, end) with the formula\'s answer', fm && fm.name === 'Pitch channel' && fm.diagram && fm.diagram.elements.filter(e => e.kind === 'block').length === 3 && !(await E(() => _rbdEditor().isReadOnly())) &&
      Math.abs(await E(() => RBD_NET.reliability(RBD_NET.analyze(projectConfig.rbd.models.find(m => m.name === 'Pitch channel').diagram), 10)) - Math.exp(-2e-5 * 10) * (1 - Math.pow(1 - Math.exp(-1e-4 * 10), 2))) < 1e-15);
    // ---------------- persistence: the project snapshot (autosave, .slproj, cloud) carries the drawings and loads them back
    const persisted = await E(async () => {
      const snap = JSON.parse(JSON.stringify(_snapshotProject()));
      const want = JSON.stringify({ r: snap.projectConfig.rbd, m: snap.projectConfig.markovModels });
      _applyProjectData(snap); await new Promise(r => setTimeout(r, 400));
      const got = JSON.stringify({ r: projectConfig.rbd, m: projectConfig.markovModels });
      return { same: want === got, drawn: projectConfig.rbd.models.filter(m => m.diagram).length, ids: projectConfig.markovModels.some(m => (m.states || []).some(s => s.id && isFinite(s.x))) };
    });
    check('browser: the project snapshot (what autosave, .slproj and the cloud save) carries the drawings and loads them back unchanged', persisted.same && persisted.drawn >= 3 && persisted.ids, JSON.stringify(persisted));
    check('browser: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  } finally { await b.close(); srv.close(); }
}

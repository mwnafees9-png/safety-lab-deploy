#!/usr/bin/env node
/*
 * Regression - 13 Oct 2026 (v1.0; [10b] added 13 Oct night: moves, resizes, layout and Undo / Redo are collected, not asked per action). The ONE diagram editor core: site/diagram_editor.js (SLDiagramEditor).
 *
 * FOUND: every Safety Lab diagram except the fault tree was drawn read only (bowtie, event tree, STPA
 *   control structure, reliability block diagram, cascading effects) or not drawn at all (Markov). No
 *   toolbox, no drawing connections by hand, no undo, mostly no zoom/pan/fullscreen (diagram audit,
 *   12 Oct 2026). Building six editors separately would give six different ways to draw.
 * FIX: one editor core every diagram registers its notation with (shape kinds, ports, connector kinds,
 *   connection rules, fields, layout), editing a plain JSON model through ONE change path:
 *   beforeChange hooks (the acknowledgement hook) -> undo history -> pushUndo + adapter.save +
 *   scheduleAutosave -> afterChange. Ids are UUIDs usable as SysML v2 element ids; sysmlRef links an
 *   element to a model element.
 * EXECUTED: this file loads the real site/diagram_editor.js and the test-only demo notation
 *   (tests/fixtures/sde_demo_diagram.js) in a vm with no DOM and checks the pure core: the model
 *   contract, transactions, exact undo/redo (200 random transactions undone and redone back to the
 *   byte), connection rules, the veto hook, align/layout/copy/paste, geometry; mutation proofs show the
 *   checks bite. Then it checks the wiring (index.html load order, no native dialogs, no em dashes) and
 *   runs the Chromium check tools/diagram_editor/browser_check.js (real mouse and keyboard), counting
 *   its PASS/FAIL lines here.
 * Run: node tests/regression_diagram_editor_20261013b.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' - ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'site', 'diagram_editor.js'), 'utf8');
const FIX = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'sde_demo_diagram.js'), 'utf8');

function load(src) {
    const quiet = { log: console.log, warn: (m) => { if (!/^\[diagram\]/.test(String(m))) console.warn(m); }, error: console.error };
    const sb = { console: quiet, Object, Array, JSON, Math, Map, Set, Promise, Error, Date, Number, String, isFinite };
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(src || SRC, sb, { filename: 'diagram_editor.js' });
    vm.runInContext(FIX, sb, { filename: 'sde_demo_diagram.js' });
    return sb.SLDiagramEditor;
}
const J = o => JSON.stringify(o);

console.log('\n[1] Loads without a DOM and exposes the API');
let E = load();
// 13 Oct 2026 (merge into fix3-M): v1.3 = every hook of the v1.1/v1.2 rounds plus fix3-M's (ctx.model, refreshShapes, field apply, offerOnDrag).
// 15 Oct 2026: v1.5 adds the height: 'fill' mode (tests/regression_canvas_fill_20261015.test.js).
check('SLDiagramEditor is defined with version 1.5', E && E.version === '1.5');
['register', 'mount', 'onBeforeChange', 'onAfterChange', 'setSysmlProvider', 'getDiagram', 'types', 'uuid'].forEach(k => check('exposes ' + k, typeof E[k] === 'function'));
check('the demo notation registered (test only)', E.types().indexOf('sde-demo') >= 0);
const C = E.core, DEF = E.getDiagram('sde-demo');
check('mount refuses without a browser document (no half-built editor in node)', (() => { try { E.mount({}, { type: 'sde-demo' }); return false; } catch (e) { return /browser document|container/.test(e.message); } })());
check('register fills kind defaults (ports, shape, resizable, arrow, route)', DEF.elementKinds.block.ports === 'sides' && DEF.elementKinds.block.resizable === true && DEF.connectorKinds.flow.arrow === 'triangle' && DEF.connectorKinds.note.route === 'straight');
check('register refuses a diagram without a type', (() => { try { E.register({}); return false; } catch (e) { return true; } })());

console.log('\n[2] The data model contract');
{
    const raw = { elements: [{ id: 'a', kind: 'block', x: '10', y: 5 }, { id: 'a', kind: 'state', x: 0, y: 0 }, { kind: 'gate' }, null],
        connectors: [{ id: 'k1', kind: 'flow', from: 'a', to: 'gone' }], title: 'My diagram', meta: { v: 2 } };
    const m = C.normalize(DEF, raw);
    check('numbers coerced, sizes default from the kind', m.elements[0].x === 10 && m.elements[0].w === 120 && m.elements[0].h === 50);
    check('a duplicate id gets a fresh id (no two items share an identity)', m.elements[1].id !== 'a' && m.elements.length === 3);
    check('a missing id gets a UUID', /^[0-9a-f-]{36}$/.test(m.elements[2].id));
    check('label and props always present', m.elements.every(e => e.label === '' && e.props && typeof e.props === 'object'));
    check('a connector with a missing end is KEPT (never silently lose data)', m.connectors.length === 1 && m.connectors[0].fromPort === null);
    check('extra top-level fields survive (diagram metadata)', m.title === 'My diagram' && m.meta.v === 2);
    check('normalize does not mutate the input', raw.elements[0].x === '10');
    const s = new C.Store(DEF, raw);
    const issues = C.validate(DEF, s);
    check('validate reports the dangling connector and the unnamed blocks (diagram rule)', issues.some(i => /missing end/.test(i.message)) && issues.some(i => /block has no name/.test(i.message)));
    const ids = new Set(); for (let i = 0; i < 2000; i++) ids.add(E.uuid());
    check('2000 UUIDs, no collision, RFC 4122 version 4 shape', ids.size === 2000 && [...ids].every(u => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(u)));
}

console.log('\n[3] Transactions record exact, minimal changes');
{
    const s = new C.Store(DEF, { elements: [], connectors: [] });
    let tx = s.begin('Add');
    const a = tx.addElement('block', 10, 20, { label: 'Pump', props: { rate: 1e-5 } });
    tx.updateElement(a.id, { x: 30 });
    let ops = tx.end();
    check('add then move in one transaction is ONE op (before null, after final)', ops.length === 1 && ops[0].before === null && ops[0].after.x === 30 && ops[0].after.label === 'Pump' && ops[0].after.props.rate === 1e-5);
    tx = s.begin('noop'); tx.updateElement(a.id, { x: 30 }); ops = tx.end();
    check('an update to the same value records nothing', ops.length === 0);
    tx = s.begin('x'); check('a finished transaction refuses more edits', (() => { tx.end(); try { tx.updateElement(a.id, { x: 1 }); return false; } catch (e) { return true; } })());
    tx = s.begin('props'); tx.updateElement(a.id, { props: { kind: 'hardware' } }); tx.end();
    check('props patch merges (rate kept, kind added)', s.getEl(a.id).props.rate === 1e-5 && s.getEl(a.id).props.kind === 'hardware');
    tx = s.begin('props2'); tx.updateElement(a.id, { props: { rate: undefined } }); tx.end();
    check('props patch with undefined deletes that key', !('rate' in s.getEl(a.id).props));
    tx = s.begin('min'); tx.updateElement(a.id, { w: 2, h: 3 }); tx.end();
    check('size is held to the kind minimum (20)', s.getEl(a.id).w === 20 && s.getEl(a.id).h === 20);
    tx = s.begin('st'); const st = tx.addElement('state', 0, 0); tx.updateElement(st.id, { w: 140 }); tx.end();
    check('aspect lock keeps a state round (w = h)', s.getEl(st.id).w === 140 && s.getEl(st.id).h === 140);
    tx = s.begin('st'); const st2 = tx.addElement('state', 300, 0); const tr = tx.addConnector('transition', st.id, st2.id, { props: { rate: 2e-4 } }); tx.end();
    tx = s.begin('del'); tx.removeElement(st.id); ops = tx.end();
    check('removing a shape removes its connectors in the same change', !s.getCn(tr.id) && ops.length === 2 && ops.some(o => o.t === 'cn' && o.after === null) && ops.some(o => o.t === 'el' && o.after === null));
    s.apply(ops, true);
    check('undoing the removal restores the shape AND its connector with props', s.getEl(st.id) && s.getCn(tr.id) && s.getCn(tr.id).props.rate === 2e-4);
    tx = s.begin('maxc'); tx.addElement('start', 0, 0);
    check('maxCount: a second start point is refused with a reason', (() => { try { tx.addElement('start', 50, 0); return false; } catch (e) { return e instanceof C.RuleError && /only 1 start/.test(e.message); } })());
    tx.rollback();
    check('rollback undoes everything the transaction did', s.m.elements.filter(e => e.kind === 'start').length === 0);
    check('an unknown kind is refused', (() => { const t = s.begin('u'); try { t.addElement('nope', 0, 0); return false; } catch (e) { return /Unknown shape type/.test(e.message); } finally { t.rollback(); } })());
    check('a reused id is refused', (() => { const t = s.begin('u'); try { t.addElement('block', 0, 0, { id: a.id }); return false; } catch (e) { return /already used/.test(e.message); } finally { t.rollback(); } })());
    const sum = C.summarize(ops);
    check('change summary names what was removed (for the acknowledgement prompt)', sum.removed.elements.length === 1 && sum.removed.connectors.length === 1 && sum.added.elements.length === 0);
}

console.log('\n[4] Undo and redo are exact (200 random transactions, seeded)');
function rng(seed) { let x = seed >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function fuzz(Ex, seed) {
    const Cx = Ex.core, D = Ex.getDiagram('sde-demo');
    const s = new Cx.Store(D, { elements: [], connectors: [] });
    const h = new Cx.History();
    const r = rng(seed), kinds = ['block', 'state', 'gate'], states = [J(s.m)];
    for (let i = 0; i < 200; i++) {
        const tx = s.begin('t' + i);
        const n = 1 + Math.floor(r() * 4);
        for (let j = 0; j < n; j++) {
            const els = s.m.elements, cns = s.m.connectors, p = r();
            try {
                if (p < 0.35 || els.length < 2) tx.addElement(kinds[Math.floor(r() * 3)], Math.floor(r() * 900), Math.floor(r() * 600), { label: 'n' + i + '_' + j });
                else if (p < 0.55) { const a = els[Math.floor(r() * els.length)]; tx.updateElement(a.id, { x: a.x + 10, label: a.label + '+', props: { v: i } }); }
                else if (p < 0.75) { const a = els[Math.floor(r() * els.length)], b = els[Math.floor(r() * els.length)]; const ks = Cx.legalConnectorKinds(D, s, a.id, b.id); if (ks.length) tx.addConnector(ks[0], a.id, b.id, { label: 'c' + i }); }
                else if (p < 0.88) { const a = els[Math.floor(r() * els.length)]; tx.removeElement(a.id); }
                else if (cns.length) { const c = cns[Math.floor(r() * cns.length)]; if (r() < 0.5) tx.removeConnector(c.id); else tx.updateConnector(c.id, { label: 'z' + i }); }
            } catch (e) { if (!(e instanceof Cx.RuleError)) throw e; }
        }
        const ops = tx.end();
        if (ops.length) { h.push({ ops }); states.push(J(s.m)); }
    }
    let okUndo = true, okRedo = true;
    for (let i = h.undo.length - 1; i >= 0; i--) { s.apply(h.undo[i].ops, true); if (J(s.m) !== states[i]) { okUndo = false; break; } }
    for (let i = 0; i < h.undo.length && okUndo; i++) { s.apply(h.undo[i].ops, false); if (J(s.m) !== states[i + 1]) { okRedo = false; break; } }
    // the index must agree with the arrays after all that
    const idxOk = s.m.elements.every(e => s.getEl(e.id) === e) && s.m.connectors.every(c => s.getCn(c.id) === c) && s.ix.el.size === s.m.elements.length && s.ix.cn.size === s.m.connectors.length;
    return { okUndo, okRedo, idxOk, steps: h.undo.length, final: s.m.elements.length + '/' + s.m.connectors.length };
}
{
    let all = true, detail = '';
    for (const seed of [7, 1013, 20261013, 99991]) { const f = fuzz(E, seed); if (!f.okUndo || !f.okRedo || !f.idxOk) { all = false; detail = seed + ' ' + J(f); } }
    const f = fuzz(E, 7);
    check('every undo returns the model to the exact earlier state, in order (byte for byte, 4 seeds)', all, detail);
    check('every redo replays to the exact later state (z-order included)', all, detail);
    check('the fuzz really exercised the model (' + f.steps + ' steps, ' + f.final + ' at the end)', f.steps > 150);
    const h = new C.History(3); h.push(1); h.push(2); h.redo.push(9); h.push(3); h.push(4);
    check('history is capped and a new change clears redo', h.undo.length === 3 && h.undo[0] === 2 && h.redo.length === 0);
    const inv = C.invertOps([{ t: 'el', id: 'a', before: null, after: { id: 'a' }, index: 0 }, { t: 'el', id: 'b', before: { id: 'b', x: 1 }, after: { id: 'b', x: 2 }, index: -1 }]);
    check('invertOps reverses order and swaps before/after', inv[0].id === 'b' && inv[0].before.x === 2 && inv[1].after === null);
}

console.log('\n[5] Connection rules');
{
    const s = new C.Store(DEF, { elements: [
        { id: 'st', kind: 'start', x: 0, y: 0 }, { id: 'b1', kind: 'block', x: 0, y: 0 }, { id: 'b2', kind: 'block', x: 0, y: 0 },
        { id: 's1', kind: 'state', x: 0, y: 0 }, { id: 's2', kind: 'state', x: 0, y: 0 }], connectors: [] });
    const cc = (a, b, k) => C.canConnect(DEF, s, a, b, k);
    check('a legal flow passes', cc('b1', 'b2', 'flow').ok);
    check('wrong start kind is refused with a plain reason', !cc('s1', 'b1', 'flow').ok && cc('s1', 'b1', 'flow').reason === 'A flow cannot start at a state.');
    check('wrong end kind is refused', cc('b1', 'st', 'flow').reason === 'A flow cannot end at a start.');
    check('self loop refused unless the kind allows it', !cc('b1', 'b1', 'flow').ok && cc('s1', 's1', 'transition').ok);
    check('the diagram rule (canConnect returning a string) is the reason shown', cc('b1', 'b2', 'note').reason === 'A note link joins two different kinds of shape.');
    check('unknown connector kind refused', !cc('b1', 'b2', 'zzz').ok);
    check('missing end refused', !cc('b1', 'nope', 'flow').ok);
    let tx = s.begin('c'); tx.addConnector('flow', 'b1', 'b2'); tx.addConnector('note', 'b1', 's1'); tx.end();
    check('a duplicate connection is refused', /already connected/.test(cc('b1', 'b2', 'flow').reason));
    check('an undirected kind treats the reverse as a duplicate too', /already connected/.test(cc('s1', 'b1', 'note').reason));
    check('a directed kind allows the reverse (Markov failure and repair)', (() => { const t = s.begin('r'); t.addConnector('transition', 's1', 's2'); const ok = C.canConnect(DEF, s, 's2', 's1', 'transition').ok; t.rollback(); return ok; })());
    tx = s.begin('m'); tx.addConnector('flow', 'st', 'b1'); tx.end();
    check('maxOut: a start point has one way out', /at most 1 outgoing/.test(cc('st', 'b2', 'flow').reason));
    check('legalConnectorKinds lists exactly what fits (block to state: note only)', J(C.legalConnectorKinds(DEF, s, 'b2', 's2')) === J(['note']));
    const c = s.m.connectors.find(x => x.kind === 'flow' && x.from === 'b1');
    check('re-pointing a connector is checked against the rules (ignoring itself)', (() => { const t = s.begin('p'); try { t.updateConnector(c.id, { to: 's1' }); return false; } catch (e) { return /cannot end at a state/.test(e.message); } finally { t.rollback(); } })());
    check('changing a connector to a kind that fits is allowed', (() => { const t = s.begin('p'); try { t.updateConnector(c.id, { label: 'x' }); return true; } catch (e) { return false; } finally { t.rollback(); } })());
}

console.log('\n[6] The beforeChange hook (acknowledgement) can say no, now or later');
(async () => {
    const ch = C.makeChange('sde-demo', 'Test', [{ t: 'el', id: 'a', before: null, after: { id: 'a' } }], 'user');
    check('no hooks: allowed', C.runBefore([], ch, {}) === true);
    check('a hook returning false vetoes synchronously', C.runBefore([() => true, () => false], ch, {}) === false);
    let seen = 0;
    check('a veto stops later hooks running', C.runBefore([() => false, () => { seen++; }], ch, {}) === false && seen === 0);
    const pr = C.runBefore([() => Promise.resolve(true), () => Promise.resolve(false)], ch, {});
    check('async hooks return a promise', pr && typeof pr.then === 'function');
    check('an async no is a veto', (await pr) === false);
    check('an async yes after a sync yes is allowed', (await C.runBefore([() => undefined, () => Promise.resolve(true)], ch, {})) === true);
    check('a rejected promise is a veto (a failed confirmation never applies a change)', (await C.runBefore([() => Promise.reject(new Error('x'))], ch, {})) === false);
    check('a hook that throws does not block editing (logged, allowed)', C.runBefore([() => { throw new Error('bug'); }], ch, { quiet: 1 }) === true);
    check('change.summary() describes the change', ch.summary().added.elements.length === 1 && ch.label === 'Test' && ch.diagram === 'sde-demo' && ch.source === 'user');
    const off = E.onBeforeChange(() => false); off();
    check('onBeforeChange returns an unsubscribe', typeof off === 'function');

    console.log('\n[7] Align, layout, copy and paste');
    const els = [{ id: 'a', x: 10, y: 0, w: 100, h: 40 }, { id: 'b', x: 200, y: 50, w: 60, h: 20 }, { id: 'c', x: 50, y: 100, w: 20, h: 20 }];
    let p = C.alignPositions(els, 'left');
    check('align left: every x is the smallest x (10)', p.a.x === 10 && p.b.x === 10 && p.c.x === 10);
    p = C.alignPositions(els, 'right');
    check('align right: right edges at 260', p.a.x === 160 && p.b.x === 200 && p.c.x === 240);
    p = C.alignPositions(els, 'center');
    check('align centers: centers at 135', p.a.x === 85 && p.b.x === 105 && p.c.x === 125);
    p = C.alignPositions(els, 'middle');
    check('align middles: middles at 60', p.a.y === 40 && p.b.y === 50 && p.c.y === 50);
    p = C.alignPositions(els, 'hspace');
    check('space evenly across: equal gaps (span 250, widths 180, gap 35)', p.a.x === 10 && p.c.x === 145 && p.b.x === 200);
    check('align needs two shapes', J(C.alignPositions([els[0]], 'left')) === '{}');
    const lay = E.layouts.layered({ elements: [{ id: 'x', w: 50, h: 30 }, { id: 'y', w: 50, h: 30 }, { id: 'z', w: 50, h: 30 }, { id: 'q', w: 50, h: 30 }],
        connectors: [{ from: 'x', to: 'y' }, { from: 'y', to: 'z' }, { from: 'x', to: 'q' }, { from: 'z', to: 'x' }] });
    check('layered layout puts each step below its cause and survives a cycle', lay.x && lay.y && lay.z && lay.q && Object.keys(lay).length === 4);
    const lay2 = E.layouts.layered({ elements: [{ id: 'x', w: 50, h: 30 }, { id: 'y', w: 50, h: 30 }, { id: 'z', w: 50, h: 30 }], connectors: [{ from: 'x', to: 'y' }, { from: 'y', to: 'z' }] });
    check('layered layout of a chain: y increases down the chain', lay2.x.y < lay2.y.y && lay2.y.y < lay2.z.y);
    const s = new C.Store(DEF, { elements: [{ id: 'st', kind: 'start', x: 0, y: 0 }, { id: 'b1', kind: 'block', x: 0, y: 0, label: 'A', sysmlRef: { qualifiedName: 'P::A' } }, { id: 'b2', kind: 'block', x: 200, y: 0, label: 'B' }, { id: 'b3', kind: 'block', x: 400, y: 0 }],
        connectors: [{ id: 'f1', kind: 'flow', from: 'b1', to: 'b2', label: 'L' }, { id: 'f2', kind: 'flow', from: 'b2', to: 'b3' }] });
    const pl = C.copyPayload(s, ['b1', 'b2', 'st']);
    check('copy takes the shapes and only the connectors between them', pl.elements.length === 3 && pl.connectors.length === 1 && pl.connectors[0].id === 'f1');
    const tx = s.begin('paste'); const created = C.pastePayload(tx, pl, 20, 20); tx.end();
    const newEls = created.map(id => s.getEl(id)).filter(Boolean);
    check('paste makes new ids, offset by 20, labels and props kept', newEls.length === 2 && newEls.every(e => ['st', 'b1', 'b2'].indexOf(e.id) < 0) && newEls.some(e => e.label === 'A' && e.x === 20 && e.y === 20));
    check('a pasted copy is a NEW element: its SysML link is not copied', newEls.every(e => !e.sysmlRef));
    check('the pasted connector joins the pasted copies, not the originals', (() => { const c = s.m.connectors.find(x => created.indexOf(x.id) >= 0); return c && created.indexOf(c.from) >= 0 && created.indexOf(c.to) >= 0 && c.label === 'L'; })());
    check('a shape a rule refuses (second start point) is skipped with its reason, the rest pastes', created.skipped.length === 1 && /only 1 start/.test(created.skipped[0]));

    console.log('\n[8] Geometry');
    const el = { x: 0, y: 0, w: 100, h: 60 };
    const bp = C.boundaryPoint(el, { shape: 'ellipse' }, { x: 300, y: 200 });
    check('boundary point of an ellipse lies on the ellipse', Math.abs(((bp.x - 50) ** 2) / 2500 + ((bp.y - 30) ** 2) / 900 - 1) < 1e-9);
    const br = C.boundaryPoint(el, { shape: 'rect' }, { x: 50, y: -500 });
    check('boundary point of a box toward straight up is the top middle', Math.abs(br.x - 50) < 1e-9 && Math.abs(br.y) < 1e-9 && br.dir === 'n');
    const bd = C.boundaryPoint(el, { shape: 'diamond' }, { x: 1000, y: 30 });
    check('boundary point of a diamond toward the right is its right tip', Math.abs(bd.x - 100) < 1e-9 && Math.abs(bd.y - 30) < 1e-9);
    const A = { id: 'A', kind: 'state', x: 0, y: 0, w: 80, h: 80 }, B = { id: 'B', kind: 'state', x: 300, y: 0, w: 80, h: 80 };
    const c1 = { id: 'c1', kind: 'transition', from: 'A', to: 'B' }, c2 = { id: 'c2', kind: 'transition', from: 'B', to: 'A' };
    const bends = C.bendMap([c1, c2]);
    const g1 = C.connectorGeometry(DEF, c1, A, B, bends.c1), g2 = C.connectorGeometry(DEF, c2, B, A, bends.c2);
    check('A to B and B to A bend to opposite sides (failure and repair never overlap)', (g1.mid.y - 40) * (g2.mid.y - 40) < 0, g1.mid.y + ' vs ' + g2.mid.y);
    const g0 = C.connectorGeometry(DEF, c1, A, B, 0);
    check('a single connector between two shapes is straight, edge to edge', /^M80,40 L300,40$/.test(g0.d), g0.d);
    const loop = C.connectorGeometry(DEF, { id: 'l', kind: 'transition', from: 'A', to: 'A' }, A, A, 0);
    check('a self loop is drawn above the shape', loop.mid.y < 0 && /C/.test(loop.d));
    const orth = C.connectorGeometry(DEF, { id: 'o', kind: 'flow', from: 'A', to: 'B' }, Object.assign({}, A, { kind: 'block' }), Object.assign({}, B, { kind: 'block', y: 200 }), 0);
    check('an orthogonal connector uses only horizontal and vertical segments', /^M[\d.]+,[\d.]+ [HV][\d.-]+ [HV][\d.-]+ [HV][\d.-]+$/.test(orth.d), orth.d);
    const lines = C.wrapLines('Hydraulic pump number two failed', 70, 12, 2);
    check('labels wrap to the shape and end in an ellipsis when they do not fit', lines.length === 2 && /…$/.test(lines[1]), J(lines));

    console.log('\n[9] Mutation proofs: the checks above bite');
    const mut = (from, to) => { if (SRC.indexOf(from) < 0) return null; return load(SRC.replace(from, to)); };
    let M = mut("if (op.before && op.after && same(op.before, op.after)) return;", "");
    check('mutant: no-op updates kept -> the "records nothing" check would fail', M && (() => { const s2 = new M.core.Store(M.getDiagram('sde-demo'), { elements: [{ id: 'a', kind: 'block', x: 1, y: 1 }] }); const t = s2.begin('n'); t.updateElement('a', { x: 1 }); return t.end().length === 1; })());
    M = mut("var at = (op.index == null || op.index < 0 || op.index > arr.length) ? arr.length : op.index;", "var at = arr.length;");
    check('mutant: removed items re-inserted at the end -> the exact-undo fuzz fails', M && (() => { const f = fuzz(M, 7); return !f.okUndo || !f.okRedo; })());
    M = mut("if (fromId === toId && !ck.allowSelfLoop)", "if (false)");
    check('mutant: self-loop rule removed -> the self-loop check fails', M && M.core.canConnect(M.getDiagram('sde-demo'), new M.core.Store(M.getDiagram('sde-demo'), { elements: [{ id: 'b', kind: 'block', x: 0, y: 0 }] }), 'b', 'b', 'flow').ok === true);
    M = mut("this.s.connectorsOf(id).forEach(function (c) { self.removeConnector(c.id); });", "");
    check('mutant: no cascade on shape delete -> a dangling connector is left behind', M && (() => { const D2 = M.getDiagram('sde-demo'); const s2 = new M.core.Store(D2, { elements: [{ id: 'a', kind: 'block', x: 0, y: 0 }, { id: 'b', kind: 'block', x: 0, y: 0 }], connectors: [{ id: 'k', kind: 'flow', from: 'a', to: 'b' }] }); const t = s2.begin('d'); t.removeElement('a'); t.end(); return !!s2.getCn('k'); })());
    M = mut("if (r === false) return false;", "");
    check('mutant: sync veto ignored -> the veto check fails', M && M.core.runBefore([() => false], ch, {}) !== false);

    console.log('\n[10] Wiring');
    const html = fs.readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
    const pos = f => html.indexOf('<script src="' + f);
    check('index.html loads diagram_editor.js exactly once, versioned', (html.match(/<script src="diagram_editor\.js\?v=1\.[345]" defer><\/script>/g) || []).length === 1);   // v1.3 after the fix3-M merge; v1.5 on 15 Oct 2026 (height: 'fill')
    ['rbd_module.js', 'cea_graph.js', 'stpa_panel.js', 'event_trees.js', 'bowtie.js', 'markov_ctmc.js'].forEach(f => check('it loads before ' + f, pos('diagram_editor.js') > 0 && pos(f) > pos('diagram_editor.js')));
    check('the test-only demo notation is not shipped', html.indexOf('sde_demo_diagram') < 0 && !fs.existsSync(path.join(ROOT, 'site', 'sde_demo_diagram.js')));
    const code = SRC.replace(/\/\/[^\n]*/g, '');
    check('no native alert/confirm/prompt (house dialogs only)', !/[^.\w](alert|confirm|prompt)\s*\(/.test(code) && /slPrompt/.test(SRC));
    check('no em dashes anywhere in the file', SRC.indexOf('—') < 0 && FIX.indexOf('—') < 0);
    check('no eval or new Function (production CSP)', !/\beval\s*\(|new Function\s*\(/.test(code));
    check('header carries the dated version note', /diagram_editor\.js - v1\.5/.test(SRC) && /15 Oct 2026 \(v1\.5\)/.test(SRC) && /13 Oct 2026 \(v1\.0\)/.test(SRC) && /13 Oct 2026 \(v1\.1/.test(SRC) && /13 Oct 2026 \(v1\.1, fix3-M\)/.test(SRC));
    check('every change reaches the app: pushUndo before save, then scheduleAutosave', (() => { const i = SRC.indexOf("root.pushUndo('Diagram: '"), j = i + SRC.slice(i).search(/save\.call\((this|self)\.adapter, clone\((this|self)\.store\.m\), change\)/), k = SRC.indexOf('root.scheduleAutosave()', j); return i > 0 && j > i && k > j; })());
    check('American spelling in user text (canceled, color, behavior)', !/cancelled|colour|behaviour|initialis|normalis/.test(SRC));

    console.log('\n[10b] 13 Oct 2026 (night, Waqas rulings 1 and 2): which changes are collected, not asked one by one');
    {
        const el = (o) => Object.assign({ id: 'a', kind: 'block', x: 10, y: 20, w: 120, h: 60, label: 'Pump', props: {} }, o || {});
        const mv = { t: 'el', id: 'a', before: el(), after: el({ x: 40, y: 80 }) };
        const rs = { t: 'el', id: 'a', before: el(), after: el({ w: 200, h: 90 }) };
        const rn = { t: 'el', id: 'a', before: el(), after: el({ label: 'Pump 2' }) };
        const mvRn = { t: 'el', id: 'a', before: el(), after: el({ x: 5, label: 'Pump 3' }) };
        const add = { t: 'el', id: 'b', before: null, after: el({ id: 'b' }) };
        check('a move is position only', E.positionOnly([mv]) === true && E.deferKind({ source: 'user', ops: [mv] }) === 'move');
        check('a resize is position only', E.positionOnly([rs, mv]) === true);
        check('a rename is content (asked per gesture)', E.positionOnly([rn]) === false && E.deferKind({ source: 'user', ops: [rn] }) === null);
        check('a move that also renames is content', E.positionOnly([mvRn]) === false);
        check('adding a shape is content', E.deferKind({ source: 'user', ops: [add] }) === null);
        check('Undo / Redo are collected whatever they touch', E.deferKind({ source: 'undo', ops: [add] }) === 'undo' && E.deferKind({ source: 'redo', ops: [rn] }) === 'redo' && E.deferKind({ source: 'layout', ops: [mv] }) === 'system');
        check('...an auto layout the diagram always computes is the app\'s own (system), the Auto layout button is a user move', E.deferKind({ source: 'user', ops: [mv, rs] }) === 'move' && /if \(dk === 'system' && root\.SLChangeAck && typeof root\.SLChangeAck\.system === 'function'\) root\.SLChangeAck\.system\(write\);/.test(SRC));
        check('_persist routes collected changes through SLChangeAck.deferred and the rest straight through', /var dk = deferKind\(change\);[\s\S]{0,200}else if \(dk && root\.SLChangeAck && typeof root\.SLChangeAck\.deferred === 'function'\) root\.SLChangeAck\.deferred\(/.test(SRC));
        // mutation proof: a classifier that ignores what changed (every user change a move) makes the rename collected
        const M = load(SRC.replace("if (positionOnly(change.ops)) return 'move';", "return 'move';"));
        check('mutation: a classifier that ignores the ops would collect a rename (proves the rename check)', M.deferKind({ source: 'user', ops: [rn] }) === 'move');
    }

    console.log('\n[11] Real browser (Chromium): tools/diagram_editor/browser_check.js');
    let out = '';
    try { out = cp.execFileSync(process.execPath, [path.join(ROOT, 'tools', 'diagram_editor', 'browser_check.js')], { encoding: 'utf8', timeout: 240000, env: Object.assign({}, process.env, { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers' }) }); }
    catch (e) { out = String(e.stdout || '') + '\n  FAIL  browser check exited with ' + e.status; }
    const lines2 = out.split('\n').filter(l => /^  (PASS|FAIL|SKIP)  /.test(l));
    lines2.forEach(l => { if (/^  PASS  /.test(l)) check('browser: ' + l.slice(8), true); else if (/^  FAIL  /.test(l)) check('browser: ' + l.slice(8), false); else console.log(l); });
    if (!lines2.length) check('browser check produced results', false, out.slice(0, 300));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed - ' + (e && e.stack || e)); process.exit(1); });

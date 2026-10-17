#!/usr/bin/env node
/*
 * Regression: real multi-part STEP assemblies (17 Oct 2026, job 2).
 *
 * THE REQUIREMENT (Waqas, 16-17 Oct 2026): test CAD with real, freely licensed STEP assemblies (many parts,
 * nested sub-assemblies, real names and part numbers) and fix what breaks properly. Two Voron printer
 * assemblies (GPL-3.0, Fusion 360 exports, 180 MB and 240 MB) broke the import in four ways; each is
 * reproduced here on a generated aircraft written the way those exports are (make_aircraft_step.js,
 * realWorld: shared styles, plane and line origins written far away, wrapped names, one name for many part
 * numbers) and on a small hand-written file:
 *
 *   R1  a part is only itself: one style shared by many parts no longer pulls their solids into a part
 *       (before: 6,571 parts where OpenCascade finds 353; a 41 m box on a 6 cm part)
 *   R2  the first boxes come from the points on the part (vertices, edge curves, exact arcs), not from the
 *       far plane and line origins; every first box holds the true shape and is not bloated
 *   R3  the full assembly path: every part under every assembly above it (before: two levels kept); the
 *       structure reader and OpenCascade give the same part ids at every depth; a multi-body product's
 *       bodies sit under it; names without the writer's line breaks; the part number of the part's OWN
 *       product (before: looked up by name, wrong when names repeat)
 *   R4  the whole-file readers (convertFast, openSessionFast) give the same ids, and say the tree is full
 *   R5  hand-written arcs and curves: an arc of a 2 m circle on a small part, the long way round, a full
 *       circle, an ellipse arc, a B-spline edge, a far B-spline surface net and a far line origin, and a
 *       B-spline face bulging past its edges
 *   R6  mutations: each deliberate break turns a check red
 *
 * The real files themselves are measured by tools/cad/real_assemblies (not in the wall: 420 MB, downloaded).
 * Run: node tests/regression_cad_real_world_20261017.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const J = x => JSON.stringify(x);
const SS = read('cad_step_struct.js'), IS = read('cad_import.js'), BS = read('cad_brep.js');
const BASE = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, Error, TextEncoder, TextDecoder, Uint8Array, Int32Array, Uint32Array, Uint16Array, Float32Array, Float64Array, ArrayBuffer, DataView, parseFloat, parseInt, isFinite, Promise };
// the structure reader, the import and our OpenCascade build together, as in the worker (any of the three mutated)
function load(over) {
    over = over || {};
    const sb = Object.assign({}, BASE); sb.self = sb; sb.globalThis = sb; vm.createContext(sb);
    vm.runInContext(over.struct || SS, sb, { filename: 'cad_step_struct.js' });
    vm.runInContext(over.imp || IS, sb, { filename: 'cad_import.js' });
    vm.runInContext(over.brep || BS, sb, { filename: 'cad_brep.js' });
    return { S: sb.SLCadStep, I: sb.SLCadImport, B: sb.SLCadBrep };
}
const GEN = require(path.join(ROOT, 'tests', 'fixtures', 'cad', 'make_aircraft_step.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-cad-real-'));
const RWP = path.join(tmp, 'real_world.step');
const gst = GEN.generate({ out: RWP, components: 400, subs: 2, installations: 3, fastenerTypes: 20, bracketTypes: 30, realWorld: true });
const RW = new Uint8Array(fs.readFileSync(RWP));
const RWTEXT = Buffer.from(RW).toString('latin1');

// ---------------------------------------------------------------- the hand-written file (R5)
function handFile() {
    let id = 0; const L = []; const E = s => { id++; L.push('#' + id + '=' + s + ';'); return id; };
    const P = (x, y, z) => E("CARTESIAN_POINT('',(" + [x, y, z].map(v => Number.isInteger(v) ? v + '.' : String(v)).join(',') + '))');
    const D = (x, y, z) => E("DIRECTION('',(" + [x, y, z].map(v => Number.isInteger(v) ? v + '.' : String(v)).join(',') + '))');
    const AX = (o, z, x) => E("AXIS2_PLACEMENT_3D('',#" + P(...o) + ',#' + D(...z) + ',#' + D(...x) + ')');
    const VP = (x, y, z) => E("VERTEX_POINT('',#" + P(x, y, z) + ')');
    const ctx = E("( GEOMETRIC_REPRESENTATION_CONTEXT(3) REPRESENTATION_CONTEXT('','') )");
    const appc = E("APPLICATION_CONTEXT('')"), pc = E("PRODUCT_CONTEXT('',#" + appc + ",'mechanical')"), pdc = E("PRODUCT_DEFINITION_CONTEXT('',#" + appc + ",'design')");
    const part = (pn, name, edges, extra) => {
        const oes = edges.map(e => E("ORIENTED_EDGE('',*,*,#" + e + ',.T.)'));
        const face = E("ADVANCED_FACE('',(#" + E("FACE_OUTER_BOUND('',#" + E("EDGE_LOOP('',(" + oes.map(o => '#' + o).join(',') + '))') + ',.T.)') + '),#' + (extra && extra.surface ? extra.surface : E("PLANE('',#" + AX([0, 0, 0], [0, 0, 1], [1, 0, 0]) + ')')) + ',.T.)');
        const msb = E("MANIFOLD_SOLID_BREP('" + name + "',#" + E("CLOSED_SHELL('',(#" + face + '))') + ')');
        const prod = E("PRODUCT('" + pn + "','" + name + "','',(#" + pc + '))'), pdf = E("PRODUCT_DEFINITION_FORMATION('','',#" + prod + ')'), pd = E("PRODUCT_DEFINITION('design','',#" + pdf + ',#' + pdc + ')'), pds = E("PRODUCT_DEFINITION_SHAPE('','',#" + pd + ')');
        const rep = E("ADVANCED_BREP_SHAPE_REPRESENTATION('',(#" + msb + '),#' + ctx + ')'); E('SHAPE_DEFINITION_REPRESENTATION(#' + pds + ',#' + rep + ')');
        return { pd: pd, name: name };
    };
    const circle = (o, r) => E("CIRCLE('',#" + AX(o, [0, 0, 1], [1, 0, 0]) + ',' + r + '.)');
    const parts = {};
    // an arc of a 2,000 mm circle centered at the origin from 0 to 0.01 rad (a 20 mm long edge)
    const a = 0.01, x2 = 2000 * Math.cos(a), y2 = 2000 * Math.sin(a);
    const c1 = circle([0, 0, 0], 2000), v1 = VP(2000, 0, 0), v2 = VP(x2, y2, 0);
    parts.arc = part('ARC-1', 'Short arc of a big circle', [E("EDGE_CURVE('',#" + v1 + ',#' + v2 + ',#' + c1 + ',.T.)')]);
    // the same two vertices, the edge against the curve's sense: from v1 to v2 the long way round (359.4 degrees)
    const c2 = circle([0, 0, 0], 2000);
    parts.longWay = part('ARC-2', 'Long way round', [E("EDGE_CURVE('',#" + v1 + ',#' + v2 + ',#' + c2 + ',.F.)')]);
    // a full circle of radius 10 at (100,0,0): one vertex
    const v3 = VP(110, 0, 0);
    parts.full = part('CIR-1', 'Full circle', [E("EDGE_CURVE('',#" + v3 + ',#' + v3 + ',#' + circle([100, 0, 0], 10) + ',.T.)')]);
    // a quarter of an ellipse (semi-axes 30 along x, 10 along y) centered at the origin, from (30,0) to (0,10)
    const el = E("ELLIPSE('',#" + AX([0, 0, 0], [0, 0, 1], [1, 0, 0]) + ',30.,10.)');
    parts.ellipse = part('ELL-1', 'Ellipse arc', [E("EDGE_CURVE('',#" + VP(30, 0, 0) + ',#' + VP(0, 10, 0) + ',#' + el + ',.T.)')]);
    // a B-spline edge whose control points bulge to y = 40, on a face whose B-spline surface net reaches 30 m,
    // with a straight edge whose line point is written 500 m away
    const bs = E("B_SPLINE_CURVE_WITH_KNOTS('',2,(#" + P(0, 0, 0) + ',#' + P(50, 40, 0) + ',#' + P(100, 0, 0) + '),.UNSPECIFIED.,.F.,.F.,(3,3),(0.,1.),.UNSPECIFIED.)');
    const vb1 = VP(0, 0, 0), vb2 = VP(100, 0, 0);
    const surf = E("B_SPLINE_SURFACE_WITH_KNOTS('',1,1,((#" + P(-30000, -30000, 0) + ',#' + P(-30000, 30000, 0) + '),(#' + P(30000, -30000, 0) + ',#' + P(30000, 30000, 0) + ')),.UNSPECIFIED.,.F.,.F.,.F.,(2,2),(2,2),(0.,1.),(0.,1.),.UNSPECIFIED.)');
    const ln = E("LINE('',#" + P(-500000, 0, 0) + ',#' + E("VECTOR('',#" + D(1, 0, 0) + ',1.)') + ')');
    parts.spline = part('BSP-1', 'Spline edge', [E("EDGE_CURVE('',#" + vb1 + ',#' + vb2 + ',#' + bs + ',.T.)'), E("EDGE_CURVE('',#" + vb2 + ',#' + vb1 + ',#' + ln + ',.F.)')], { surface: surf });
    // a face whose B-spline surface bulges 15 mm above its flat square edges (a sculpted part): its net is close, so it counts
    const sq = [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]].map(q => VP(...q));
    const sqL = (i, j) => { const a = [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]][i], b = [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]][j], d = [b[0] - a[0], b[1] - a[1], 0], L2 = Math.hypot(d[0], d[1]); return E("EDGE_CURVE('',#" + sq[i] + ',#' + sq[j] + ",#" + E("LINE('',#" + P(...a) + ',#' + E("VECTOR('',#" + D(d[0] / L2, d[1] / L2, 0) + ',1.)') + ')') + ',.T.)'); };
    const dome = E("B_SPLINE_SURFACE_WITH_KNOTS('',2,2,((#" + [[0, 0, 0], [0, 50, 0], [0, 100, 0]].map(q => P(...q)).join(',#') + '),(#' + [[50, 0, 0], [50, 50, 15], [50, 100, 0]].map(q => P(...q)).join(',#') + '),(#' + [[100, 0, 0], [100, 50, 0], [100, 100, 0]].map(q => P(...q)).join(',#') + ')),.UNSPECIFIED.,.F.,.F.,.F.,(3,3),(3,3),(0.,1.),(0.,1.),.UNSPECIFIED.)');
    parts.bulge = part('BLG-1', 'Bulging face', [sqL(0, 1), sqL(1, 2), sqL(2, 3), sqL(3, 0)], { surface: dome });
    const text = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('hand.step','',(''),(''),'','','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n" + L.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n';
    return { u8: new TextEncoder().encode(text), parts: parts, arc: { x2, y2 } };
}
const HAND = handFile();
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const boxNear = (b, mn, mx, t) => !!b && [0, 1, 2].every(j => near(b.min[j], mn[j], t) && near(b.max[j], mx[j], t));

// ---------------------------------------------------------------- the checks (R1 to R5), on any loaded set
async function checks(X, FM) {
    const out = [], ck = (n, c, d) => out.push([n, !!c, d]);
    const { S, I, B } = X;
    const ix = S.index(RW), st = S.structure(ix), res = S.boxRes(ix, st);
    // R1
    const o = B.readFast(FM, RW, 0.001, 0.5, false);
    ck('R1: the structure reader lists the parts OpenCascade finds (' + o.meshes.length + ')', !st.unsupported && res.meshes.length === o.meshes.length, res.meshes.length + ' vs ' + o.meshes.length);
    const trueBox = (u8) => {
        const p = FM._malloc(u8.length); FM.HEAPU8.set(u8, p); const lp = FM._malloc(4), outp = FM._sl_read(p, u8.length, 0.001, 0.5, lp), len = FM.HEAP32[lp >> 2]; FM._free(p); FM._free(lp);
        if (!outp || !len) return null;
        const buf = FM.HEAPU8.slice(outp, outp + len).buffer; FM._sl_free(outp);
        const jl = new DataView(buf).getUint32(0, true), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
        let q = 4 + jl; q += (4 - q % 4) % 4; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        meta.protos.forEach(r => { const pos = new Float32Array(buf, q, r.v * 3); q += r.v * 12 + r.t * 12 + r.f * 8; for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], pos[i + j]); mx[j] = Math.max(mx[j], pos[i + j]); } });
        return { solids: meta.meshes.length, min: mn, max: mx };
    };
    let solidsBad = 0, holdBad = 0, bloatBad = 0, n = 0, worst = '';
    res.leaves.forEach(L => {
        const tb = trueBox(S.extract(ix, st, L.pd)), b = L.info.box; n++;
        if (!tb || tb.solids !== L.info.solids.length) { solidsBad++; return; }
        for (let j = 0; j < 3; j++) {
            if (b.min[j] > tb.min[j] + 1e-3 || b.max[j] < tb.max[j] - 1e-3) holdBad++;
            const d = (b.max[j] - b.min[j]) - (tb.max[j] - tb.min[j]);
            if (d > 0.5 + 0.01 * (tb.max[j] - tb.min[j])) { bloatBad++; worst = L.name + ' axis ' + j + ' +' + d.toFixed(1) + ' mm'; }
        }
    });
    ck('R1: every distinct part holds only its own solids, as OpenCascade reads its own file (' + n + ' parts)', n >= 40 && solidsBad === 0, solidsBad + ' differ');
    // R2
    ck('R2: every first box holds the true shape (' + n + ' parts)', holdBad === 0, holdBad + ' cut short');
    ck('R2: and is not bloated by far plane or line origins (within 0.5 mm + 1%)', bloatBad === 0, worst);
    // R3
    const pidsOf = (r) => { const p = []; I.walkParts(r, (mi, w) => { p[mi] = w; }); return p; };
    const sw = pidsOf(res);
    const tree = I.attachTrails(o, RW), ow = pidsOf(o);
    ck('R3: the structure reader and OpenCascade give the same part ids, in the same order', tree.full === true && sw.length === ow.length && sw.every((w, i) => w.pid === ow[i].pid), J(tree));
    // an independent walk of the assembly: every placed part's assembly names, from the NAUO links
    const indep = [];
    st.roots.forEach(r => (function walk(pd, trail) { const ks = st.kids[pd]; if (!ks) { indep.push(trail.slice()); return; } ks.forEach(k => walk(st.nauo.get(k).child, trail.concat([st.pdName[pd].replace(/[\r\n]/g, '')]))); })(r, []));
    const placed = [], seenLeaf = new Set();
    res.meshes.forEach((m, i) => { if (m.solid === 0) placed.push(sw[i].path); });
    ck('R3: every part sits under every assembly above it (' + placed.length + ' placed, deepest ' + Math.max(...placed.map(p => p.length)) + ' levels)', placed.length === indep.length && placed.every((p, i) => J(p) === J(indep[i])) && Math.max(...placed.map(p => p.length)) >= 4);
    const wrapped = (RWTEXT.match(/PRODUCT\('[^']*','[^']*\r\n/g) || []).length;
    ck('R3: names wrapped onto two lines in the file read as one line (' + wrapped + ' wrapped)', wrapped > 10 && sw.every(w => !/[\r\n]/.test(w.name) && w.path.every(x => !/[\r\n]/.test(x))));
    const model = I.buildModel(res, { maxTrianglesTotal: 0 }), prodOf = {};
    Object.keys(st.products).forEach(k => { prodOf[k] = st.products[k]; });
    let pnBad = 0, sameNames = 0;
    res.meshes.forEach((m, i) => { const L = res.leaves[m.leaf], pr = st.products[st.pdProduct[L.pd]]; if (model.parts[i].partNumber !== pr.id) pnBad++; if (/^Bracket \w+$/.test(model.parts[i].name)) sameNames++; });
    ck('R3: each part carries its own product\'s part number, also where many parts share one name (' + sameNames + ' brackets named alike)', pnBad === 0 && sameNames > 20, pnBad + ' wrong');
    // R4
    const cf = B.convertFast(FM, RW, { keep: false });
    ck('R4: the whole-file reader (convertFast) gives the same part ids and says the tree is full', cf.model.tree && cf.model.tree.full === true && cf.model.parts.length === sw.length && cf.model.parts.every((p, i) => p.pid === sw[i].pid));
    const ss = B.openSessionFast(FM, RW), deep = sw.filter(w => w.path.length >= 4)[3];
    let pr = null; try { pr = ss.properties(deep.pid); } catch (e) { pr = null; }
    ck('R4: an exact session on the whole file answers for a deep part by its id', !!pr && pr.volume > 0, deep && deep.pid);
    try { ss.close && ss.close(); } catch (_) {}
    // R5
    const hix = S.index(HAND.u8), hst = S.structure(hix), box = k => S.leafInfo(hix, hst, HAND.parts[k].pd).box;
    ck('R5: a 20 mm arc of a 2 m circle is boxed as the arc, not the circle', boxNear(box('arc'), [HAND.arc.x2, 0, 0], [2000, HAND.arc.y2, 0], 1e-6), J(box('arc')));
    ck('R5: the same vertices the long way round (against the curve) take nearly the whole circle', boxNear(box('longWay'), [-2000, -2000, 0], [2000, 2000, 0], 1e-6), J(box('longWay')));
    ck('R5: a full circle (one vertex) is boxed whole', boxNear(box('full'), [90, -10, 0], [110, 10, 0], 1e-9), J(box('full')));
    ck('R5: a quarter ellipse is boxed as the quarter', boxNear(box('ellipse'), [0, 0, 0], [30, 10, 0], 1e-9), J(box('ellipse')));
    ck('R5: a B-spline edge counts its control points; a far B-spline surface net and a far line point do not', boxNear(box('spline'), [0, 0, 0], [100, 40, 0], 1e-9), J(box('spline')));
    ck('R5: a B-spline face bulging past its edges keeps its bulge (its control net is close to the part)', boxNear(box('bulge'), [0, 0, 0], [100, 100, 15], 1e-9), J(box('bulge')));
    return out;
}

// R7: the import marks a box estimated from the file; the engine takes no answer from it until the true box arrives
const ZS = read('cad_zonal.js'), ZM = read('zonal_model.js'), FE = read('fta_engine.js'), XS = read('zonal_exchange.js');
function estChecks(over) {
    over = over || {};
    const out = [], ck = (n, c, d) => out.push([n, !!c, d]);
    const sb = Object.assign({}, BASE, { RegExp, setTimeout: () => 0, scheduleAutosave: () => {}, projectName: 'Estimates', projectConfig: {}, systemsData: [{ id: 'EQ1', name: 'Pump', partNumber: 'PN-1' }, { id: 'EQ2', name: 'Valve', partNumber: 'PN-2' }], acFhaData: [], ftaPages: [], zsaData: [], praData: [] });
    sb.window = sb; sb.self = sb; sb.globalThis = sb; vm.createContext(sb);
    [['zonal_model.js', ZM], ['fta_engine.js', FE], ['cad_zonal.js', over.zonal || ZS], ['cad_import.js', over.imp || IS], ['zonal_exchange.js', XS]].forEach(([f, s]) => vm.runInContext(s, sb, { filename: f }));
    const C = sb.SLCadZonal, I = sb.SLCadImport, X = sb.SLZonalExchange;
    // a model as the structure reader hands it: part a's shape read (a real prototype), part b still a box estimate
    const box = (x0, x1) => ({ min: [x0, 0, 0], max: [x1, 10, 10] });
    const model = { parts: [{ pid: 'p:A/a#1', name: 'a', partNumber: 'PN-1', path: ['A'], bbox: box(0, 10), centroid: [5, 5, 5] }, { pid: 'p:A/b#1', name: 'b', partNumber: 'PN-2', path: ['A'], bbox: box(100, 9000), centroid: [4550, 5, 5] }],
        meshes: [{ pid: 'p:A/a#1', proto: 0, matrix: null }, { pid: 'p:A/b#1', proto: 1, matrix: null }],
        protos: [{ position: new Float32Array([0, 0, 0, 10, 10, 10]), index: new Uint32Array([0, 1, 0]) }, { position: new Float32Array([100, 0, 0, 9000, 10, 10]), index: new Uint32Array([0, 1, 0]), box: true }] };
    const entry = I.projectEntry(model, { fileName: 'e.step', sha256: 'e1' });
    ck('R7: the import marks the part whose box is still an estimate, and only it', entry.parts[1].boxEstimated === true && !entry.parts[0].boxEstimated);
    const P = I.unpackParts(I.packParts(entry.parts, null), null);
    ck('R7: the mark survives this computer\'s cache', P[1].boxEstimated === true && !P[0].boxEstimated);
    const m = C.addCadModel(Object.assign({ units: 'mm' }, entry)).model;
    C.importZoneList([{ code: '100', name: 'Bay', xMin: -1, yMin: -1, zMin: -1, xMax: 20000, yMax: 20, zMax: 20 }]);
    C.confirmLink(m.id, 'p:A/a#1', 'EQ1', 'W. Engineer'); C.confirmLink(m.id, 'p:A/b#1', 'EQ2', 'W. Engineer');
    C.addRiskVolume({ id: 'prv-1', kind: 'fire', label: 'Fire', shape: { kind: 'box', min: [-5, -5, -5], max: [20000, 20, 20] } });
    const c = C.containment(m.id);
    ck('R7: containment lists the estimated part apart, in no zone and not outside', J(c.estimated) === J(['p:A/b#1']) && c.parts.find(r => r.pid === 'p:A/b#1').zoneId === null && c.outside.indexOf('p:A/b#1') < 0 && c.byZone[Object.keys(c.byZone)[0]].indexOf('p:A/a#1') >= 0);
    ck('R7: a risk volume does not count it, and says its result is not final', J(C.partsInVolume('prv-1', m.id).map(x => x.pid)) === J(['p:A/a#1']) && /still being read/.test(C.riskImpact('prv-1', { cadId: m.id }).notEvaluated || ''));
    const plan = C.applyContainment(m.id);
    ck('R7: equipment with an estimated part waits; the rest is placed', plan.waiting.some(w => w.sysId === 'EQ2') && plan.assign.some(a => a.sysId === 'EQ1') && !plan.assign.some(a => a.sysId === 'EQ2'));
    ck('R7: the Sys Lab file says sizes are still being read', X.exportPicture({ at: '2026-10-17T00:00:00Z' }).gaps.some(g => /still being read/.test(g)));
    // the true boxes arrive: trueBoxes from the real shapes, then updatePartBoxes
    model.protos[1] = { position: new Float32Array([100, 0, 0, 120, 10, 10]), index: new Uint32Array([0, 1, 0]) };
    const upd = I.trueBoxes(model); C.updatePartBoxes(m.id, upd);
    const c2 = C.containment(m.id);
    ck('R7: once its shape is read, the mark goes and the part is placed and counted', C.estimatedParts(m.id).length === 0 && c2.estimated.length === 0 && C.partsInVolume('prv-1', m.id).length === 2 && !C.riskImpact('prv-1', { cadId: m.id }).notEvaluated && C.applyContainment(m.id).assign.some(a => a.sysId === 'EQ2'));
    // a part whose shape could not be read keeps its estimate and its mark
    const model2 = JSON.parse(JSON.stringify({ parts: model.parts, meshes: model.meshes })); model2.protos = [model.protos[0], { position: new Float32Array([0, 0, 0, 1, 1, 1]), index: new Uint32Array([0, 1, 0]), box: true }];
    ck('R7: a part whose shape was never read keeps its estimate (no true box is made up for it)', I.trueBoxes(model2).every(u => u.pid !== 'p:A/b#1'));
    return out;
}

(async () => {
    const FM = await require(path.join(SITE, 'vendor', 'occt-fast', 'slcad_occt.js'))({ print: () => {}, printErr: () => {} });
    console.log('\n[R1 to R5] the generated real-world aircraft (' + gst.components + ' components) and the hand-written file');
    const base = await checks(load(), FM);
    base.forEach(([n, c, d]) => check(n, c, d));

    console.log('\n[R6] mutations (each must turn a check red)');
    const M = [
        ['struct', 'a styled item followed from its shared style', '                    if (item !== id) continue;\n', '\n'],
        ['struct', 'every point of the part counted (far plane and line origins)', '                if (onPart && !onPart[id]) continue;\n', '\n'],
        ['struct', 'an arc taken as its whole circle', 'if (norm2pi(tt - t0) <= span + 1e-12) add(at(tt));', 'add(at(tt));'],
        ['struct', 'the edge\'s sense ignored', 'same = !(a[4] && a[4].enum === \'F\');', 'same = true;'],
        ['struct', 'a bulging B-spline face cut to its edges', '        if (any) surfaceNets(ix, c.ids).forEach(', '        if (false) surfaceNets(ix, c.ids).forEach('],
        ['struct', 'a far untrimmed surface net taken whole', 'if (ns <= 4 * size + 10 && ', 'if (true || '],
        ['struct', 'line breaks kept in names', '            if (c === 10 || c === 13) { p.i++; continue; }\n', '\n'],
        ['struct', 'the path stops at the top two levels', 'var down = trail.concat([st.pdName[pd]]);', 'var down = trail;'],
        ['imp', 'the full path ignored when naming parts', '                if (Array.isArray(m.trail)) {', '                if (false) {'],
        ['imp', 'the part number looked up by name', 'var pn = m.partNumber !== undefined ? m.partNumber : ', 'var pn = '],
        ['brep', 'the whole-file reader without the full paths', "var tree = I.attachTrails ? I.attachTrails(res, u8) : { full: false, why: 'no attachTrails' };", "var tree = { full: false };"]
    ];
    for (const [which, name, a, b] of M) {
        const src = which === 'struct' ? SS : which === 'imp' ? IS : BS;
        if (src.indexOf(a) < 0) { check('R6: mutation anchor present: ' + name, false); continue; }
        let red = false;
        try { const r = await checks(load({ [which]: src.replace(a, b) }), FM); red = r.some(x => !x[1]); } catch (e) { red = true; }
        check('R6: mutation caught: ' + name, red);
    }
    console.log('\n[R7] a box still estimated from the file gives no zone, risk or placement answer');
    const est = estChecks();
    est.forEach(([n, c, d]) => check(n, c, d));
    const EM = [
        ['zonal', 'an estimated box placed in a zone', "            if (est[p.pid]) { res.estimated.push(p.pid); res.parts.push({ pid: p.pid, zoneId: null, estimated: true }); return; }\n", '\n'],
        ['zonal', 'an estimated box counted in a risk volume', "            if (est[p.pid]) return;   // its size is not known yet\n", '\n'],
        ['zonal', 'a risk result with estimated parts called final', 'if (nEst) { var why', 'if (false) { var why'],
        ['zonal', 'equipment placed from an estimated part', 'if (waitOn.length) { out.waiting.push', 'if (false) { out.waiting.push'],
        ['zonal', 'the mark kept after the true box arrives', '                delete p.boxEstimated;   // the true box, from the part\'s shape\n', '\n'],
        ['imp', 'the import does not mark estimated boxes', 'if (p.boxEstimated || (pr && pr.box)) q.boxEstimated = true;', ''],
        ['imp', 'an unread part given its estimate as the true box', "            if (model.protos[m.proto].box) return;   // still the estimated box: its shape was not read (it stays marked as an estimate)\n", '\n'],
        ['imp', 'the mark lost in this computer\'s cache', '            if (p.boxEstimated) est[i] = 1;\n', '\n']
    ];
    for (const [which, name, a, b] of EM) {
        const src = which === 'zonal' ? ZS : IS;
        if (src.indexOf(a) < 0) { check('R7: mutation anchor present: ' + name, false); continue; }
        let red = false;
        try { red = estChecks({ [which]: src.replace(a, b) }).some(x => !x[1]); } catch (e) { red = true; }
        check('R7: mutation caught: ' + name, red);
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); });

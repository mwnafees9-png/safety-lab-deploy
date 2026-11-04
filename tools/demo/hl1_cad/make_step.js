#!/usr/bin/env node
/* The Aeolus HL-1 CAD model, full size, as a STEP AP214 assembly (17 Oct 2026; Safety Lab demo copy 4 Nov 2026).
     node tools/demo/hl1_cad/make_step.js [out.step]
   4 Nov 2026 (Safety Lab HL-1 demo): the shapes read as what they are: engines, pumps, actuators, motors, valves,
   bottles and accumulators are cylinders along their long axis; each main bogie has four wheels on a beam and a strut,
   the nose gear two wheels; every engine has its fan disc and high-pressure turbine disc (the rotors the rotor burst
   analysis is about); the fuselage has stringers between the frames. Positions and sizes are unchanged, so the
   zones, the routes and the analyses are the same.
   What the program's CAD tool would hand over: the primary structure (fuselage frames and floor, wing spars and ribs,
   pylons, nacelles, twin fins and tailplane), every one of the 300 units placed where geometry.js and items.js put it,
   and every harness and pipe run as an assembly named by its line number, one tube per stretch of at most 1 m.
   - a unit is a product named by its part number and name; its installed copy (the STEP instance) is named by its
     ident, which Safety Lab's and Sys Lab's CAD readers take as the designator that links it to the element;
   - a run is ROUTING / <kind> / <line number>; each tube's instance is "<line number>.<stretch>";
   - meters in the model, millimeters in the file; deterministic: the same inputs give the same bytes.
   Written directly as STEP text, the same way as Safety Lab's scale test aircraft (tests/fixtures/cad/make_aircraft_step.js),
   whose B-rep writers this follows. Routing and geometry stay the CAD tool's: Sys Lab and Safety Lab only read them. */
'use strict';
const fs = require('fs'), path = require('path');
const GEO = require('./geometry'), ITEMS = require('./items'), ROUTES = require('./routes'), SYS = require('./systems');

function generate(OUT) {
  const fd = fs.openSync(OUT, 'w');
  let buf = [], bufLen = 0, bytes = 0, id = 0;
  const flush = () => { if (!buf.length) return; const s = buf.join(''); fs.writeSync(fd, s, null, 'latin1'); bytes += s.length; buf = []; bufLen = 0; };
  const w = s => { buf.push(s); bufLen += s.length; if (bufLen > 1 << 20) flush(); };
  const E = s => { id++; w('#' + id + '=' + s + ';\n'); return id; };
  const f = v => { const r = Math.round(v * 1e4) / 1e4; return Number.isInteger(r) ? r + '.' : String(r); };
  const q = s => String(s).replace(/'/g, "''").replace(/[^\x20-\x7e]/g, c => ({ '×': 'x', '–': '-', '—': '-', 'Ø': 'D' }[c] || '?'));
  const P = (x, y, z) => E("CARTESIAN_POINT('',(" + f(x) + ',' + f(y) + ',' + f(z) + '))');
  const D = (x, y, z) => E("DIRECTION('',(" + f(x) + ',' + f(y) + ',' + f(z) + '))');
  const AX = (o, z, x) => E("AXIS2_PLACEMENT_3D('',#" + P(o[0], o[1], o[2]) + ',#' + D(z[0], z[1], z[2]) + ',#' + D(x[0], x[1], x[2]) + ')');
  const MM = 1000;

  w("ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Aeolus HL-1 outsized freighter, full size: structure, equipment and routing'),'2;1');\n" +
    "FILE_NAME('aeolus_hl1.step','2026-10-17T00:00:00',('Aeolus systems team'),('Aeolus program (demo)'),'make_step.js','Sys Lab demo','');\n" +
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n");
  const appCtx = E("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
  E("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#" + appCtx + ')');
  const prodCtx = E("PRODUCT_CONTEXT('',#" + appCtx + ",'mechanical')");
  const pdCtx = E("PRODUCT_DEFINITION_CONTEXT('part definition',#" + appCtx + ",'design')");
  const mm = E('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )');
  const rad = E('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )');
  const sr = E('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
  const unc = E("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-03),#" + mm + ",'distance_accuracy_value','confusion accuracy')");
  const ctx = E('( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#' + unc + ')) GLOBAL_UNIT_ASSIGNED_CONTEXT((#' + mm + ',#' + rad + ',#' + sr + ")) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )");

  // ---------------- colors, one style per color
  const styled = [], psaOf = {};
  const style = (item, rgb) => {
    const key = rgb.join(',');
    if (!psaOf[key]) {
      const c = E("COLOUR_RGB(''," + f(rgb[0]) + ',' + f(rgb[1]) + ',' + f(rgb[2]) + ')');
      const fa = E("FILL_AREA_STYLE('',(#" + E("FILL_AREA_STYLE_COLOUR('',#" + c + ')') + '))');
      const ssa = E("SURFACE_SIDE_STYLE('',(#" + E('SURFACE_STYLE_FILL_AREA(#' + fa + ')') + '))');
      psaOf[key] = E('PRESENTATION_STYLE_ASSIGNMENT((#' + E('SURFACE_STYLE_USAGE(.BOTH.,#' + ssa + ')') + '))');
    }
    styled.push(E("STYLED_ITEM('color',(#" + psaOf[key] + '),#' + item + ')'));
  };

  // ---------------- products
  let nProducts = 0;
  const product = (pn, name, descr, repType, items) => {
    nProducts++;
    const prod = E("PRODUCT('" + q(pn) + "','" + q(name) + "','" + q(descr || '') + "',(#" + prodCtx + '))');
    E("PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(#" + prod + '))');
    const pdf = E("PRODUCT_DEFINITION_FORMATION('','',#" + prod + ')');
    const pd = E("PRODUCT_DEFINITION('design','',#" + pdf + ',#' + pdCtx + ')');
    const pds = E("PRODUCT_DEFINITION_SHAPE('','',#" + pd + ')');
    const origin = AX([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    return { pd, origin, items: [origin].concat(items || []), repType, pds };
  };
  // The CAD tool's own attributes on a product (19 Oct 2026, build 6), as CATIA and Creo export them: the CAx-IF
  // Recommended Practices for User Defined Attributes (GENERAL_PROPERTY, PROPERTY_DEFINITION, a REPRESENTATION holding
  // a DESCRIPTIVE_REPRESENTATION_ITEM, tied by GENERAL_PROPERTY_ASSOCIATION). Sys Lab reads a run's type from them.
  const udaCtx = E("REPRESENTATION_CONTEXT('user defined attributes','')");
  const uda = (pd, attrs) => { for (const [k, v] of attrs) { const gp = E("GENERAL_PROPERTY('','" + q(k) + "',$)"), pdef = E("PROPERTY_DEFINITION('" + q(k) + "',$,#" + pd + ')'), it = E("DESCRIPTIVE_REPRESENTATION_ITEM('','" + q(v) + "')"), rep = E("REPRESENTATION('',(#" + it + '),#' + udaCtx + ')'); E('PROPERTY_DEFINITION_REPRESENTATION(#' + pdef + ',#' + rep + ')'); E("GENERAL_PROPERTY_ASSOCIATION('',$,#" + gp + ',#' + pdef + ')'); } };
  const closeRep = r => { r.rep = E(r.repType + "('',(" + r.items.map(i => '#' + i).join(',') + '),#' + ctx + ')'); E('SHAPE_DEFINITION_REPRESENTATION(#' + r.pds + ',#' + r.rep + ')'); return r; };
  const partProduct = (pn, name, descr, solid, rgb) => { const ss = Array.isArray(solid) ? solid : [solid]; const r = product(pn, name, descr, 'ADVANCED_BREP_SHAPE_REPRESENTATION', ss); ss.forEach(x => style(x, rgb)); return closeRep(r); };

  // ---------------- B-rep solids (millimeters, in the part's own frame)
  const VP = p => E("VERTEX_POINT('',#" + P(p[0], p[1], p[2]) + ')');
  const lineEdge = (va, vb, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    const ln = E("LINE('',#" + P(a[0], a[1], a[2]) + ",#" + E("VECTOR('',#" + D(dx / L, dy / L, dz / L) + ',' + f(L) + ')') + ')');
    return E("EDGE_CURVE('',#" + va + ',#' + vb + ',#' + ln + ',.T.)');
  };
  const OE = (e, fwd) => E("ORIENTED_EDGE('',*,*,#" + e + ',' + (fwd ? '.T.' : '.F.') + ')');
  const loop = oes => E("EDGE_LOOP('',(" + oes.map(o => '#' + o).join(',') + '))');
  const planeFace = (origin, n, xdir, bounds) => {
    const pl = E("PLANE('',#" + AX(origin, n, xdir) + ')');
    const bs = bounds.map((b, i) => E((i === 0 ? 'FACE_OUTER_BOUND' : 'FACE_BOUND') + "('',#" + b + ',.T.)'));
    return E("ADVANCED_FACE('',(" + bs.map(b => '#' + b).join(',') + '),#' + pl + ',.T.)');
  };
  const solid = faces => E("MANIFOLD_SOLID_BREP('',#" + E("CLOSED_SHELL('',(" + faces.map(x => '#' + x).join(',') + '))') + ')');
  // an extruded polygon (counterclockwise in XY), height h along Z
  const prism = (pts, h) => {
    const k = pts.length, B = pts.map(p => [p[0], p[1], 0]), T = pts.map(p => [p[0], p[1], h]);
    const vb = B.map(VP), vt = T.map(VP), eb = [], et = [], ev = [];
    for (let i = 0; i < k; i++) { const j = (i + 1) % k; eb.push(lineEdge(vb[i], vb[j], B[i], B[j])); et.push(lineEdge(vt[i], vt[j], T[i], T[j])); }
    for (let i = 0; i < k; i++) ev.push(lineEdge(vb[i], vt[i], B[i], T[i]));
    const faces = [planeFace([0, 0, h], [0, 0, 1], [1, 0, 0], [loop(et.map(e => OE(e, true)))]), planeFace([0, 0, 0], [0, 0, -1], [1, 0, 0], [loop(eb.slice().reverse().map(e => OE(e, false)))])];
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k, dx = B[j][0] - B[i][0], dy = B[j][1] - B[i][1], L = Math.hypot(dx, dy);
      faces.push(planeFace(B[i], [dy / L, -dx / L, 0], [dx / L, dy / L, 0], [loop([OE(eb[i], true), OE(ev[j], true), OE(et[i], false), OE(ev[i], false)])]));
    }
    return solid(faces);
  };
  // the same, its outline drawn in the XZ plane (side view) and pushed along +Y by h: one solid, so a unit keeps one part
  // (and its designator) however its outline goes. The rotation (x, y, z) -> (x, h - z, y) is proper: faces stay valid.
  const prismXZ = (pts, h) => {
    const T = p => [p[0], h - p[2], p[1]], Td = d => [d[0], -d[2], d[1]];
    const k = pts.length, B = pts.map(p => T([p[0], p[1], 0])), Tp = pts.map(p => T([p[0], p[1], h]));
    const vb = B.map(VP), vt = Tp.map(VP), eb = [], et = [], ev = [];
    for (let i = 0; i < k; i++) { const j = (i + 1) % k; eb.push(lineEdge(vb[i], vb[j], B[i], B[j])); et.push(lineEdge(vt[i], vt[j], Tp[i], Tp[j])); }
    for (let i = 0; i < k; i++) ev.push(lineEdge(vb[i], vt[i], B[i], Tp[i]));
    const faces = [planeFace(T([0, 0, h]), Td([0, 0, 1]), Td([1, 0, 0]), [loop(et.map(e => OE(e, true)))]), planeFace(T([0, 0, 0]), Td([0, 0, -1]), Td([1, 0, 0]), [loop(eb.slice().reverse().map(e => OE(e, false)))])];
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k, dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1], L = Math.hypot(dx, dy);
      faces.push(planeFace(B[i], Td([dy / L, -dx / L, 0]), Td([dx / L, dy / L, 0]), [loop([OE(eb[i], true), OE(ev[j], true), OE(et[i], false), OE(ev[i], false)])]));
    }
    return solid(faces);
  };
  // a side-view outline: wheels (circles of radius r centred at (x, r)) on a beam, and a strut up to height H
  const gearOutline = (xs, r, beamT, strutW, H) => {
    const n = 14, th = Math.asin(Math.min(0.95, beamT / r)), out = [], arc = (cx, a0, a1) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + r * Math.cos(a), r + r * Math.sin(a)]); } };
    const mid = (xs[0] + xs[xs.length - 1]) / 2;
    if (xs.length === 1) {   // one wheel and the strut above it
      const sx = Math.min(strutW, r * 0.9);
      arc(xs[0], Math.PI / 2 + Math.asin(sx / r), 2 * Math.PI + Math.PI / 2 - Math.asin(sx / r));
      out.push([xs[0] + sx, H], [xs[0] - sx, H]);
      return out;
    }
    const a = xs[0], b = xs[xs.length - 1];
    arc(b, Math.PI + th, 2 * Math.PI + Math.PI - th);          // the rear wheel, from the beam's bottom round to its top
    out.push([mid + strutW, r + beamT], [mid + strutW, H], [mid - strutW, H], [mid - strutW, r + beamT]);   // the strut on the beam
    arc(a, th, 2 * Math.PI - th);                              // the front wheel
    return out;
  };
  // a box a × b × c with a corner at the origin
  const box = (a, b, c) => prism([[0, 0], [a, 0], [a, b], [0, b]], c);
  const circle = (z, r) => E("CIRCLE('',#" + AX([0, 0, z], [0, 0, 1], [1, 0, 0]) + ',' + f(r) + ')');
  const cylSurf = r => E("CYLINDRICAL_SURFACE('',#" + AX([0, 0, 0], [0, 0, 1], [1, 0, 0]) + ',' + f(r) + ')');
  const cylFace = (cTop, cBot, seam, r, outward) => E("ADVANCED_FACE('',(#" + E("FACE_OUTER_BOUND('',#" + loop([OE(cBot, true), OE(seam, true), OE(cTop, false), OE(seam, false)]) + ',.T.)') + '),#' + cylSurf(r) + ',' + (outward ? '.T.' : '.F.') + ')');
  // a rod of radius r and length L along +Z
  const rod = (r, L) => {
    const v0 = VP([r, 0, 0]), v1 = VP([r, 0, L]);
    const c0 = E("EDGE_CURVE('',#" + v0 + ',#' + v0 + ',#' + circle(0, r) + ',.T.)'), c1 = E("EDGE_CURVE('',#" + v1 + ',#' + v1 + ',#' + circle(L, r) + ',.T.)');
    const s0 = lineEdge(v0, v1, [r, 0, 0], [r, 0, L]);
    return solid([planeFace([0, 0, 0], [0, 0, -1], [1, 0, 0], [loop([OE(c0, false)])]), cylFace(c1, c0, s0, r, true), planeFace([0, 0, L], [0, 0, 1], [1, 0, 0], [loop([OE(c1, true)])])]);
  };
  // a rod of radius r and length L from o along the unit axis z (x: any unit vector square to z), in the part's frame
  const rodAt = (r, L, o, z, x) => {
    const add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
    const o1 = add(o, z, L), p0 = add(o, x, r), p1 = add(o1, x, r);
    const v0 = VP(p0), v1 = VP(p1);
    const C = (c) => E("CIRCLE('',#" + AX(c, z, x) + ',' + f(r) + ')');
    const c0 = E("EDGE_CURVE('',#" + v0 + ',#' + v0 + ',#' + C(o) + ',.T.)'), c1 = E("EDGE_CURVE('',#" + v1 + ',#' + v1 + ',#' + C(o1) + ',.T.)');
    const s0 = lineEdge(v0, v1, p0, p1);
    const surf = E("CYLINDRICAL_SURFACE('',#" + AX(o, z, x) + ',' + f(r) + ')');
    const side = E("ADVANCED_FACE('',(#" + E("FACE_OUTER_BOUND('',#" + loop([OE(c0, true), OE(s0, true), OE(c1, false), OE(s0, false)]) + ',.T.)') + '),#' + surf + ',.T.)');
    return solid([planeFace(o, z.map(v => -v), x, [loop([OE(c0, false)])]), side, planeFace(o1, z, x, [loop([OE(c1, true)])])]);
  };
  // a solid box from corner a to corner b (millimeters, in the part's frame)
  const boxAt = (a, b) => {
    const k = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]], h = b[2] - a[2];
    const B = k.map(p => [p[0], p[1], a[2]]), T = k.map(p => [p[0], p[1], b[2]]);
    const vb = B.map(VP), vt = T.map(VP), eb = [], et = [], ev = [];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; eb.push(lineEdge(vb[i], vb[j], B[i], B[j])); et.push(lineEdge(vt[i], vt[j], T[i], T[j])); }
    for (let i = 0; i < 4; i++) ev.push(lineEdge(vb[i], vt[i], B[i], T[i]));
    const faces = [planeFace(T[0], [0, 0, 1], [1, 0, 0], [loop(et.map(e => OE(e, true)))]), planeFace(B[0], [0, 0, -1], [1, 0, 0], [loop(eb.slice().reverse().map(e => OE(e, false)))])];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, dx = B[j][0] - B[i][0], dy = B[j][1] - B[i][1], L = Math.hypot(dx, dy); faces.push(planeFace(B[i], [dy / L, -dx / L, 0], [dx / L, dy / L, 0], [loop([OE(eb[i], true), OE(ev[j], true), OE(et[i], false), OE(ev[i], false)])])); }
    void h; return solid(faces);
  };
  // a ring (a frame, a nacelle barrel): outer radius ro, inner ri, depth L along +Z
  const ring = (ro, ri, L) => {
    const vo0 = VP([ro, 0, 0]), vo1 = VP([ro, 0, L]), vi0 = VP([ri, 0, 0]), vi1 = VP([ri, 0, L]);
    const co0 = E("EDGE_CURVE('',#" + vo0 + ',#' + vo0 + ',#' + circle(0, ro) + ',.T.)'), co1 = E("EDGE_CURVE('',#" + vo1 + ',#' + vo1 + ',#' + circle(L, ro) + ',.T.)');
    const ci0 = E("EDGE_CURVE('',#" + vi0 + ',#' + vi0 + ',#' + circle(0, ri) + ',.T.)'), ci1 = E("EDGE_CURVE('',#" + vi1 + ',#' + vi1 + ',#' + circle(L, ri) + ',.T.)');
    const so = lineEdge(vo0, vo1, [ro, 0, 0], [ro, 0, L]), si = lineEdge(vi0, vi1, [ri, 0, 0], [ri, 0, L]);
    return solid([planeFace([0, 0, 0], [0, 0, -1], [1, 0, 0], [loop([OE(co0, false)]), loop([OE(ci0, true)])]), cylFace(co1, co0, so, ro, true), cylFace(ci1, ci0, si, ri, false),
      planeFace([0, 0, L], [0, 0, 1], [1, 0, 0], [loop([OE(co1, true)]), loop([OE(ci1, false)])])]);
  };

  // ---------------- assemblies: children [{ child, m: [ox,oy,oz, zx,zy,zz, xx,xy,xz], name }]
  let nComponents = 0;
  const assembly = (pn, name, descr, children) => {
    const r = product(pn, name, descr, 'SHAPE_REPRESENTATION', []), links = [];
    children.forEach(c => { const ax = AX([c.m[0], c.m[1], c.m[2]], [c.m[3], c.m[4], c.m[5]], [c.m[6], c.m[7], c.m[8]]); r.items.push(ax); links.push({ c, ax }); });
    closeRep(r);
    links.forEach((l, i) => {
      nComponents++;
      const nauo = E("NEXT_ASSEMBLY_USAGE_OCCURRENCE('" + (i + 1) + "','" + q(l.c.name || '') + "','',#" + r.pd + ',#' + l.c.child.pd + ',$)');
      const pds = E("PRODUCT_DEFINITION_SHAPE('Placement','Placement of an item',#" + nauo + ')');
      const idt = E("ITEM_DEFINED_TRANSFORMATION('','',#" + l.c.child.origin + ',#' + l.ax + ')');
      const rel = E("( REPRESENTATION_RELATIONSHIP('','',#" + l.c.child.rep + ',#' + r.rep + ') REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#' + idt + ') SHAPE_REPRESENTATION_RELATIONSHIP() )');
      E('CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#' + rel + ',#' + pds + ')');
    });
    return r;
  };
  const at = (x, y, z) => [x * MM, y * MM, z * MM, 0, 0, 1, 1, 0, 0];
  // a frame whose local Z runs along d (a unit vector), any X square to it
  const along = (o, d) => { const ax = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; let xx = [d[1] * ax[2] - d[2] * ax[1], d[2] * ax[0] - d[0] * ax[2], d[0] * ax[1] - d[1] * ax[0]]; const n = Math.hypot(...xx); xx = xx.map(v => v / n); return [o[0] * MM, o[1] * MM, o[2] * MM, d[0], d[1], d[2], xx[0], xx[1], xx[2]]; };

  // ---------------- the primary structure
  const GREY = [0.72, 0.74, 0.78], DARK = [0.55, 0.58, 0.62];
  const { R, ZC, ENG, ENG_X, ENG_Z, ENG_D } = GEO;
  const structKids = [], cache = {};
  const boxPart = (pn, name, a, b, c, rgb) => cache[pn] || (cache[pn] = partProduct(pn, name, '', box(a * MM, b * MM, c * MM), rgb || GREY));
  const putBox = (pn, name, x0, x1, y0, y1, z0, z1, inst, rgb) => structKids.push({ child: boxPart(pn, name, x1 - x0, y1 - y0, z1 - z0, rgb), m: at(x0, y0, z0), name: inst });
  // fuselage frames: a nose that grows to the full barrel, the barrel, and a tail that narrows and sweeps up
  const frames = [];
  for (let x = 1; x < 9; x += 2) frames.push([x, R * Math.sqrt(x / 9), ZC - 1.0 * (1 - x / 9)]);
  for (let x = 9; x <= 95; x += 2) frames.push([x, R, ZC]);
  for (let x = 97; x <= 107; x += 2) { const t = (x - 95) / 14; frames.push([x, R - (R - 1.4) * t, ZC + 2.1 * t]); }
  frames.forEach(([x, r, zc], i) => {
    const pn = 'HL1-5310-' + String(Math.round(r * 100)).padStart(3, '0');
    const part = cache[pn] || (cache[pn] = partProduct(pn, 'Fuselage frame R' + r.toFixed(2), 'Fuselage frame, ' + (r * 2).toFixed(2) + ' m', ring(r * MM, (r - 0.12) * MM, 120), GREY));
    structKids.push({ child: part, m: along([x, 0, zc], [1, 0, 0]), name: 'FR' + String(i + 1).padStart(2, '0') });
  });
  putBox('HL1-5320-001', 'Cargo floor', 8.5, 95, -3.9, 3.9, 3.2, 3.4, 'FLOOR-HOLD', DARK);
  putBox('HL1-5320-002', 'Flight deck floor', 7, 21, -2.6, 2.6, 10.9, 11.0, 'FLOOR-FDCK', DARK);
  putBox('HL1-5330-001', 'Keel beam', 14.5, 45, -0.3, 0.3, 2.45, 2.6, 'KEEL', DARK);
  putBox('HL1-5340-001', 'Aft pressure bulkhead', 99.8, 100, -3.6, 3.6, 3.6, 10.0, 'BHD-AFT', DARK);
  // the wing: center box, then front and rear spars and ribs on each side
  putBox('HL1-5710-001', 'Center wing box front spar', 41.6, 41.8, -4.3, 4.3, 9.6, 11.8, 'CWB-FS');
  putBox('HL1-5710-002', 'Center wing box rear spar', 53.0, 53.2, -4.3, 4.3, 9.6, 11.8, 'CWB-RS');
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R', y0 = s < 0 ? -40 : 4.3, y1 = s < 0 ? -4.3 : 40;
    putBox('HL1-5711-001', 'Wing front spar', 41.6, 41.8, y0, y1, 9.6, 12.2, 'WING-' + L + '-FS');
    putBox('HL1-5712-001', 'Wing rear spar', 53.0, 53.2, y0, y1, 9.6, 12.2, 'WING-' + L + '-RS');
    for (let k = 0, y = 6; y < 40; y += 3, k++) putBox('HL1-5713-001', 'Wing rib', 41.8, 53.0, s * y - 0.03, s * y + 0.03, 9.7, 12.1, 'WING-' + L + '-RIB' + String(k + 1).padStart(2, '0'));
  }
  // pylons and nacelle barrels
  for (const e of ENG) {
    putBox('HL1-5410-001', 'Pylon box', 33, 41, e.y - 0.6, e.y + 0.6, 9.6, 10.9, 'PYL-' + e.n);
    const nac = cache.nac || (cache.nac = partProduct('HL1-5420-001', 'Nacelle barrel', 'Nacelle, fan face to exhaust', ring(ENG_D / 2 * MM, (ENG_D / 2 - 0.08) * MM, (ENG_X[1] - ENG_X[0]) * MM), GREY));
    structKids.push({ child: nac, m: along([ENG_X[0], e.y, ENG_Z], [1, 0, 0]), name: 'NAC-' + e.n });
  }
  // 4 Nov 2026: each engine's fan disc and high-pressure turbine disc, the rotors a rotor burst comes from
  for (const e of ENG) {
    const fan = cache.fan || (cache.fan = partProduct('HL1-7221-001', 'Fan rotor disc', 'Fan disc and blades, plane of rotation', rodAt(ENG_D / 2 * 0.9 * MM, 250, [0, 0, 0], [0, 0, 1], [1, 0, 0]), [0.45, 0.47, 0.52]));
    structKids.push({ child: fan, m: along([ENG_X[0] + 0.7, e.y, ENG_Z], [1, 0, 0]), name: 'ENG-' + e.n + '-FAN' });
    const hpt = cache.hpt || (cache.hpt = partProduct('HL1-7250-001', 'High-pressure turbine disc', 'HP turbine disc, plane of rotation', rodAt(560, 160, [0, 0, 0], [0, 0, 1], [1, 0, 0]), [0.6, 0.35, 0.3]));
    structKids.push({ child: hpt, m: along([ENG_X[0] + 4.6, e.y, ENG_Z], [1, 0, 0]), name: 'ENG-' + e.n + '-HPT' });
  }
  // 4 Nov 2026: stringers along the barrel, inside the frames
  for (let k = 0; k < 16; k++) {
    const a = (k + 0.5) / 16 * 2 * Math.PI, rr = R - 0.18;
    const st = cache.str || (cache.str = partProduct('HL1-5315-001', 'Fuselage stringer', 'Stringer, barrel section', rodAt(30, 86 * MM, [0, 0, 0], [0, 0, 1], [1, 0, 0]), GREY));
    structKids.push({ child: st, m: along([9, rr * Math.cos(a), ZC + rr * Math.sin(a)], [1, 0, 0]), name: 'STR' + String(k + 1).padStart(2, '0') });
  }
  // twin fins and the tailplane
  for (const s of [-1, 1]) putBox('HL1-5510-001', 'Fin', 98, 106, s * 8 - 0.15, s * 8 + 0.15, 10.4, 21, 'FIN-' + (s < 0 ? 'L' : 'R'));
  putBox('HL1-5520-001', 'Horizontal stabilizer', 99, 105, -16, 16, 10.6, 10.9, 'HSTAB');
  const structure = assembly('HL1-5000', 'STRUCTURE', 'Primary structure (simplified)', structKids);

  // ---------------- the equipment: one assembly per system, each unit placed as an installed copy named by its ident
  const ATA_COLOR = a => { const n = parseInt(a, 10); return n === 24 ? [0.95, 0.75, 0.2] : n === 27 || n === 22 ? [0.25, 0.5, 0.9] : n === 29 ? [0.3, 0.75, 0.4] : n === 28 ? [0.85, 0.45, 0.2] : n === 32 ? [0.5, 0.5, 0.55] : n === 52 ? [0.7, 0.35, 0.7] : n >= 70 ? [0.8, 0.3, 0.3] : n === 25 ? [0.6, 0.45, 0.3] : [0.35, 0.65, 0.75]; };
  const sysOf = {}; for (const [name, code, ata] of SYS) sysOf[code] = { name, code, ata };
  // 4 Nov 2026: a unit's shape inside its box (a corner at the origin, size in meters): what it is, at its size
  const ROUND = /\b(engine \d|actuators?|pump|motor|generator|starter|valve|bottle|accumulator|oil tank|precooler|reservoir|exciters?)\b/i;
  const unitShape = (name, size) => {
    const S = size.map(v => v * MM);
    if (/bogie/i.test(name)) {   // two axles of wheels on a beam, and a strut up to the gear bay (one solid, seen from the side)
      const r = Math.min(S[0] / 4.4, S[2] / 3.2);
      return prismXZ(gearOutline([r * 1.05, S[0] - r * 1.05], r, r * 0.3, Math.min(S[0], S[1]) * 0.07, S[2]), S[1]);
    }
    if (/nose gear/i.test(name)) {   // the wheels and the strut
      const r = Math.min(S[0], S[2]) * 0.24;
      return prismXZ(gearOutline([S[0] / 2], r, r * 0.3, Math.min(S[0], S[1]) * 0.08, S[2]), S[1] * 0.8);
    }
    if (ROUND.test(name)) {      // a cylinder along the long axis, as wide as the box allows
      const k = S.indexOf(Math.max(...S)), o = S.map(v => v / 2), z = [0, 0, 0], x = [0, 0, 0];
      const others = [0, 1, 2].filter(i => i !== k), r = Math.min(S[others[0]], S[others[1]]) / 2;
      o[k] = 0; z[k] = 1; x[others[0]] = 1;
      return rodAt(r, S[k], o, z, x);
    }
    return box(S[0], S[1], S[2]);
  };
  const unitProducts = {}, byId = {}; for (const it of ITEMS) byId[it.id] = it;
  const sysKids = {};
  for (const it of ITEMS) {
    const base = it.useOf && byId[it.useOf] ? byId[it.useOf] : it, s = sysOf[it.sys] || { name: it.sys, code: it.sys, ata: '00' };
    // 4 Nov 2026: each copy keeps its own name (Air data computer 2, not the first copy's name), so the analyses can say which
    const key = (base.pn || base.id) + '|' + it.size.join('x') + '|' + it.name;
    const prod = unitProducts[key] || (unitProducts[key] = partProduct(base.pn || base.id, it.name, s.name, unitShape(it.name, it.size), ATA_COLOR(s.ata)));
    (sysKids[it.sys] = sysKids[it.sys] || []).push({ child: prod, m: at(it.pos[0] - it.size[0] / 2, it.pos[1] - it.size[1] / 2, it.pos[2] - it.size[2] / 2), name: it.id });
  }
  const sysAsm = Object.keys(sysKids).sort().map(code => { const s = sysOf[code] || { name: code, ata: '00' }; return { child: assembly('SYS-' + code, 'ATA ' + s.ata + ' ' + s.name, s.name, sysKids[code]), m: at(0, 0, 0), name: 'SYS-' + code }; });
  const equipment = assembly('HL1-EQUIP', 'EQUIPMENT', 'Installed equipment by system', sysAsm);

  // ---------------- the routing: one assembly per run, named by its line number; one tube per stretch of at most 1 m
  const KIND = { wire: ['WIRING', 'Electrical wiring interconnection (EWIS)', [0.95, 0.85, 0.3]], hydraulic: ['HYDRAULIC LINES', 'Hydraulic tubing', [0.2, 0.7, 0.35]], fuel: ['FUEL LINES', 'Fuel tubing', [0.75, 0.3, 0.75]], bleed: ['BLEED DUCTS', 'Bleed and conditioned air ducting', [0.85, 0.5, 0.25]], oxygen: ['OXYGEN LINES', 'Oxygen tubing', [0.3, 0.75, 0.95]] };
  const tubes = {}, kindKids = {};
  let nStretches = 0, routeLength = 0;
  for (const r of ROUTES) {
    const kids = [];
    let n = 0;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (L < 1e-6) continue;
      routeLength += L;
      const k = Math.max(1, Math.ceil(L / 1.0)), d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L], len = Math.round(L / k * MM);
      const tk = r.kind + '|' + Math.round(r.d * MM) + '|' + len;
      const kd = KIND[r.kind] || KIND.wire;
      const tube = tubes[tk] || (tubes[tk] = partProduct('TUBE-' + r.kind.toUpperCase() + '-D' + Math.round(r.d * MM) + '-L' + len, (r.kind === 'wire' ? 'Harness' : r.kind === 'bleed' ? 'Duct' : 'Tube') + ' D' + Math.round(r.d * MM) + ' x ' + len, kd[1], rod(r.d / 2 * MM, len), kd[2]));
      for (let j = 0; j < k; j++) { const o = [a[0] + d[0] * L * j / k, a[1] + d[1] * L * j / k, a[2] + d[2] * L * j / k]; kids.push({ child: tube, m: along(o, d), name: r.id + '.' + String(++n).padStart(2, '0') }); nStretches++; }
    }
    const runAsm = assembly(r.id, r.id, r.name, kids);
    // what the CAD tool says the run is: its line type, and the system it belongs to (routes.js lineType; one run is
    // left without a line type on purpose: seeded finding, the type is not in the CAD)
    const lt = ROUTES.lineType(r);
    uda(runAsm.pd, [...(lt ? [['Line type', lt]] : []), ['Outside diameter', Math.round(r.d * MM) + ' mm']]);
    (kindKids[r.kind] = kindKids[r.kind] || []).push({ child: runAsm, m: at(0, 0, 0), name: r.id });
  }
  const routing = assembly('HL1-ROUTING', 'ROUTING', 'Harness, tube and duct runs by line number', Object.keys(kindKids).sort().map(k => { const f = assembly('HL1-RT-' + k.toUpperCase(), (KIND[k] || KIND.wire)[0], (KIND[k] || KIND.wire)[1], kindKids[k]); uda(f.pd, [['System', (KIND[k] || KIND.wire)[1]]]); return { child: f, m: at(0, 0, 0), name: (KIND[k] || KIND.wire)[0] }; }));

  const top = assembly('HL1-0000', 'Aeolus HL-1', 'Aeolus HL-1 outsized freighter (demo, fictional)', [{ child: structure, m: at(0, 0, 0), name: 'STRUCTURE' }, { child: equipment, m: at(0, 0, 0), name: 'EQUIPMENT' }, { child: routing, m: at(0, 0, 0), name: 'ROUTING' }]);
  E("MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(" + styled.map(x => '#' + x).join(',') + '),#' + ctx + ')');
  w('ENDSEC;\nEND-ISO-10303-21;\n');
  flush(); fs.closeSync(fd);
  void top;
  return { out: OUT, bytes, entities: id, products: nProducts, components: nComponents, units: ITEMS.length, runs: ROUTES.length, stretches: nStretches, routeMeters: Math.round(routeLength), structureParts: structKids.length };
}
module.exports = { generate };
if (require.main === module) {
  const out = process.argv[2] || path.join(__dirname, 'aeolus_hl1.step'), t = Date.now();
  console.log(JSON.stringify(Object.assign(generate(out), { ms: Date.now() - t })));
}

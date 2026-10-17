#!/usr/bin/env node
// Generates a large, realistic STEP AP214 aircraft assembly for the CAD scale tests (13 Oct 2026, cad-C).
//   node tests/fixtures/cad/make_aircraft_step.js <out.step> [components]
//   require('./make_aircraft_step.js').generate({ out, components, sections, ... }) -> stats
//   realWorld: true adds what real exports do (17 Oct 2026): shared styles, far plane and line origins, wrapped names,
//   one name for many part numbers
//
// Written directly as STEP text (no CAD kernel), fully deterministic: same arguments, same bytes.
// What it holds, by default (200,000 components):
//   * a deep tree: aircraft -> 6 major sections -> 8 sub-assemblies each -> 12 installations
//     each -> parts (4 levels of NEXT_ASSEMBLY_USAGE_OCCURRENCE), every assembly its own product;
//   * a few thousand DISTINCT parts (B-rep solids: extruded profiles such as plates, angles,
//     channels, Z stringers, tees and hex blocks with 6 to 14 faces, and headed pins with
//     cylindrical faces, circles and an annular face), each a product of its own, with colors;
//   * 200,000 placed copies: one unique structural part per installation and many repeated
//     brackets, clips and fasteners, placed with rigid placements (rotations and translations)
//     inside a 40 m aircraft envelope (fuselage barrel, two wings, tail).
'use strict';
const fs = require('fs');

function generate(opt) {
    opt = opt || {};
    const OUT = opt.out;
    const TARGET = opt.components || 200000;
    const SECTIONS = ['Forward Fuselage', 'Center Fuselage', 'Aft Fuselage', 'Left Wing', 'Right Wing', 'Empennage'];
    const SUBS = opt.subs || 8, INST = opt.installations || 12;
    const LIB_FASTENERS = opt.fastenerTypes || 900, LIB_BRACKETS = opt.bracketTypes || 1500;
    let seed = opt.seed || 20261013;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const fd = fs.openSync(OUT, 'w');
    let buf = [], bufLen = 0, bytes = 0, id = 0;
    const flush = () => { if (!buf.length) return; const s = buf.join(''); fs.writeSync(fd, s, null, 'latin1'); bytes += s.length; buf = []; bufLen = 0; };
    const w = s => { buf.push(s); bufLen += s.length; if (bufLen > 1 << 20) flush(); };
    const E = s => { id++; w('#' + id + '=' + s + ';\n'); return id; };
    const f = v => { const r = Math.round(v * 1e6) / 1e6; return Number.isInteger(r) ? r + '.' : String(r); };
    const P = (x, y, z) => E("CARTESIAN_POINT('',(" + f(x) + ',' + f(y) + ',' + f(z) + '))');
    const D = (x, y, z) => E("DIRECTION('',(" + f(x) + ',' + f(y) + ',' + f(z) + '))');
    const AX = (o, z, x) => E("AXIS2_PLACEMENT_3D('',#" + P(o[0], o[1], o[2]) + ',#' + D(z[0], z[1], z[2]) + ',#' + D(x[0], x[1], x[2]) + ')');

    w("ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Safety Lab scale test aircraft'),'2;1');\nFILE_NAME('" + (opt.name || 'aircraft.step') + "','2026-10-13T00:00:00',('Safety Lab'),('Safety Lab'),'make_aircraft_step.js','make_aircraft_step.js','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n");
    const appCtx = E("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
    E("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#" + appCtx + ')');
    const prodCtx = E("PRODUCT_CONTEXT('',#" + appCtx + ",'mechanical')");
    const pdCtx = E("PRODUCT_DEFINITION_CONTEXT('part definition',#" + appCtx + ",'design')");
    const mm = E('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )');
    const rad = E('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )');
    const sr = E('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
    const unc = E("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#" + mm + ",'distance_accuracy_value','confusion accuracy')");
    const ctx = E('( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#' + unc + ')) GLOBAL_UNIT_ASSIGNED_CONTEXT((#' + mm + ',#' + rad + ',#' + sr + ")) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )");
    const styled = [];
    const colors = {};
    const colorOf = (r, g, b) => { const k = [r, g, b].join(','); if (colors[k]) return colors[k]; return (colors[k] = E("COLOUR_RGB(''," + f(r) + ',' + f(g) + ',' + f(b) + ')')); };
    // opt.realWorld (17 Oct 2026): what real exports (Fusion 360) do that the default file does not: one style shared by
    // every part of a color, plane and line origins written far from the part (the same planes and lines), and long
    // names wrapped onto a second line inside the string. Off by default: the default file stays byte for byte.
    const RW = !!opt.realWorld, psaOf = {};
    const style = (item, rgb) => {
        const key = rgb.join(',');
        if (RW && psaOf[key]) { styled.push(E("STYLED_ITEM('color',(#" + psaOf[key] + '),#' + item + ')')); return; }
        const c = colorOf(rgb[0], rgb[1], rgb[2]);
        const fill = E("FILL_AREA_STYLE_COLOUR('',#" + c + ')');
        const fa = E("FILL_AREA_STYLE('',(#" + fill + '))');
        const ssf = E('SURFACE_STYLE_FILL_AREA(#' + fa + ')');
        const ssa = E("SURFACE_SIDE_STYLE('',(#" + ssf + '))');
        const usage = E('SURFACE_STYLE_USAGE(.BOTH.,#' + ssa + ')');
        const psa = E('PRESENTATION_STYLE_ASSIGNMENT((#' + usage + '))');
        if (RW) psaOf[key] = psa;
        styled.push(E("STYLED_ITEM('color',(#" + psa + '),#' + item + ')'));
    };
    // a product with its definition and shape; returns { pd, rep, origin }
    let nProducts = 0;
    const product = (pn, name, repType, items) => {
        nProducts++;
        const shown = RW && name.length > 12 ? name.slice(0, 12) + '\r\n' + name.slice(12) : name;
        const prod = E("PRODUCT('" + pn + "','" + shown + "','',(#" + prodCtx + '))');
        E("PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(#" + prod + '))');
        const pdf = E("PRODUCT_DEFINITION_FORMATION('','',#" + prod + ')');
        const pd = E("PRODUCT_DEFINITION('design','',#" + pdf + ',#' + pdCtx + ')');
        const pds = E("PRODUCT_DEFINITION_SHAPE('','',#" + pd + ')');
        const origin = AX([0, 0, 0], [0, 0, 1], [1, 0, 0]);
        const rep = { pd: pd, origin: origin, items: [origin].concat(items || []), repType: repType, pds: pds };
        return rep;
    };
    const closeRep = (r) => {
        r.rep = E(r.repType + "('',(" + r.items.map(i => '#' + i).join(',') + '),#' + ctx + ')');
        E('SHAPE_DEFINITION_REPRESENTATION(#' + r.pds + ',#' + r.rep + ')');
        return r;
    };

    // ---------------- B-rep solids
    const VP = p => E("VERTEX_POINT('',#" + P(p[0], p[1], p[2]) + ')');
    const lineEdge = (va, vb, a, b) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
        const far = RW ? 500000 : 0;   // the same line, its point written 500 m back along it
        const ln = E("LINE('',#" + P(a[0] - far * dx / L, a[1] - far * dy / L, a[2] - far * dz / L) + ",#" + E("VECTOR('',#" + D(dx / L, dy / L, dz / L) + ',' + f(L) + ')') + ')');
        return E("EDGE_CURVE('',#" + va + ',#' + vb + ',#' + ln + ',.T.)');
    };
    const OE = (e, fwd) => E("ORIENTED_EDGE('',*,*,#" + e + ',' + (fwd ? '.T.' : '.F.') + ')');
    const loop = oes => E("EDGE_LOOP('',(" + oes.map(o => '#' + o).join(',') + '))');
    const planeFace = (origin, n, xdir, bounds) => {
        const o2 = RW ? [origin[0] + 20000 * xdir[0], origin[1] + 20000 * xdir[1], origin[2] + 20000 * xdir[2]] : origin;   // the same plane, its origin 20 m away in it
        const pl = E("PLANE('',#" + AX(o2, n, xdir) + ')');
        const bs = bounds.map((b, i) => E((i === 0 ? 'FACE_OUTER_BOUND' : 'FACE_BOUND') + "('',#" + b.loop + ',' + (b.sense === false ? '.F.' : '.T.') + ')'));
        return E("ADVANCED_FACE('',(" + bs.map(b => '#' + b).join(',') + '),#' + pl + ',.T.)');
    };
    // extruded profile (counterclockwise polygon in XY), height h
    const prism = (pts, h) => {
        const k = pts.length;
        const B = pts.map(p => [p[0], p[1], 0]), T = pts.map(p => [p[0], p[1], h]);
        const vb = B.map(VP), vt = T.map(VP);
        const eb = [], et = [], ev = [];
        for (let i = 0; i < k; i++) { const j = (i + 1) % k; eb.push(lineEdge(vb[i], vb[j], B[i], B[j])); et.push(lineEdge(vt[i], vt[j], T[i], T[j])); }
        for (let i = 0; i < k; i++) ev.push(lineEdge(vb[i], vt[i], B[i], T[i]));
        const faces = [];
        faces.push(planeFace([0, 0, h], [0, 0, 1], [1, 0, 0], [{ loop: loop(et.map(e => OE(e, true))) }]));
        faces.push(planeFace([0, 0, 0], [0, 0, -1], [1, 0, 0], [{ loop: loop(eb.slice().reverse().map(e => OE(e, false))) }]));
        for (let i = 0; i < k; i++) {
            const j = (i + 1) % k, dx = B[j][0] - B[i][0], dy = B[j][1] - B[i][1], L = Math.hypot(dx, dy);
            faces.push(planeFace(B[i], [dy / L, -dx / L, 0], [dx / L, dy / L, 0], [{ loop: loop([OE(eb[i], true), OE(ev[j], true), OE(et[i], false), OE(ev[i], false)]) }]));
        }
        const shell = E("CLOSED_SHELL('',(" + faces.map(x => '#' + x).join(',') + '))');
        return E("MANIFOLD_SOLID_BREP('',#" + shell + ')');
    };
    // headed pin: shank radius r, length L; head radius R, height H (axis +Z, shank from z=0)
    const pin = (r, L, R, H) => {
        const circle = (z, rr) => E("CIRCLE('',#" + AX([0, 0, z], [0, 0, 1], [1, 0, 0]) + ',' + f(rr) + ')');
        const v0 = VP([r, 0, 0]), v1 = VP([r, 0, L]), v2 = VP([R, 0, L]), v3 = VP([R, 0, L + H]);
        const c0 = E("EDGE_CURVE('',#" + v0 + ',#' + v0 + ',#' + circle(0, r) + ',.T.)');
        const c1 = E("EDGE_CURVE('',#" + v1 + ',#' + v1 + ',#' + circle(L, r) + ',.T.)');
        const c2 = E("EDGE_CURVE('',#" + v2 + ',#' + v2 + ',#' + circle(L, R) + ',.T.)');
        const c3 = E("EDGE_CURVE('',#" + v3 + ',#' + v3 + ',#' + circle(L + H, R) + ',.T.)');
        const s0 = lineEdge(v0, v1, [r, 0, 0], [r, 0, L]), s1 = lineEdge(v2, v3, [R, 0, L], [R, 0, L + H]);
        const cyl = (rr) => E("CYLINDRICAL_SURFACE('',#" + AX([0, 0, 0], [0, 0, 1], [1, 0, 0]) + ',' + f(rr) + ')');
        const faces = [];
        faces.push(planeFace([0, 0, 0], [0, 0, -1], [1, 0, 0], [{ loop: loop([OE(c0, false)]) }]));
        faces.push(E("ADVANCED_FACE('',(#" + E("FACE_OUTER_BOUND('',#" + loop([OE(c0, true), OE(s0, true), OE(c1, false), OE(s0, false)]) + ',.T.)') + '),#' + cyl(r) + ',.T.)'));
        faces.push(planeFace([0, 0, L], [0, 0, -1], [1, 0, 0], [{ loop: loop([OE(c2, false)]) }, { loop: loop([OE(c1, true)]) }]));
        faces.push(E("ADVANCED_FACE('',(#" + E("FACE_OUTER_BOUND('',#" + loop([OE(c2, true), OE(s1, true), OE(c3, false), OE(s1, false)]) + ',.T.)') + '),#' + cyl(R) + ',.T.)'));
        faces.push(planeFace([0, 0, L + H], [0, 0, 1], [1, 0, 0], [{ loop: loop([OE(c3, true)]) }]));
        const shell = E("CLOSED_SHELL('',(" + faces.map(x => '#' + x).join(',') + '))');
        return E("MANIFOLD_SOLID_BREP('',#" + shell + ')');
    };
    // AP242 tessellated part (no B-rep): an extruded profile as triangles, caps by ear clipping
    const earClip = (pts) => {
        const idx = pts.map((_, i) => i), out = [];
        const cross = (a, b, c) => (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
        const inside = (p, a, b, c) => { const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]), d2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]), d3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]); return d1 > 0 && d2 > 0 && d3 > 0; };
        let guard = 0;
        while (idx.length > 3 && guard++ < 1000) {
            for (let i = 0; i < idx.length; i++) {
                const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
                if (cross(a, b, c) <= 0) continue;
                if (idx.some(k => k !== a && k !== b && k !== c && inside(pts[k], pts[a], pts[b], pts[c]))) continue;
                out.push([a, b, c]); idx.splice(i, 1); break;
            }
        }
        out.push([idx[0], idx[1], idx[2]]);
        return out;
    };
    const tessPrism = (pts, h) => {
        const k = pts.length, coords = pts.map(p => [p[0], p[1], 0]).concat(pts.map(p => [p[0], p[1], h]));
        const cl = E("COORDINATES_LIST(''," + coords.length + ",(" + coords.map(c => '(' + c.map(f).join(',') + ')').join(',') + '))');
        const tris = [], cap = earClip(pts);
        cap.forEach(t => { tris.push([t[0] + 1, t[2] + 1, t[1] + 1]); tris.push([t[0] + k + 1, t[1] + k + 1, t[2] + k + 1]); });
        for (let i = 0; i < k; i++) { const j = (i + 1) % k; tris.push([i + 1, j + 1, j + k + 1]); tris.push([i + 1, j + k + 1, i + k + 1]); }
        const face = E("TRIANGULATED_FACE(''," + '#' + cl + ',0,(),$,(),(' + tris.map(t => '(' + t.join(',') + ')').join(',') + '))');
        return E("TESSELLATED_SOLID('',(#" + face + '),$)');
    };
    const profiles = {
        plate: (a, b) => [[0, 0], [a, 0], [a, b], [0, b]],
        angle: (a, b, t) => [[0, 0], [a, 0], [a, t], [t, t], [t, b], [0, b]],
        channel: (a, b, t) => [[0, 0], [a, 0], [a, b], [a - t, b], [a - t, t], [t, t], [t, b], [0, b]],
        tee: (a, b, t) => [[a / 2 - t / 2, 0], [a / 2 + t / 2, 0], [a / 2 + t / 2, b - t], [a, b - t], [a, b], [0, b], [0, b - t], [a / 2 - t / 2, b - t]],
        hex: (a) => { const o = []; for (let i = 0; i < 6; i++) o.push([a * Math.cos(i * Math.PI / 3), a * Math.sin(i * Math.PI / 3)]); return o; }
    };
    profiles.zee = (a, b, t) => [[0, 0], [a / 2 + t / 2, 0], [a / 2 + t / 2, b - t], [a, b - t], [a, b], [a / 2 - t / 2, b], [a / 2 - t / 2, t], [0, t]];
    const PALETTE = [[0.62, 0.66, 0.72], [0.80, 0.80, 0.82], [0.30, 0.45, 0.70], [0.85, 0.65, 0.20], [0.35, 0.60, 0.35], [0.70, 0.30, 0.25], [0.55, 0.55, 0.55]];
    let nDistinct = 0, nFaces = 0, nTess = 0;
    const tessProduct = (pn, name, solid, rgb) => {
        nDistinct++;
        const r = product(pn, name, 'TESSELLATED_SHAPE_REPRESENTATION', [solid]);
        style(solid, rgb);
        closeRep(r);
        return r;
    };
    const partProduct = (pn, name, solid, rgb) => {
        nDistinct++;
        const r = product(pn, name, 'ADVANCED_BREP_SHAPE_REPRESENTATION', [solid]);
        style(solid, rgb);
        closeRep(r);
        return r;
    };
    // the library of repeated parts
    const fasteners = [], brackets = [];
    // a part is written the first time an installation uses it (unused library parts would be
    // top level products of their own)
    const fastener = (i) => fasteners[i] || (fasteners[i] = (() => {
        const d = 2.4 + (i % 30) * 0.4, L = 6 + Math.floor(i / 30) * 1.5;
        nFaces += 5;
        return partProduct('NAS' + (1100 + i), 'Fastener NAS' + (1100 + i), pin(d / 2, L, d * 0.95, d * 0.6), PALETTE[1]);
    })());
    const BK = ['angle', 'channel', 'zee', 'tee', 'plate', 'hex'];
    const bracket = (i) => brackets[i] || (brackets[i] = (() => {
        const kind = BK[i % BK.length], s = 1 + (i / LIB_BRACKETS) * 3;
        const a = 20 * s + (i % 7), b = 15 * s + (i % 5), t = 2 + (i % 4) * 0.5, h = 8 + (i % 11) * 2;
        const prof = kind === 'hex' ? profiles.hex(a / 3) : profiles[kind](a, b, t);
        nFaces += prof.length + 2;
        if (opt.tessellated) { nTess++; return tessProduct('BK-' + kind.toUpperCase() + '-' + (1000 + i), 'Bracket ' + kind + ' ' + (1000 + i), tessPrism(prof, h), PALETTE[2 + (i % 4)]); }
        // real world: many different brackets share one name and differ only by part number
        return partProduct('BK-' + kind.toUpperCase() + '-' + (1000 + i), RW ? 'Bracket ' + kind : 'Bracket ' + kind + ' ' + (1000 + i), prism(prof, h), PALETTE[2 + (i % 4)]);
    })());
    // assemblies, built bottom up: installations hold parts; returns the assembly rep
    let nComponents = 0, nOcc = 0;
    const assembly = (pn, name, children) => {
        // children: [{ child: rep, m: [ox,oy,oz, zx,zy,zz, xx,xy,xz] }]
        const r = product(pn, name, 'SHAPE_REPRESENTATION', []);
        const links = [];
        children.forEach(c => { const ax = AX([c.m[0], c.m[1], c.m[2]], [c.m[3], c.m[4], c.m[5]], [c.m[6], c.m[7], c.m[8]]); r.items.push(ax); links.push({ c: c, ax: ax }); });
        closeRep(r);
        links.forEach((l, i) => {
            nComponents++;
            const nauo = E("NEXT_ASSEMBLY_USAGE_OCCURRENCE('" + (i + 1) + "','','',#" + r.pd + ',#' + l.c.child.pd + ',$)');
            const pds = E("PRODUCT_DEFINITION_SHAPE('Placement','Placement of an item',#" + nauo + ')');
            const idt = E("ITEM_DEFINED_TRANSFORMATION('','',#" + l.c.child.origin + ',#' + l.ax + ')');
            const rel = E("( REPRESENTATION_RELATIONSHIP('','',#" + l.c.child.rep + ',#' + r.rep + ') REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#' + idt + ') SHAPE_REPRESENTATION_RELATIONSHIP() )');
            E('CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#' + rel + ',#' + pds + ')');
        });
        return r;
    };
    const rotZ = (a) => [Math.cos(a), Math.sin(a), 0];
    const place = (x, y, z, ang, flip) => { const xd = rotZ(ang); return [x, y, z, 0, 0, flip ? -1 : 1, xd[0], xd[1], xd[2]]; };
    const nInst = SECTIONS.length * SUBS * INST;
    const perInst = Math.max(2, Math.floor((TARGET - nInst - SECTIONS.length * SUBS - SECTIONS.length) / nInst));
    let extra = (TARGET - nInst - SECTIONS.length * SUBS - SECTIONS.length) - perInst * nInst;
    const sectionOrigin = (s) => {
        if (s < 3) return [s * 12000, 0, 0];
        if (s === 3) return [14000, -2500, -800];
        if (s === 4) return [14000, 2500, -800];
        return [33000, 0, 1500];
    };
    const sectionReps = [];
    let instNo = 0;
    for (let s = 0; s < SECTIONS.length; s++) {
        const subReps = [];
        for (let u = 0; u < SUBS; u++) {
            const instReps = [];
            for (let q = 0; q < INST; q++, instNo++) {
                // one unique structural part (a frame or rib segment), then repeated parts
                const big = profiles[['channel', 'zee', 'angle', 'tee', 'plate'][instNo % 5]](220 + (instNo % 13) * 9, 90 + (instNo % 7) * 6, 4 + (instNo % 3));
                const uniq = partProduct('ST-' + (10000 + instNo), 'Structure ' + SECTIONS[s] + ' ' + (u + 1) + '-' + (q + 1), prism(big, 900 + (instNo % 9) * 40), PALETTE[0]);
                nFaces += big.length + 2;
                const kids = [{ child: uniq, m: place(0, 0, 0, 0) }];
                let n = perInst - 1 + (extra > 0 ? 1 : 0); if (extra > 0) extra--;
                const fTypes = [0, 1, 2].map(() => fastener(Math.floor(rnd() * LIB_FASTENERS)));
                const bTypes = [0, 1, 2, 3, 4].map(() => bracket(Math.floor(rnd() * LIB_BRACKETS)));
                for (let k = 0; k < n; k++) {
                    const isF = k % 8 !== 0;
                    const child = isF ? fTypes[k % 3] : bTypes[k % 5];
                    const x = (k % 40) * 22 + rnd() * 3, y = Math.floor(k / 40) * 25 + rnd() * 3, z = isF ? 900 : 300 + rnd() * 400;
                    kids.push({ child: child, m: place(x, y, z, rnd() * Math.PI * 2, isF && (k & 16)) });
                }
                instReps.push(assembly('INS-' + (10000 + instNo), 'Installation ' + SECTIONS[s] + ' ' + (u + 1) + '.' + (q + 1), kids));
                nOcc += kids.length;
            }
            // installations in a row inside the sub-assembly
            subReps.push(assembly('SUB-' + (100 + s * SUBS + u), SECTIONS[s] + ' Sub-assembly ' + (u + 1), instReps.map((r, q) => ({ child: r, m: place((q % 4) * 1100, Math.floor(q / 4) * 1300 - 2000, 0, 0) }))));
        }
        sectionReps.push(assembly('SEC-' + (s + 1), SECTIONS[s], subReps.map((r, u) => ({ child: r, m: place(Math.floor(u / 2) * 3000, (u % 2) * 4500 - 2200, 0, s >= 3 && s <= 4 ? (s === 3 ? -0.2 : 0.2) : 0) }))));
    }
    const top = assembly('A-200', 'Aircraft A-200', sectionReps.map((r, s) => ({ child: r, m: place(...sectionOrigin(s), 0) })));
    // colors
    E("MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(" + styled.map(x => '#' + x).join(',') + '),#' + ctx + ')');
    w('ENDSEC;\nEND-ISO-10303-21;\n');
    flush();
    fs.closeSync(fd);
    return { out: OUT, bytes: bytes, entities: id, components: nComponents, placedParts: nOcc, distinctParts: nDistinct, tessellatedParts: nTess, products: nProducts, faces: nFaces, top: top.pd };
}
module.exports = { generate };
if (require.main === module) {
    const out = process.argv[2] || 'aircraft.step', n = parseInt(process.argv[3] || '200000', 10);
    const t = Date.now();
    const st = generate({ out: out, components: n });
    console.log(JSON.stringify(Object.assign(st, { ms: Date.now() - t })));
}

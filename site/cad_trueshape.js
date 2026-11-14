// ============================================================================
// cad_trueshape.js, v1.0: is a CAD part in a zone or a risk volume, on its true shape (14 Nov 2026).
//
// Waqas, 17 Oct 2026: "true geometry only, no more of these boxes". Until now a part was placed in the
// zone whose box held its centroid, a zone drawn as CAD bodies was reduced to the bodies' boxes, and a
// part counted as inside a risk volume when its centroid or a corner of its box was inside. This file
// answers the same questions on the part's own surface.
//
// The surface is the display mesh OpenCascade made from the exact B-rep. Every mesh point lies within
// the meshing tolerance d of the true surface and every true surface point within d of the mesh (that
// is what OpenCascade's deflection means; d is passed in). So:
//   in    a mesh point lies deeper than d inside the volume: a point of the true surface is inside. Sure.
//   out   every mesh point is farther than d outside the volume: no point of the true surface is
//         inside, and the volume is not wholly inside the part's material either. Sure.
//   edge  anything between: the part touches the volume's boundary closer than the meshing tolerance
//         can tell. Said as "on the boundary", never guessed either way.
// The volumes: box, sphere, cone (with or without a length), disk sector (rotor burst: elevation band,
// range, azimuth), and a zone drawn as CAD bodies (their meshes, with their own tolerance).
//
// How far a point is from a volume is a signed bound (negative inside): never more than the true
// distance to the boundary, and 1-Lipschitz, so a triangle whose corners are all farther than d plus
// its size from the volume cannot reach it. Big triangles are split until they are small enough to tell
// (a box and a sphere need no splitting: a triangle against them is answered exactly, see exactTri).
// Pure functions; no DOM, no network, no randomness: the same input always gives the same answer.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var MAX_DEPTH = 8;           // a triangle is split at most 8 times (4^8 pieces) before it is called edge (cones, rotor
                                 // sectors and zone bodies; boxes and spheres are answered exactly, with no splitting)

    function _sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function _dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function _len(a) { return Math.sqrt(_dot(a, a)); }
    function _cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function _unit(a) { var l = _len(a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : null; }
    function _n3(a) { return Array.isArray(a) && a.length >= 3 && isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2]); }
    var DEG = Math.PI / 180;

    // ---- signed bounds, one per volume kind ------------------------------------------------------
    // A bound is { s: function(p) -> number, box: { min, max } | null (no finite box) }.
    function boxBound(mn, mx) {
        var c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], h = [(mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2];
        return { kind: 'box', box: { min: mn.slice(0, 3), max: mx.slice(0, 3) }, s: function (p) {
            var qx = Math.abs(p[0] - c[0]) - h[0], qy = Math.abs(p[1] - c[1]) - h[1], qz = Math.abs(p[2] - c[2]) - h[2];
            var ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
            return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0);
        } };
    }
    function sphereBound(c, r) {
        return { kind: 'sphere', center: c.slice(0, 3), radius: r, box: { min: [c[0] - r, c[1] - r, c[2] - r], max: [c[0] + r, c[1] + r, c[2] + r] }, s: function (p) { return _len(_sub(p, c)) - r; } };
    }
    // a cone: apex, unit axis, half angle, optional length. In the half plane through the axis (t along
    // the axis, r from it) the cone is the region r <= t tan(a), t <= L; max of the two lines' signed
    // distances is exact inside and a lower bound outside; the map to (t, r) never stretches distances.
    function coneBound(apex, axis, halfDeg, length) {
        var u = _unit(axis), a = halfDeg * DEG, ca = Math.cos(a), sa = Math.sin(a), L = length != null ? length : null;
        var box = null;
        if (L != null) {
            var rc = L * Math.tan(a), cc = [apex[0] + u[0] * L, apex[1] + u[1] * L, apex[2] + u[2] * L], mn = apex.slice(0, 3), mx = apex.slice(0, 3);
            for (var i = 0; i < 3; i++) { var e = rc * Math.sqrt(Math.max(0, 1 - u[i] * u[i])); mn[i] = Math.min(mn[i], cc[i] - e); mx[i] = Math.max(mx[i], cc[i] + e); }
            box = { min: mn, max: mx };
        }
        return { kind: 'cone', box: box, s: function (p) {
            var v = _sub(p, apex), t = _dot(v, u), r = Math.sqrt(Math.max(0, _dot(v, v) - t * t));
            var lat = r * ca - t * sa, s = lat;
            if (L != null) s = Math.max(s, t - L);
            return s;
        } };
    }
    // a disk sector (rotor burst): center, unit axis of rotation, spread (elevation either side of the rotor
    // plane), range (optional), azimuth from..to measured from refDir (optional). The band and the range are
    // a region of revolution (two lines through the center and a circle in the (h, rho) half plane, convex);
    // the azimuth is a wedge about the axis. The volume is their intersection: max of the two bounds.
    function sectorBound(center, axis, spreadDeg, range, fromDeg, toDeg, refDir) {
        var a = _unit(axis), b = spreadDeg * DEG, cb = Math.cos(b), sb = Math.sin(b), R = range != null ? range : null;
        var wedge = null;
        if ((fromDeg != null || toDeg != null) && _n3(refDir) && !(toDeg != null && toDeg - (fromDeg || 0) >= 360)) {
            var r0 = _sub(refDir, [a[0] * _dot(refDir, a), a[1] * _dot(refDir, a), a[2] * _dot(refDir, a)]), e1 = _unit(r0);
            if (e1) {
                var e2 = _cross(a, e1), f = (((fromDeg || 0) % 360) + 360) % 360, to = (((toDeg == null ? 360 : toDeg) % 360) + 360) % 360;
                var span = ((to - f) % 360 + 360) % 360; if (span === 0) span = 360;
                wedge = { e1: e1, e2: e2, f: f * DEG, span: span * DEG };
            }
        }
        // a 2D wedge from angle f, counterclockwise, of the given span: signed distance bound of point (x, y)
        function wedgeS(x, y, w) {
            // the half planes through the origin bounding a convex wedge of span <= 180
            function convex(f0, sp) {
                var d1 = [Math.cos(f0), Math.sin(f0)], d2 = [Math.cos(f0 + sp), Math.sin(f0 + sp)];
                var s1 = -(d1[0] * y - d1[1] * x), s2 = (d2[0] * y - d2[1] * x);   // negative on the inner side of each ray's line
                return Math.max(s1, s2);
            }
            if (w.span <= Math.PI) return convex(w.f, w.span);
            return -convex(w.f + w.span, 2 * Math.PI - w.span);   // the wedge is the outside of the convex one left over
        }
        var box = R != null ? { min: [center[0] - R, center[1] - R, center[2] - R], max: [center[0] + R, center[1] + R, center[2] + R] } : null;
        return { kind: 'disk-sector', box: box, s: function (p) {
            var w = _sub(p, center), h = _dot(w, a), rho = Math.sqrt(Math.max(0, _dot(w, w) - h * h));
            var s = Math.max(h * cb - rho * sb, -h * cb - rho * sb);
            if (R != null) s = Math.max(s, Math.sqrt(h * h + rho * rho) - R);
            if (wedge) { var x = _dot(w, wedge.e1), y = _dot(w, wedge.e2); s = Math.max(s, wedgeS(x, y, wedge)); }
            return s;
        } };
    }
    // the volume shapes Safety Lab stores (cad_zonal shapeIssue checks them first)
    var FRAG = { oneThirdDisc: 3, intermediate: 5, small: 15 };
    function shapeBound(sh, spreadOf) {
        if (!sh || typeof sh !== 'object') return null;
        if (sh.kind === 'box' && _n3(sh.min) && _n3(sh.max)) return boxBound(sh.min, sh.max);
        if (sh.kind === 'sphere' && _n3(sh.center) && sh.radius > 0) return sphereBound(sh.center, sh.radius);
        if (sh.kind === 'cone' && _n3(sh.apex) && _n3(sh.axis) && _unit(sh.axis) && sh.halfAngleDeg > 0 && sh.halfAngleDeg < 90) return coneBound(sh.apex, sh.axis, sh.halfAngleDeg, sh.length != null ? sh.length : null);
        if (sh.kind === 'disk-sector' && _n3(sh.center) && _n3(sh.axis) && _unit(sh.axis)) {
            var sp = typeof spreadOf === 'function' ? spreadOf(sh) : (typeof sh.spreadDeg === 'number' ? sh.spreadDeg : FRAG[sh.fragment] != null ? FRAG[sh.fragment] : FRAG.intermediate);
            var R = sh.range != null ? sh.range : (sh.radius != null ? sh.radius : null);
            return sectorBound(sh.center, sh.axis, sp, R, sh.fromDeg, sh.toDeg, sh.refDir);
        }
        return null;
    }

    // ---- triangles of a mesh, in millimeters ---------------------------------------------------
    // mesh = { position: Float32Array|Array, index: Uint32Array|Array, matrix: 16 numbers (column major) | null,
    //          scale: millimeters per unit (default 1) }
    function triangles(mesh, cb) {
        var P = mesh.position, I = mesh.index, M = mesh.matrix, f = mesh.scale || 1;
        function xf(i) {
            var x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
            if (M) { var X = M[0] * x + M[4] * y + M[8] * z + M[12], Y = M[1] * x + M[5] * y + M[9] * z + M[13], Z = M[2] * x + M[6] * y + M[10] * z + M[14]; x = X; y = Y; z = Z; }
            return [x * f, y * f, z * f];
        }
        var n = I ? I.length : P.length / 3;
        for (var k = 0; k + 2 < n; k += 3) {
            var a = xf(I ? I[k] : k), b = xf(I ? I[k + 1] : k + 1), c = xf(I ? I[k + 2] : k + 2);
            if (cb(a, b, c) === false) return;
        }
    }
    function meshBox(mesh) {
        var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        triangles(mesh, function (a, b, c) { [a, b, c].forEach(function (q) { for (var j = 0; j < 3; j++) { if (q[j] < mn[j]) mn[j] = q[j]; if (q[j] > mx[j]) mx[j] = q[j]; } }); });
        return mn[0] <= mx[0] ? { min: mn, max: mx } : null;
    }
    function _boxGap(a, b) {   // gap between two boxes (0 when they overlap)
        var s = 0; for (var i = 0; i < 3; i++) { var g = Math.max(a.min[i] - b.max[i], b.min[i] - a.max[i], 0); s += g * g; } return Math.sqrt(s);
    }

    // ---- exact answers for a box and a sphere -----------------------------------------------------
    // Does a triangle overlap a box (center c, half sizes h)? The separating axis test of Akenine-Moller
    // (2001): the three box axes, the triangle's normal, and the nine cross products of their edges.
    function triBoxOverlap(c, h, A, Bp, C) {
        if (h[0] < 0 || h[1] < 0 || h[2] < 0) return false;   // an empty box
        var v = [_sub(A, c), _sub(Bp, c), _sub(C, c)], e = [_sub(v[1], v[0]), _sub(v[2], v[1]), _sub(v[0], v[2])];
        for (var j = 0; j < 3; j++) {
            if (Math.min(v[0][j], v[1][j], v[2][j]) > h[j] || Math.max(v[0][j], v[1][j], v[2][j]) < -h[j]) return false;
        }
        var n = _cross(e[0], e[1]), dn = _dot(n, v[0]), rn = h[0] * Math.abs(n[0]) + h[1] * Math.abs(n[1]) + h[2] * Math.abs(n[2]);
        if (Math.abs(dn) > rn) return false;
        var U = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        for (var i = 0; i < 3; i++) for (var k = 0; k < 3; k++) {
            var ax = _cross(e[i], U[k]);
            if (!ax[0] && !ax[1] && !ax[2]) continue;
            var p0 = _dot(ax, v[0]), p1 = _dot(ax, v[1]), p2 = _dot(ax, v[2]), r = h[0] * Math.abs(ax[0]) + h[1] * Math.abs(ax[1]) + h[2] * Math.abs(ax[2]);
            if (Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r) return false;
        }
        return true;
    }
    // A box: in when the triangle reaches the box shrunk by d (a point deeper than d inside), out when it
    // misses the box grown by d (every point farther than d; near a corner the grown box reaches out to
    // d times root 3, so a part that close is called edge, the safe side), else edge.
    // A sphere: the triangle's nearest point to the center decides it exactly.
    function exactTri(a, b, c, B, d) {
        if (B.kind === 'box') {
            var bx = B.box, ctr = [(bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2, (bx.min[2] + bx.max[2]) / 2];
            var h = [(bx.max[0] - bx.min[0]) / 2, (bx.max[1] - bx.min[1]) / 2, (bx.max[2] - bx.min[2]) / 2];
            var eps = d * 1e-9 + 1e-12;
            if (triBoxOverlap(ctr, [h[0] - d - eps, h[1] - d - eps, h[2] - d - eps], a, b, c)) return 'in';
            if (!triBoxOverlap(ctr, [h[0] + d, h[1] + d, h[2] + d], a, b, c)) return 'out';
            return 'edge';
        }
        if (B.kind === 'sphere') {
            var q = ptTri(B.center, a, b, c);
            return q < B.radius - d ? 'in' : q > B.radius + d ? 'out' : 'edge';
        }
        return null;
    }

    // ---- a triangle against a bound ------------------------------------------------------------
    // returns 'in' | 'edge' | 'out' for the true surface near this triangle (within d of it)
    function triClass(a, b, c, B, d, depth) {
        var sa = B.s(a), sb = B.s(b), sc = B.s(c), mn = Math.min(sa, sb, sc);
        if (mn < -d) return 'in';
        var diam = Math.max(_len(_sub(a, b)), _len(_sub(b, c)), _len(_sub(c, a)));
        if (mn > d + diam) return 'out';     // every point of the triangle is within diam of a corner
        // the bound is 1-Lipschitz, so no point of the triangle is below mn - diam: when that is not deeper than d,
        // nothing in it is inside by more than the tolerance. Then a corner within d of the boundary settles it as
        // edge (a face lying flush on a zone's face stops here, at pieces about d across, never at the depth limit)
        var shallow = mn - diam >= -d;
        if (shallow && mn <= d) return 'edge';
        if (depth >= MAX_DEPTH || (shallow && diam <= d / 4)) return 'edge';
        var ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2], ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2, (c[2] + a[2]) / 2];
        var kids = [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]], any = 'out';
        for (var i = 0; i < 4; i++) { var r = triClass(kids[i][0], kids[i][1], kids[i][2], B, d, depth + 1); if (r === 'in') return 'in'; if (r === 'edge') any = 'edge'; }
        return any;
    }

    // ---- inside a closed mesh (the part's material, or a zone body) ----------------------------
    // a small tree of triangle boxes, for the ray count and the nearest distance
    function buildTree(meshes) {
        var T = [];
        meshes.forEach(function (m) { triangles(m, function (a, b, c) { T.push({ a: a, b: b, c: c, box: { min: [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1]), Math.min(a[2], b[2], c[2])], max: [Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1]), Math.max(a[2], b[2], c[2])] } }); }); });
        function node(list) {
            var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
            list.forEach(function (t) { for (var j = 0; j < 3; j++) { if (t.box.min[j] < mn[j]) mn[j] = t.box.min[j]; if (t.box.max[j] > mx[j]) mx[j] = t.box.max[j]; } });
            if (list.length <= 8) return { box: { min: mn, max: mx }, tris: list };
            var ax = 0; for (var k = 1; k < 3; k++) if (mx[k] - mn[k] > mx[ax] - mn[ax]) ax = k;
            var s = list.slice().sort(function (p, q) { return (p.box.min[ax] + p.box.max[ax]) - (q.box.min[ax] + q.box.max[ax]); }), h = s.length >> 1;
            return { box: { min: mn, max: mx }, l: node(s.slice(0, h)), r: node(s.slice(h)) };
        }
        return T.length ? node(T) : null;
    }
    // nearest distance from p to a triangle (Ericson, Real-Time Collision Detection 5.1.5)
    function ptTri(p, a, b, c) {
        var ab = _sub(b, a), ac = _sub(c, a), ap = _sub(p, a), d1 = _dot(ab, ap), d2 = _dot(ac, ap);
        if (d1 <= 0 && d2 <= 0) return _len(ap);
        var bp = _sub(p, b), d3 = _dot(ab, bp), d4 = _dot(ac, bp);
        if (d3 >= 0 && d4 <= d3) return _len(bp);
        var vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { var v = d1 / (d1 - d3); return _len(_sub(p, [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v])); }
        var cp = _sub(p, c), d5 = _dot(ab, cp), d6 = _dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) return _len(cp);
        var vb = d5 * d2 - d1 * d6;
        if (vb <= 0 && d2 >= 0 && d6 <= 0) { var w = d2 / (d2 - d6); return _len(_sub(p, [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w])); }
        var va = d3 * d6 - d5 * d4;
        if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { var w2 = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return _len(_sub(p, [b[0] + (c[0] - b[0]) * w2, b[1] + (c[1] - b[1]) * w2, b[2] + (c[2] - b[2]) * w2])); }
        var den = 1 / (va + vb + vc), v2 = vb * den, w3 = vc * den;
        return _len(_sub(p, [a[0] + ab[0] * v2 + ac[0] * w3, a[1] + ab[1] * v2 + ac[1] * w3, a[2] + ab[2] * v2 + ac[2] * w3]));
    }
    function nearest(tree, p) {
        var best = Infinity;
        (function go(n) {
            if (!n || _boxGap({ min: p, max: p }, n.box) >= best) return;
            if (n.tris) { n.tris.forEach(function (t) { var d = ptTri(p, t.a, t.b, t.c); if (d < best) best = d; }); return; }
            var gl = n.l ? _boxGap({ min: p, max: p }, n.l.box) : Infinity, gr = n.r ? _boxGap({ min: p, max: p }, n.r.box) : Infinity;
            if (gl <= gr) { go(n.l); go(n.r); } else { go(n.r); go(n.l); }
        })(tree);
        return best;
    }
    // ray crossings from p along dir (Moller-Trumbore); null when the ray grazes an edge (ask again elsewhere)
    function crossings(tree, p, dir) {
        var n = 0, bad = false;
        function hitBox(b) {
            var t0 = -Infinity, t1 = Infinity;
            for (var i = 0; i < 3; i++) {
                if (Math.abs(dir[i]) < 1e-15) { if (p[i] < b.min[i] || p[i] > b.max[i]) return false; continue; }
                var ta = (b.min[i] - p[i]) / dir[i], tb = (b.max[i] - p[i]) / dir[i]; if (ta > tb) { var x = ta; ta = tb; tb = x; }
                t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false;
            }
            return t1 >= 0;
        }
        (function go(nd) {
            if (!nd || bad || !hitBox(nd.box)) return;
            if (nd.tris) {
                nd.tris.forEach(function (t) {
                    var e1 = _sub(t.b, t.a), e2 = _sub(t.c, t.a), h = _cross(dir, e2), det = _dot(e1, h);
                    if (Math.abs(det) < 1e-12) return;
                    var inv = 1 / det, s = _sub(p, t.a), u = inv * _dot(s, h); if (u < -1e-9 || u > 1 + 1e-9) return;
                    var q = _cross(s, e1), v = inv * _dot(dir, q); if (v < -1e-9 || u + v > 1 + 1e-9) return;
                    var tt = inv * _dot(e2, q); if (tt <= 1e-9) return;
                    if (u < 1e-7 || v < 1e-7 || u + v > 1 - 1e-7) { bad = true; return; }   // on an edge: this ray cannot tell
                    n++;
                });
                return;
            }
            go(nd.l); go(nd.r);
        })(tree);
        return bad ? null : n;
    }
    // fixed, uneven directions: deterministic, and unlikely to run along the model's own edges
    var RAYS = [[0.8017837, 0.5345225, 0.2672612], [-0.2672612, 0.8017837, 0.5345225], [0.5345225, -0.2672612, 0.8017837], [-0.5773503, -0.5773503, 0.5773503]];
    // 1 inside the closed mesh, -1 outside, 0 cannot tell (rays disagree or all graze)
    function insideSign(tree, p) {
        if (!tree) return -1;
        var votes = [];
        for (var i = 0; i < RAYS.length && votes.length < 3; i++) { var c = crossings(tree, p, RAYS[i]); if (c != null) votes.push(c % 2 ? 1 : -1); }
        if (!votes.length) return 0;
        return votes.every(function (v) { return v === votes[0]; }) ? votes[0] : 0;
    }
    // a zone drawn as CAD bodies: its signed bound from the bodies' meshes (tolerance dz). Inside or out by
    // the ray count; how far, the distance to the mesh less dz (zero within dz: cannot tell).
    function bodiesBound(meshes, dz) {
        var tree = buildTree(meshes), box = null;
        meshes.forEach(function (m) { var b = meshBox(m); if (!b) return; if (!box) box = { min: b.min.slice(), max: b.max.slice() }; else for (var j = 0; j < 3; j++) { box.min[j] = Math.min(box.min[j], b.min[j]); box.max[j] = Math.max(box.max[j], b.max[j]); } });
        var tol = dz || 0;
        return { kind: 'bodies', box: box, s: function (p) {
            if (!tree) return Infinity;
            var g = nearest(tree, p) - tol; if (g <= 0) return 0;
            var sg = insideSign(tree, p); return sg === 0 ? 0 : -sg * g;   // negative inside
        } };
    }
    // a point deep inside the volume, to ask whether the whole volume sits inside a part's material
    function innerPoint(B, sh) {
        if (!sh) return null;
        if (sh.kind === 'box') return [(sh.min[0] + sh.max[0]) / 2, (sh.min[1] + sh.max[1]) / 2, (sh.min[2] + sh.max[2]) / 2];
        if (sh.kind === 'sphere') return sh.center.slice(0, 3);
        if (sh.kind === 'cone' && sh.length != null) { var u = _unit(sh.axis); return [sh.apex[0] + u[0] * sh.length * 0.75, sh.apex[1] + u[1] * sh.length * 0.75, sh.apex[2] + u[2] * sh.length * 0.75]; }
        return null;
    }

    // ---- one part against one volume -----------------------------------------------------------
    // part = { meshes: [mesh], box: { min, max } (its true box), decimated: bool }
    // B = a bound; d = the meshing tolerance of the part's meshes, in millimeters; sh = the volume's shape (for
    // the whole-volume-inside-the-part case; null for zone bodies)
    function classify(part, B, d, sh) {
        if (!part || !B) return 'edge';
        if (B.box && part.box && _boxGap(part.box, B.box) > d) return 'out';
        if (part.decimated) {
            // the display mesh was simplified: its points are no longer known to sit on the surface, so only the
            // part's true box can answer, and only when it is wholly in or wholly out
            if (!part.box) return 'edge';
            var corners = [], bx = part.box; for (var i = 0; i < 8; i++) corners.push([(i & 1) ? bx.max[0] : bx.min[0], (i & 2) ? bx.max[1] : bx.min[1], (i & 4) ? bx.max[2] : bx.min[2]]);
            var c = [(bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2, (bx.min[2] + bx.max[2]) / 2], half = _len(_sub(bx.max, c));
            if (B.s(c) > half) return 'out';                                  // the whole box is outside
            if ((B.kind === 'box' || B.kind === 'sphere' || B.kind === 'cone') && corners.every(function (q) { return B.s(q) < 0; })) return 'in';   // a convex volume holding all eight corners holds the whole box
            return 'edge';
        }
        var res = 'out';
        for (var m = 0; m < part.meshes.length && res !== 'in'; m++) {
            triangles(part.meshes[m], function (a, b, cc) {
                // a triangle far from the volume's box cannot reach it
                if (B.box) { var tb = { min: [Math.min(a[0], b[0], cc[0]), Math.min(a[1], b[1], cc[1]), Math.min(a[2], b[2], cc[2])], max: [Math.max(a[0], b[0], cc[0]), Math.max(a[1], b[1], cc[1]), Math.max(a[2], b[2], cc[2])] }; if (_boxGap(tb, B.box) > d) return; }
                var r = exactTri(a, b, cc, B, d) || triClass(a, b, cc, B, d, 0);
                if (r === 'in') { res = 'in'; return false; }
                if (r === 'edge') res = 'edge';
            });
        }
        if (res === 'out' && sh) {
            // no surface point inside: still inside if the whole volume sits in the part's material
            var q = innerPoint(B, sh);
            if (q) { var tree = buildTree(part.meshes), g = nearest(tree, q); if (g > d) { var sg = insideSign(tree, q); if (sg === 1) res = 'in'; else if (sg === 0) res = 'edge'; } else res = 'edge'; }
        }
        return res;
    }
    // the meshing tolerance OpenCascade used for a model read with a relative deflection: the deflection
    // times the average side of the box of each top-level shape. The whole model's box is never smaller than
    // a top-level shape's, so this is an upper bound for every part.
    function modelTolerance(modelBox, relDeflection) {
        if (!modelBox) return null;
        var avg = ((modelBox.max[0] - modelBox.min[0]) + (modelBox.max[1] - modelBox.min[1]) + (modelBox.max[2] - modelBox.min[2])) / 3;
        return avg * (relDeflection || 0.001);
    }

    // ---- the answers for a whole model ---------------------------------------------------------
    // input = { geom: normalized geometry { meshes:[{pid, proto, matrix}], protos:[{position, index, decimated?, box?, faces?}], ts? },
    //           parts: [{ pid, bbox, centroid, boxEstimated? }], zones: [{ id, sig, volume }], risks: [{ id, sig, shape }],
    //           tol (mm), cadId, spreadOf? }
    // A job works through every (volume, nearby part) pair in slices: job.step(ms) returns true when done;
    // job.result() is what SLCadZonal.updateTrueShape keeps. A part with no shape to read (its size still an
    // estimate, or a mesh simplified for display) is answered only where its true box alone can answer.
    function job(input) {
        var g = input.geom || {}, tol = input.tol > 0 ? input.tol : 0, byPid = {}, flagged = !!g.ts;
        (g.meshes || []).forEach(function (m) { if (m && m.pid != null) (byPid[m.pid] = byPid[m.pid] || []).push(m); });
        function partOf(p) {
            var ms = byPid[p.pid] || [], meshes = [], decimated = false, none = !ms.length;
            ms.forEach(function (m) {
                var pr = g.protos && g.protos[m.proto]; if (!pr || !pr.position || !pr.position.length) { none = true; return; }
                if (pr.box) { none = true; return; }   // the shape was never read: only an estimated box
                // simplified for display: marked since 14 Nov 2026; in an older cache a mesh without its face list may be one
                if (pr.decimated || (!flagged && !pr.faces)) decimated = true;
                meshes.push({ position: pr.position, index: pr.index, matrix: m.matrix || null });
            });
            return { pid: p.pid, meshes: meshes, box: p.bbox || null, decimated: decimated || none, none: none && !meshes.length };
        }
        var envelope = {}, vols = [], onBox = { zones: [], risks: [] };
        (input.zones || []).forEach(function (z) {
            var v = z.volume, B = null;
            if (v && v.kind === 'box') B = boxBound(v.min, v.max);
            else if (v && v.kind === 'parts' && (!v.cadId || v.cadId === input.cadId)) {
                var bodies = []; (v.pids || []).forEach(function (pid) { envelope[pid] = 1; var q = partOf({ pid: pid }); if (!q.decimated) bodies = bodies.concat(q.meshes); else bodies = null; });
                if (bodies && bodies.length) B = bodiesBound(bodies, tol);
            }
            if (B) vols.push({ kind: 'zone', id: z.id, sig: z.sig, B: B, sh: v.kind === 'box' ? { kind: 'box', min: v.min, max: v.max } : null, in: [], edge: [], cin: [] });
            else onBox.zones.push({ id: z.id, sig: z.sig });   // its bodies have no exact shape here: it stays on boxes, and says so
        });
        (input.risks || []).forEach(function (r) { var B = shapeBound(r.shape, input.spreadOf); if (B) vols.push({ kind: 'risk', id: r.id, sig: r.sig, B: B, sh: r.shape, in: [], edge: [] }); else onBox.risks.push({ id: r.id, sig: r.sig }); });
        var parts = (input.parts || []).filter(function (p) { return p && p.pid != null && !p.boxEstimated; });
        var work = [];
        vols.forEach(function (V, vi) { parts.forEach(function (p) { if (V.kind === 'zone' && envelope[p.pid]) return; if (V.B.box && p.bbox && _boxGap(p.bbox, V.B.box) > tol) return; work.push(vi, p); }); });
        var k = 0, cache = {};
        return {
            total: work.length / 2,
            done: function () { return k >= work.length; },
            step: function (ms) {
                var t0 = Date.now();
                while (k < work.length) {
                    var V = vols[work[k]], p = work[k + 1]; k += 2;
                    var q = cache[p.pid] || (cache[p.pid] = partOf(p));
                    var r = q.none ? 'edge' : classify(q, V.B, tol, V.kind === 'risk' || V.sh ? V.sh : null);
                    if (r === 'in') V.in.push(p.pid); else if (r === 'edge') V.edge.push(p.pid);
                    if (V.kind === 'zone' && r !== 'out' && p.centroid && V.B.s(p.centroid) < 0) V.cin.push(p.pid);
                    if (ms != null && Date.now() - t0 >= ms) break;
                }
                return k >= work.length;
            },
            progress: function () { return work.length ? k / work.length : 1; },
            result: function () {
                var out = { tol: tol, zones: {}, risks: {}, at: new Date().toISOString() };
                vols.forEach(function (V) { var f = { sig: V.sig, in: V.in.slice().sort(), edge: V.edge.slice().sort() }; if (V.kind === 'zone') { f.cin = V.cin.slice().sort(); out.zones[V.id] = f; } else out.risks[V.id] = f; });
                // answered, but only by boxes: kept so the page does not ask again for the same zone or volume
                onBox.zones.forEach(function (z) { out.zones[z.id] = { sig: z.sig, box: true, in: [], edge: [], cin: [] }; });
                onBox.risks.forEach(function (r) { out.risks[r.id] = { sig: r.sig, box: true, in: [], edge: [] }; });
                return out;
            }
        };
    }
    function _unionBox(parts) {
        var b = null; (parts || []).forEach(function (p) { if (!p || !p.bbox) return; if (!b) b = { min: p.bbox.min.slice(), max: p.bbox.max.slice() }; else for (var j = 0; j < 3; j++) { b.min[j] = Math.min(b.min[j], p.bbox.min[j]); b.max[j] = Math.max(b.max[j], p.bbox.max[j]); } });
        return b;
    }

    // ---- in the page: work out what is missing for each model on this computer, in slices -------
    var _timer = null, _running = false, _last = {}, _listeners = [];
    function onState(cb) { _listeners.push(cb); return function () { _listeners = _listeners.filter(function (x) { return x !== cb; }); }; }
    function _emit(s) { _last = s; _listeners.slice().forEach(function (cb) { try { cb(s); } catch (_) {} }); }
    function state() { return _last; }
    // schedule(): called whenever the project changes; cheap when nothing is missing
    function schedule(delayMs) {
        if (typeof setTimeout === 'undefined') return;
        clearTimeout(_timer);
        _timer = setTimeout(function () { runAll(); }, delayMs == null ? 1500 : delayMs);
    }
    function runAll() {
        if (_running) { schedule(2000); return Promise.resolve(); }
        var E = root.SLCadZonal, I = root.SLCadImport; if (!E || !I || !E.trueShapeNeeds) return Promise.resolve();
        var ids = (E.models() || []).map(function (m) { return m.id; }).filter(function (id) { var n = E.trueShapeNeeds(id); return n.zones.length || n.risks.length; });
        if (!ids.length) return Promise.resolve();
        _running = true;
        var chain = Promise.resolve();
        ids.forEach(function (id) { chain = chain.then(function () { return run(id); }); });
        return chain.then(function () { _running = false; }, function () { _running = false; });
    }
    function run(cadId) {
        var E = root.SLCadZonal, I = root.SLCadImport, m = E && E.model(cadId);
        if (!m || !m.sha256) return Promise.resolve({ ok: false, why: 'no model' });
        var need = E.trueShapeNeeds(cadId); if (!need.zones.length && !need.risks.length) return Promise.resolve({ ok: true, nothing: true });
        _emit({ cadId: cadId, phase: 'reading', frac: 0 });
        return Promise.resolve(I.cacheGet(m.sha256)).catch(function () { return null; }).then(function (payload) {
            if (!payload) { _emit({ cadId: cadId, phase: 'no-shapes', why: 'The shapes of ' + (m.fileName || 'this model') + ' are not on this computer. Open the model once here to read them.' }); return { ok: false, why: 'no cache' }; }
            var geom = I.normalizeGeometry(payload); geom.ts = payload.ts || geom.ts || 0;
            var input = E.trueShapeInput(cadId, need);
            input.geom = geom; input.tol = modelTolerance(_unionBox(input.parts), 0.001);
            var J = job(input);
            return new Promise(function (resolve) {
                (function slice() {
                    var done = J.step(12);
                    _emit({ cadId: cadId, phase: 'working', frac: J.progress() });
                    if (!done) { setTimeout(slice, 0); return; }
                    var r = E.updateTrueShape(cadId, J.result());
                    _emit({ cadId: cadId, phase: 'done', frac: 1, updated: r && r.updated });
                    resolve({ ok: true, updated: r && r.updated });
                })();
            });
        });
    }

    root.SLCadTrueShape = { job: job, schedule: schedule, runAll: runAll, run: run, state: state, onState: onState, VERSION: VERSION, boxBound: boxBound, sphereBound: sphereBound, coneBound: coneBound, sectorBound: sectorBound, shapeBound: shapeBound, bodiesBound: bodiesBound,
        triangles: triangles, meshBox: meshBox, classify: classify, triClass: triClass, exactTri: exactTri, triBoxOverlap: triBoxOverlap, insideSign: insideSign, buildTree: buildTree, nearest: nearest, modelTolerance: modelTolerance, MAX_DEPTH: MAX_DEPTH };
})(typeof window !== 'undefined' ? window : globalThis);

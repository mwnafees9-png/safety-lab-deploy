// ============================================================================
// cad_render.js, v1.0: drawing very large CAD assemblies (window.SLCadRender, 13 Oct 2026, cad-C).
//
// Hundreds of thousands of parts cannot be one three.js mesh each (one draw call per part). This
// module turns the cached geometry (prototypes + placements, cad_import.js) into a few batches:
//
//   * INSTANCED + BATCHED. Parts are grouped into spatial chunks (Morton order of their centers);
//     each chunk is one THREE.BatchedMesh: every prototype it needs is uploaded once, each part is
//     an instance with its own placement and color, and the whole chunk is ONE multi-draw call.
//   * LEVEL OF DETAIL. Every prototype above 200 triangles gets a coarse copy (vertex clustering,
//     about an eighth of the triangles); a part switches to it when it covers few pixels, and a
//     part smaller than a pixel is not drawn at all (contribution culling).
//   * CULLING. Per part: outside the view frustum, not drawn. Per chunk: three.js skips a chunk
//     outside the frustum; an occlusion query on the chunk's box (WebGL2) skips a chunk hidden
//     behind what was drawn, one frame late and only when the camera is outside that box.
//     Visibility is worked out incrementally, a few milliseconds per frame, only when the view
//     changed, so a still view costs nothing.
//   * PROGRESSIVE. Chunks are built largest parts first, a time slice per frame, so the shape of
//     the aircraft appears at once and fills in.
//   * PICKING without per-triangle scans: a bounding volume hierarchy (BVH) per prototype, built
//     on first use, rays tested in the prototype's own frame. The same BVHs give walk collision
//     and the mesh clash check.
//
// Pure helpers (morton, chunk plan, LOD level, BVH, triangle tests, clash scan, explode offsets)
// run in node for the tests. No eval, no network.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var DEF = { maxInstances: 4096, maxVertices: 1500000, lodMinTris: 200, lodRatio: 0.125, lodPx: 28, cullPx: 0.75, sliceMs: 4 };

    // ------------------------------------------------------------------ pure: plan
    function _part1by2(n) { n &= 1023; n = (n | (n << 16)) & 0x030000FF; n = (n | (n << 8)) & 0x0300F00F; n = (n | (n << 4)) & 0x030C30C3; n = (n | (n << 2)) & 0x09249249; return n >>> 0; }
    function morton3(x, y, z) { return ((_part1by2(x) | (_part1by2(y) << 1) | (_part1by2(z) << 2)) >>> 0); }
    function mortonOf(c, box) {
        var q = [0, 1, 2].map(function (j) { var e = box.max[j] - box.min[j]; return e > 0 ? Math.max(0, Math.min(1023, Math.floor((c[j] - box.min[j]) / e * 1023))) : 0; });
        return morton3(q[0], q[1], q[2]);
    }
    // items: [{ center:[x,y,z], proto, verts (of its prototype), size }] -> chunks [{ items:[i...] }]
    // Morton order keeps a chunk compact in space; a chunk closes at maxInstances parts or when its
    // distinct prototypes would pass maxVertices. Deterministic (ties by index).
    function planChunks(items, box, opts) {
        opts = opts || {};
        var maxI = opts.maxInstances || DEF.maxInstances, maxV = opts.maxVertices || DEF.maxVertices;
        var order = items.map(function (it, i) { return { i: i, m: mortonOf(it.center, box) }; });
        order.sort(function (a, b) { return (a.m - b.m) || (a.i - b.i); });
        var chunks = [], cur = null;
        order.forEach(function (o) {
            var it = items[o.i];
            if (!cur || cur.items.length >= maxI || (!cur.protos[it.proto] && cur.verts + it.verts > maxV && cur.items.length)) { cur = { items: [], protos: {}, verts: 0 }; chunks.push(cur); }
            cur.items.push(o.i);
            if (!cur.protos[it.proto]) { cur.protos[it.proto] = 1; cur.verts += it.verts; }
        });
        return chunks.map(function (c) { return { items: c.items, protos: Object.keys(c.protos).map(Number).sort(function (a, b) { return a - b; }), verts: c.verts }; });
    }
    // Pixels a sphere of radius r at distance d covers (radius in pixels).
    function pixelRadius(r, d, fovDeg, heightPx) { if (d <= r) return Infinity; return r / (d * Math.tan(fovDeg * Math.PI / 360)) * heightPx / 2; }
    // 0 full detail, 1 coarse, -1 too small to draw.
    function lodLevel(px, hasCoarse, opts) {
        opts = opts || {};
        if (px < (opts.cullPx != null ? opts.cullPx : DEF.cullPx)) return -1;
        if (hasCoarse && px < (opts.lodPx != null ? opts.lodPx : DEF.lodPx)) return 1;
        return 0;
    }
    // Radial explode: each part moves away from the center by factor x its center's offset.
    function explodeOffsets(parts, factor, center) {
        var out = {};
        (parts || []).forEach(function (p) {
            var c = p.centroid || [(p.bbox.min[0] + p.bbox.max[0]) / 2, (p.bbox.min[1] + p.bbox.max[1]) / 2, (p.bbox.min[2] + p.bbox.max[2]) / 2];
            out[p.pid] = [(c[0] - center[0]) * factor, (c[1] - center[1]) * factor, (c[2] - center[2]) * factor];
        });
        return out;
    }

    // ------------------------------------------------------------------ pure: BVH
    // Over the triangles of one prototype (its own frame). Nodes: bounds (6 floats) and either two
    // children or a run of triangles. Median split on the longest axis of the triangle centers.
    function Bvh(position, index, leafSize) {
        var nt = index.length / 3, L = leafSize || 6;
        this.pos = position; this.idx = index;
        var cen = new Float32Array(nt * 3), tri = new Uint32Array(nt);
        for (var t = 0; t < nt; t++) {
            var a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, c = index[t * 3 + 2] * 3;
            cen[t * 3] = (position[a] + position[b] + position[c]) / 3; cen[t * 3 + 1] = (position[a + 1] + position[b + 1] + position[c + 1]) / 3; cen[t * 3 + 2] = (position[a + 2] + position[b + 2] + position[c + 2]) / 3;
            tri[t] = t;
        }
        var maxNodes = Math.max(1, 2 * Math.ceil(nt / L) + 1) * 2;
        var bounds = new Float32Array(maxNodes * 6), info = new Int32Array(maxNodes * 3);   // info: [left|-1, right|start, count]
        var nNodes = 0, stack = [[0, nt, 0]];
        var self = this;
        function boundsOf(node, s, e) {
            var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
            for (var k = s; k < e; k++) {
                var tt = tri[k];
                for (var v = 0; v < 3; v++) { var p = index[tt * 3 + v] * 3; for (var j = 0; j < 3; j++) { var x = position[p + j]; if (x < mn[j]) mn[j] = x; if (x > mx[j]) mx[j] = x; } }
            }
            for (var q = 0; q < 3; q++) { bounds[node * 6 + q] = mn[q]; bounds[node * 6 + 3 + q] = mx[q]; }
        }
        function select(s, e, k, ax) {   // quickselect on centers along ax
            while (e - s > 1) {
                var pv = cen[tri[(s + e) >> 1] * 3 + ax], i = s, j = e - 1;
                while (i <= j) {
                    while (cen[tri[i] * 3 + ax] < pv) i++;
                    while (cen[tri[j] * 3 + ax] > pv) j--;
                    if (i <= j) { var tmp = tri[i]; tri[i] = tri[j]; tri[j] = tmp; i++; j--; }
                }
                if (k <= j) e = j + 1; else if (k >= i) s = i; else return;
            }
        }
        if (nt === 0) { this.bounds = bounds; this.info = info; this.tri = tri; this.nodes = 0; return; }
        nNodes = 1; stack = [[0, 0, nt]];
        while (stack.length) {
            var it = stack.pop(), node = it[0], s = it[1], e = it[2];
            boundsOf(node, s, e);
            if (e - s <= L) { info[node * 3] = -1; info[node * 3 + 1] = s; info[node * 3 + 2] = e - s; continue; }
            var cmn = [Infinity, Infinity, Infinity], cmx = [-Infinity, -Infinity, -Infinity];
            for (var k = s; k < e; k++) for (var j = 0; j < 3; j++) { var x = cen[tri[k] * 3 + j]; if (x < cmn[j]) cmn[j] = x; if (x > cmx[j]) cmx[j] = x; }
            var ax = 0, ex = cmx[0] - cmn[0]; if (cmx[1] - cmn[1] > ex) { ax = 1; ex = cmx[1] - cmn[1]; } if (cmx[2] - cmn[2] > ex) { ax = 2; ex = cmx[2] - cmn[2]; }
            if (!(ex > 0)) { info[node * 3] = -1; info[node * 3 + 1] = s; info[node * 3 + 2] = e - s; continue; }
            var mid = (s + e) >> 1;
            select(s, e, mid, ax);
            var l = nNodes++, r = nNodes++;
            if (nNodes * 6 > bounds.length) { var nb = new Float32Array(bounds.length * 2); nb.set(bounds); bounds = nb; var ni = new Int32Array(info.length * 2); ni.set(info); info = ni; }
            info[node * 3] = l; info[node * 3 + 1] = r; info[node * 3 + 2] = 0;
            stack.push([r, mid, e], [l, s, mid]);
        }
        self.bounds = bounds; self.info = info; self.tri = tri; self.nodes = nNodes;
    }
    function rayBox(ox, oy, oz, ix, iy, iz, b, o, tmax) {
        var t1 = (b[o] - ox) * ix, t2 = (b[o + 3] - ox) * ix, tmin = Math.min(t1, t2), tm = Math.max(t1, t2);
        t1 = (b[o + 1] - oy) * iy; t2 = (b[o + 4] - oy) * iy; tmin = Math.max(tmin, Math.min(t1, t2)); tm = Math.min(tm, Math.max(t1, t2));
        t1 = (b[o + 2] - oz) * iz; t2 = (b[o + 5] - oz) * iz; tmin = Math.max(tmin, Math.min(t1, t2)); tm = Math.min(tm, Math.max(t1, t2));
        return tm >= Math.max(tmin, 0) && tmin <= tmax ? Math.max(tmin, 0) : Infinity;
    }
    // Moller-Trumbore, both sides. Returns t or Infinity.
    function rayTri(ox, oy, oz, dx, dy, dz, P, a, b, c) {
        var e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
        var e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
        var px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        var det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-14) return Infinity;
        var inv = 1 / det, tx = ox - P[a], ty = oy - P[a + 1], tz = oz - P[a + 2];
        var u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) return Infinity;
        var qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        var v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) return Infinity;
        var t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        return t > 1e-9 ? t : Infinity;
    }
    // Nearest hit along the ray (prototype frame): { t, tri } or null.
    Bvh.prototype.raycast = function (o, d, tmax) {
        if (!this.nodes) return null;
        var ix = 1 / d[0], iy = 1 / d[1], iz = 1 / d[2], best = tmax == null ? Infinity : tmax, bt = -1;
        var B = this.bounds, N = this.info, P = this.pos, I = this.idx, T = this.tri;
        var stack = [0];
        while (stack.length) {
            var n = stack.pop();
            if (rayBox(o[0], o[1], o[2], ix, iy, iz, B, n * 6, best) === Infinity) continue;
            if (N[n * 3] < 0) {
                for (var k = N[n * 3 + 1], e = k + N[n * 3 + 2]; k < e; k++) {
                    var t = T[k], h = rayTri(o[0], o[1], o[2], d[0], d[1], d[2], P, I[t * 3] * 3, I[t * 3 + 1] * 3, I[t * 3 + 2] * 3);
                    if (h < best) { best = h; bt = t; }
                }
            } else {
                var l = N[n * 3], r = N[n * 3 + 1];
                var tl = rayBox(o[0], o[1], o[2], ix, iy, iz, B, l * 6, best), tr = rayBox(o[0], o[1], o[2], ix, iy, iz, B, r * 6, best);
                if (tl < tr) { if (tr !== Infinity) stack.push(r); if (tl !== Infinity) stack.push(l); }
                else { if (tl !== Infinity) stack.push(l); if (tr !== Infinity) stack.push(r); }
            }
        }
        return bt < 0 ? null : { t: best, tri: bt };
    };

    // A hierarchy over the parts' boxes (Morton order, groups of 8, paired upward), so a ray or a
    // box query visits a few parts out of hundreds of thousands. boxes: Float64Array(6n).
    function Tlas(boxes, n) {
        var order = new Uint32Array(n), centers = [];
        var gb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        for (var i = 0; i < n; i++) { for (var j = 0; j < 3; j++) { gb.min[j] = Math.min(gb.min[j], boxes[i * 6 + j]); gb.max[j] = Math.max(gb.max[j], boxes[i * 6 + 3 + j]); } }
        var codes = new Uint32Array(n);
        for (i = 0; i < n; i++) { codes[i] = mortonOf([(boxes[i * 6] + boxes[i * 6 + 3]) / 2, (boxes[i * 6 + 1] + boxes[i * 6 + 4]) / 2, (boxes[i * 6 + 2] + boxes[i * 6 + 5]) / 2], gb); order[i] = i; }
        var ord = Array.prototype.slice.call(order).sort(function (a, b) { return (codes[a] - codes[b]) || (a - b); });
        order = Uint32Array.from(ord);
        var LEAF = 8, levels = [], cur = [];
        for (i = 0; i < n; i += LEAF) cur.push({ s: i, e: Math.min(n, i + LEAF), kids: null });
        function fit(node) {
            var b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
            if (node.kids) node.kids.forEach(function (k) { for (var q = 0; q < 3; q++) { b[q] = Math.min(b[q], k.b[q]); b[q + 3] = Math.max(b[q + 3], k.b[q + 3]); } });
            else for (var t = node.s; t < node.e; t++) { var o = order[t] * 6; for (var q2 = 0; q2 < 3; q2++) { b[q2] = Math.min(b[q2], boxes[o + q2]); b[q2 + 3] = Math.max(b[q2 + 3], boxes[o + 3 + q2]); } }
            node.b = b;
        }
        cur.forEach(fit);
        while (cur.length > 1) { var nx = []; for (i = 0; i < cur.length; i += 2) { var nd = { kids: cur.slice(i, i + 2) }; fit(nd); nx.push(nd); } cur = nx; }
        this.root = cur[0] || null; this.order = order; this.boxes = boxes; this.n = n;
    }
    // Items whose box the ray enters before tmax, nearest first: [{ i, t }].
    Tlas.prototype.rayItems = function (o, d, tmax) {
        var out = [], ix = 1 / d[0], iy = 1 / d[1], iz = 1 / d[2], B = this.boxes, ord = this.order;
        if (!this.root) return out;
        var stack = [this.root], tmp = new Float64Array(6);
        while (stack.length) {
            var nd = stack.pop();
            if (rayBox(o[0], o[1], o[2], ix, iy, iz, nd.b, 0, tmax == null ? Infinity : tmax) === Infinity) continue;
            if (nd.kids) { stack.push.apply(stack, nd.kids); continue; }
            for (var k = nd.s; k < nd.e; k++) {
                var i = ord[k]; for (var q = 0; q < 6; q++) tmp[q] = B[i * 6 + q];
                var t = rayBox(o[0], o[1], o[2], ix, iy, iz, tmp, 0, tmax == null ? Infinity : tmax);
                if (t !== Infinity) out.push({ i: i, t: t });
            }
        }
        out.sort(function (a, b) { return a.t - b.t || a.i - b.i; });
        return out;
    };
    // Items whose box overlaps [min, max] (grown by pad): indices, ascending.
    Tlas.prototype.boxItems = function (mn, mx, pad) {
        pad = pad || 0; var out = [], B = this.boxes, ord = this.order;
        if (!this.root) return out;
        var ov = function (b, o) { return !(b[o] > mx[0] + pad || b[o + 3] < mn[0] - pad || b[o + 1] > mx[1] + pad || b[o + 4] < mn[1] - pad || b[o + 2] > mx[2] + pad || b[o + 5] < mn[2] - pad); };
        var stack = [this.root];
        while (stack.length) {
            var nd = stack.pop();
            if (!ov(nd.b, 0)) continue;
            if (nd.kids) { stack.push.apply(stack, nd.kids); continue; }
            for (var k = nd.s; k < nd.e; k++) { var i = ord[k]; if (ov(B, i * 6)) out.push(i); }
        }
        return out.sort(function (a, b) { return a - b; });
    };

    // How many times the ray crosses the surface (prototype frame): odd means the origin is inside
    // a closed mesh.
    Bvh.prototype.countHits = function (o, d) {
        if (!this.nodes) return 0;
        var ix = 1 / d[0], iy = 1 / d[1], iz = 1 / d[2], n = 0;
        var B = this.bounds, N = this.info, P = this.pos, I = this.idx, T = this.tri, stack = [0];
        while (stack.length) {
            var k = stack.pop();
            if (rayBox(o[0], o[1], o[2], ix, iy, iz, B, k * 6, Infinity) === Infinity) continue;
            if (N[k * 3] < 0) { for (var q = N[k * 3 + 1], e = q + N[k * 3 + 2]; q < e; q++) { var t = T[q]; if (rayTri(o[0], o[1], o[2], d[0], d[1], d[2], P, I[t * 3] * 3, I[t * 3 + 1] * 3, I[t * 3 + 2] * 3) !== Infinity) n++; } }
            else stack.push(N[k * 3], N[k * 3 + 1]);
        }
        return n;
    };
    // ------------------------------------------------------------------ pure: triangle geometry
    function _sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function _dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function _cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function _add(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
    // Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5).
    function closestOnTri(p, a, b, c) {
        var ab = _sub(b, a), ac = _sub(c, a), ap = _sub(p, a);
        var d1 = _dot(ab, ap), d2 = _dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
        var bp = _sub(p, b), d3 = _dot(ab, bp), d4 = _dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
        var vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return _add(a, ab, d1 / (d1 - d3));
        var cp = _sub(p, c), d5 = _dot(ab, cp), d6 = _dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
        var vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return _add(a, ac, d2 / (d2 - d6));
        var va = d3 * d6 - d5 * d4; if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) return _add(b, _sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
        var den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
        return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
    }
    // Closest points between segments p1q1 and p2q2 (Ericson 5.1.9).
    function closestSegSeg(p1, q1, p2, q2) {
        var d1 = _sub(q1, p1), d2 = _sub(q2, p2), r = _sub(p1, p2), a = _dot(d1, d1), e = _dot(d2, d2), f = _dot(d2, r), s, t;
        if (a <= 1e-18 && e <= 1e-18) return [p1, p2];
        if (a <= 1e-18) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
        else {
            var c = _dot(d1, r);
            if (e <= 1e-18) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
            else {
                var b = _dot(d1, d2), den = a * e - b * b;
                s = den !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
                t = (b * s + f) / e;
                if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
            }
        }
        return [_add(p1, d1, s), _add(p2, d2, t)];
    }
    // Does segment pq cross triangle abc?
    function segTri(p, q, a, b, c) {
        var d = _sub(q, p), L = Math.sqrt(_dot(d, d)); if (!(L > 0)) return false;
        var dir = [d[0] / L, d[1] / L, d[2] / L];
        var P = [a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]];
        var t = rayTri(p[0], p[1], p[2], dir[0], dir[1], dir[2], P, 0, 3, 6);
        return t <= L;
    }
    // Interpenetration, decided exactly and without regard to search order: an edge of one
    // triangle passes from strictly one side of the other's plane to strictly the other side,
    // through a point strictly inside it. Triangles that only touch (an edge or a vertex lying on
    // the other, or coplanar faces) do not cross.
    function _segCrossProper(p, q, a, b, c, eps) {
        var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (!(nl > 0)) return false;
        nx /= nl; ny /= nl; nz /= nl;
        var dp = (p[0] - a[0]) * nx + (p[1] - a[1]) * ny + (p[2] - a[2]) * nz, dq = (q[0] - a[0]) * nx + (q[1] - a[1]) * ny + (q[2] - a[2]) * nz;
        if (!((dp > eps && dq < -eps) || (dp < -eps && dq > eps))) return false;
        var t = dp / (dp - dq), x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t, z = p[2] + (q[2] - p[2]) * t;
        // barycentric coordinates of the crossing point, strictly inside (margin eps in length)
        var wx = x - a[0], wy = y - a[1], wz = z - a[2];
        var uu = ux * ux + uy * uy + uz * uz, vv = vx * vx + vy * vy + vz * vz, uv = ux * vx + uy * vy + uz * vz, wu = wx * ux + wy * uy + wz * uz, wv = wx * vx + wy * vy + wz * vz;
        var den = uv * uv - uu * vv; if (den === 0) return false;
        var s1 = (uv * wv - vv * wu) / den, t1 = (uv * wu - uu * wv) / den;
        var m = eps / Math.max(Math.sqrt(uu), Math.sqrt(vv));
        return s1 > m && t1 > m && s1 + t1 < 1 - m;
    }
    function triTriCrossProper(A, B, eps) {
        eps = eps == null ? 1e-6 : eps;
        for (var i = 0; i < 3; i++) {
            if (_segCrossProper(A[i], A[(i + 1) % 3], B[0], B[1], B[2], eps)) return true;
            if (_segCrossProper(B[i], B[(i + 1) % 3], A[0], A[1], A[2], eps)) return true;
        }
        return false;
    }
    function triTriIntersect(A, B) {
        for (var i = 0; i < 3; i++) {
            if (segTri(A[i], A[(i + 1) % 3], B[0], B[1], B[2])) return true;
            if (segTri(B[i], B[(i + 1) % 3], A[0], A[1], A[2])) return true;
        }
        return false;
    }
    // Minimum distance between two triangles (0 when they cross): { d, a, b }.
    function triTriDistance(A, B) {
        if (triTriIntersect(A, B)) return { d: 0, a: A[0], b: A[0], cross: true };
        var best = { d: Infinity }, i, j, q, dd;
        for (i = 0; i < 3; i++) {
            q = closestOnTri(A[i], B[0], B[1], B[2]); dd = Math.hypot(q[0] - A[i][0], q[1] - A[i][1], q[2] - A[i][2]); if (dd < best.d) best = { d: dd, a: A[i], b: q };
            q = closestOnTri(B[i], A[0], A[1], A[2]); dd = Math.hypot(q[0] - B[i][0], q[1] - B[i][1], q[2] - B[i][2]); if (dd < best.d) best = { d: dd, a: q, b: B[i] };
        }
        for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {
            var r = closestSegSeg(A[i], A[(i + 1) % 3], B[j], B[(j + 1) % 3]);
            dd = Math.hypot(r[0][0] - r[1][0], r[0][1] - r[1][1], r[0][2] - r[1][2]); if (dd < best.d) best = { d: dd, a: r[0], b: r[1] };
        }
        return best;
    }
    function xf(m, p) { return m ? [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]] : [p[0], p[1], p[2]]; }
    function _nodeBoxWorld(B, n, m) {
        var o = n * 6;
        if (!m) return [B[o], B[o + 1], B[o + 2], B[o + 3], B[o + 4], B[o + 5]];
        var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (var k = 0; k < 8; k++) {
            var w = xf(m, [k & 1 ? B[o + 3] : B[o], k & 2 ? B[o + 4] : B[o + 1], k & 4 ? B[o + 5] : B[o + 2]]);
            for (var j = 0; j < 3; j++) { if (w[j] < mn[j]) mn[j] = w[j]; if (w[j] > mx[j]) mx[j] = w[j]; }
        }
        return [mn[0], mn[1], mn[2], mx[0], mx[1], mx[2]];
    }
    function _boxGap(a, b) {
        var dx = Math.max(0, a[0] - b[3], b[0] - a[3]), dy = Math.max(0, a[1] - b[4], b[1] - a[4]), dz = Math.max(0, a[2] - b[5], b[2] - a[5]);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    // Minimum distance between two placed meshes (world mm) and whether they cross, within
    // `limit` (pairs farther apart than limit return { d: Infinity }). Mesh based: as exact as the
    // tessellation. mesh = { bvh, matrix|null }.
    function meshDistance(ma, mb, limit) {
        var A = ma.bvh, B = mb.bvh, best = { d: limit == null ? Infinity : limit, a: null, b: null, cross: false, found: false };
        if (!A.nodes || !B.nodes) return { d: Infinity };
        var boxA = {}, boxB = {};
        function bA(n) { return boxA[n] || (boxA[n] = _nodeBoxWorld(A.bounds, n, ma.matrix)); }
        function bB(n) { return boxB[n] || (boxB[n] = _nodeBoxWorld(B.bounds, n, mb.matrix)); }
        function tri(M, bv, t) { var I = bv.idx, P = bv.pos; return [0, 1, 2].map(function (v) { var p = I[t * 3 + v] * 3; return xf(M.matrix, [P[p], P[p + 1], P[p + 2]]); }); }
        var stack = [[0, 0]];
        while (stack.length && !best.cross) {
            var pr = stack.pop(), na = pr[0], nb = pr[1];
            if (_boxGap(bA(na), bB(nb)) > best.d) continue;
            var la = A.info[na * 3] < 0, lb = B.info[nb * 3] < 0;
            if (la && lb) {
                for (var i = A.info[na * 3 + 1], ie = i + A.info[na * 3 + 2]; i < ie; i++) {
                    var ta = tri(ma, A, A.tri[i]);
                    for (var j = B.info[nb * 3 + 1], je = j + B.info[nb * 3 + 2]; j < je; j++) {
                        var r = triTriDistance(ta, tri(mb, B, B.tri[j]));
                        if (r.d < best.d || (r.d === best.d && !best.found)) { best = { d: r.d, a: r.a, b: r.b, cross: !!r.cross, found: true }; if (r.cross) break; }
                    }
                    if (best.cross) break;
                }
            } else if (la || (!lb && (_vol(bB(nb)) > _vol(bA(na))))) {
                var c1 = B.info[nb * 3], c2 = B.info[nb * 3 + 1];
                var g1 = _boxGap(bA(na), bB(c1)), g2 = _boxGap(bA(na), bB(c2));
                if (g1 < g2) { stack.push([na, c2], [na, c1]); } else { stack.push([na, c1], [na, c2]); }
            } else {
                var d1 = A.info[na * 3], d2 = A.info[na * 3 + 1];
                var h1 = _boxGap(bA(d1), bB(nb)), h2 = _boxGap(bA(d2), bB(nb));
                if (h1 < h2) { stack.push([d2, nb], [d1, nb]); } else { stack.push([d1, nb], [d2, nb]); }
            }
        }
        return best.found ? best : { d: Infinity };
    }
    function _vol(b) { return (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]); }
    // The same answer as meshDistance, for a full-aircraft clash scan: part B is moved into part
    // A's own frame once per pair (A's tree boxes and triangles are used as stored, B's tree boxes
    // are moved once each, only when reached), triangle pairs are first rejected by their boxes,
    // and nothing is allocated per triangle pair. Returns { d, a, b, cross } in world mm.
    var _fm = { stack: new Int32Array(4096), boxB: new Float64Array(0), stampB: new Int32Array(0), stamp: 0 };
    function _inv4(m) {
        // rigid placement inverse (rotation transposed), falls back to identity for none
        if (!m) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        var o = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
        o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]); o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]); o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
        return o;
    }
    function _mul4(a, b) {
        if (!b) return a.slice();
        var o = new Array(16);
        for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        return o;
    }
    function fastMeshDistance(ma, mb, limit) {
        var A = ma.bvh, B = mb.bvh;
        if (!A.nodes || !B.nodes) return { d: Infinity };
        var R = _mul4(_inv4(ma.matrix), mb.matrix);   // B's frame -> A's frame
        var F = _fm; F.stamp++;
        if (F.boxB.length < B.nodes * 6) { F.boxB = new Float64Array(B.nodes * 12); F.stampB = new Int32Array(B.nodes * 2); }
        var bb = F.boxB, sb = F.stampB, stamp = F.stamp;
        var AB = A.bounds, BB = B.bounds, AP = A.pos, AI = A.idx, BP = B.pos, BI = B.idx;
        function boxB(n) {
            var o = n * 6;
            if (sb[n] === stamp) return o;
            var x0 = BB[o], y0 = BB[o + 1], z0 = BB[o + 2], x1 = BB[o + 3], y1 = BB[o + 4], z1 = BB[o + 5];
            // center and half extent moved by R (a box moved by a rotation: |R| times the extent)
            var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, ex = (x1 - x0) / 2, ey = (y1 - y0) / 2, ez = (z1 - z0) / 2;
            var wx = R[0] * cx + R[4] * cy + R[8] * cz + R[12], wy = R[1] * cx + R[5] * cy + R[9] * cz + R[13], wz = R[2] * cx + R[6] * cy + R[10] * cz + R[14];
            var hx = Math.abs(R[0]) * ex + Math.abs(R[4]) * ey + Math.abs(R[8]) * ez, hy = Math.abs(R[1]) * ex + Math.abs(R[5]) * ey + Math.abs(R[9]) * ez, hz = Math.abs(R[2]) * ex + Math.abs(R[6]) * ey + Math.abs(R[10]) * ez;
            bb[o] = wx - hx; bb[o + 1] = wy - hy; bb[o + 2] = wz - hz; bb[o + 3] = wx + hx; bb[o + 4] = wy + hy; bb[o + 5] = wz + hz;
            sb[n] = stamp;
            return o;
        }
        function gap(na, ob) {
            var oa = na * 6;
            var dx = Math.max(0, AB[oa] - bb[ob + 3], bb[ob] - AB[oa + 3]), dy = Math.max(0, AB[oa + 1] - bb[ob + 4], bb[ob + 1] - AB[oa + 4]), dz = Math.max(0, AB[oa + 2] - bb[ob + 5], bb[ob + 2] - AB[oa + 5]);
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        var best = limit == null ? Infinity : limit, found = false, bestA = null, bestB = null, cross = false;
        var st = F.stack, sp = 0;
        st[sp++] = 0; st[sp++] = 0;
        var tb = new Float64Array(9), ta = new Float64Array(9);
        while (sp > 0 && !cross) {
            var nb = st[--sp], na = st[--sp];
            var ob = boxB(nb);
            if (gap(na, ob) > best) continue;
            var la = A.info[na * 3] < 0, lb = B.info[nb * 3] < 0;
            if (la && lb) {
                for (var i = A.info[na * 3 + 1], ie = i + A.info[na * 3 + 2]; i < ie && !cross; i++) {
                    var t = A.tri[i], a0 = AI[t * 3] * 3, a1 = AI[t * 3 + 1] * 3, a2 = AI[t * 3 + 2] * 3;
                    ta[0] = AP[a0]; ta[1] = AP[a0 + 1]; ta[2] = AP[a0 + 2]; ta[3] = AP[a1]; ta[4] = AP[a1 + 1]; ta[5] = AP[a1 + 2]; ta[6] = AP[a2]; ta[7] = AP[a2 + 1]; ta[8] = AP[a2 + 2];
                    var amnx = Math.min(ta[0], ta[3], ta[6]), amny = Math.min(ta[1], ta[4], ta[7]), amnz = Math.min(ta[2], ta[5], ta[8]);
                    var amxx = Math.max(ta[0], ta[3], ta[6]), amxy = Math.max(ta[1], ta[4], ta[7]), amxz = Math.max(ta[2], ta[5], ta[8]);
                    for (var j = B.info[nb * 3 + 1], je = j + B.info[nb * 3 + 2]; j < je; j++) {
                        var u = B.tri[j];
                        for (var v = 0; v < 3; v++) { var q = BI[u * 3 + v] * 3, x = BP[q], y = BP[q + 1], z = BP[q + 2]; tb[v * 3] = R[0] * x + R[4] * y + R[8] * z + R[12]; tb[v * 3 + 1] = R[1] * x + R[5] * y + R[9] * z + R[13]; tb[v * 3 + 2] = R[2] * x + R[6] * y + R[10] * z + R[14]; }
                        // triangle boxes further apart than the best distance so far: no closer pair here
                        var gx = Math.max(0, amnx - Math.max(tb[0], tb[3], tb[6]), Math.min(tb[0], tb[3], tb[6]) - amxx);
                        var gy = Math.max(0, amny - Math.max(tb[1], tb[4], tb[7]), Math.min(tb[1], tb[4], tb[7]) - amxy);
                        var gz = Math.max(0, amnz - Math.max(tb[2], tb[5], tb[8]), Math.min(tb[2], tb[5], tb[8]) - amxz);
                        if (gx * gx + gy * gy + gz * gz > best * best) continue;
                        var TA = [[ta[0], ta[1], ta[2]], [ta[3], ta[4], ta[5]], [ta[6], ta[7], ta[8]]], TB = [[tb[0], tb[1], tb[2]], [tb[3], tb[4], tb[5]], [tb[6], tb[7], tb[8]]];
                        if (triTriCrossProper(TA, TB)) { best = 0; bestA = TA[0]; bestB = TA[0]; found = true; cross = true; break; }
                        var r = triTriDistance(TA, TB);
                        // keep looking at every touching triangle pair: a crossing anywhere decides
                        if (r.d < best || (r.d === best && !found)) { best = r.d; bestA = r.a; bestB = r.b; found = true; }
                    }
                }
            } else {
                if (sp + 4 > st.length) { var ns = new Int32Array(st.length * 2); ns.set(st); st = F.stack = ns; }
                var splitB = la || (!lb && (bb[ob + 3] - bb[ob]) * (bb[ob + 4] - bb[ob + 1]) * (bb[ob + 5] - bb[ob + 2]) > (AB[na * 6 + 3] - AB[na * 6]) * (AB[na * 6 + 4] - AB[na * 6 + 1]) * (AB[na * 6 + 5] - AB[na * 6 + 2]));
                if (splitB) {
                    var c1 = B.info[nb * 3], c2 = B.info[nb * 3 + 1], g1 = gap(na, boxB(c1)), g2 = gap(na, boxB(c2));
                    if (g1 < g2) { st[sp++] = na; st[sp++] = c2; st[sp++] = na; st[sp++] = c1; } else { st[sp++] = na; st[sp++] = c1; st[sp++] = na; st[sp++] = c2; }
                } else {
                    var d1 = A.info[na * 3], d2 = A.info[na * 3 + 1], h1 = gap(d1, ob), h2 = gap(d2, ob);
                    if (h1 < h2) { st[sp++] = d2; st[sp++] = nb; st[sp++] = d1; st[sp++] = nb; } else { st[sp++] = d1; st[sp++] = nb; st[sp++] = d2; st[sp++] = nb; }
                }
            }
        }
        if (!found) return { d: Infinity };
        return { d: best, a: xf(ma.matrix, bestA), b: xf(ma.matrix, bestB), cross: cross };
    }


    // ------------------------------------------------------------------ pure: clash scan
    // parts: [{ pid, bbox }], mesh(pid) -> { bvh, matrix } (world placement), opts:
    //   tolerance (mm, clearance below this is reported; default 0), touch (mm, default 0.01),
    //   setA / setB (pid lists: only pairs across the two sets; one set: pairs inside it; none:
    //   every pair), maxPairs (stop after this many results).
    // Broad phase: sweep and prune on X over the boxes grown by the tolerance. Narrow phase:
    // meshDistance. Results sorted: clashes first, then by distance, then pidA, pidB.
    // Returns a job: step(budgetMs) -> true when done; .results; .progress (0..1).
    // One pair, decided without regard to search order:
    //   clash     = the surfaces cross somewhere (triTriCrossProper), or the parts share volume
    //               (one inside the other, or faces lying on each other with overlapping bodies)
    //   touch     = no clash, minimum distance <= touch
    //   clearance = no clash, minimum distance <= tolerance + touch
    function classifyPair(ma, mb, ba, bb, tol, touch) {
        var grow = tol + touch, r = fastMeshDistance(ma, mb, grow);
        var clash = !!r.cross || (r.d <= grow ? r.d <= touch && sharedVolume(ma, mb, ba, bb, touch) : sharedVolume(ma, mb, ba, bb, touch));
        if (clash) return { kind: 'clash', distance: 0, a: r.a || null, b: r.b || null, exact: false, approximate: true };
        if (!(r.d <= grow)) return null;
        return { kind: r.d <= touch ? 'touch' : 'clearance', distance: Math.round(r.d * 1e6) / 1e6, a: r.a, b: r.b, exact: false, approximate: true };
    }
    function clashJob(parts, mesh, opts) {
        opts = opts || {};
        var tol = Math.max(0, +opts.tolerance || 0), touch = opts.touch != null ? +opts.touch : 0.01;
        var inA = opts.setA ? new Set(opts.setA) : null, inB = opts.setB ? new Set(opts.setB) : null;
        var list = parts.filter(function (p) { return p && p.bbox && (!inA || inA.has(p.pid) || (inB && inB.has(p.pid))); })
            .map(function (p) { return { pid: p.pid, b: p.bbox }; })
            .sort(function (a, b) { return (a.b.min[0] - b.b.min[0]) || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0); });
        var pairs = [], i = 0, j = 1, results = [], k = 0, phase = 0, grow = tol + touch, byPid = {};
        list.forEach(function (x) { byPid[x.pid] = x.b; });
        function wanted(a, b) {
            if (inA && inB) return (inA.has(a) && inB.has(b)) || (inA.has(b) && inB.has(a));
            return true;
        }
        var job = {
            results: results, progress: 0, pairsTested: 0, candidates: 0,
            step: function (budget) {
                var t0 = Date.now(); budget = budget || 8;
                while (phase === 0) {
                    if (i >= list.length) { phase = 1; job.candidates = pairs.length; break; }
                    if (j >= list.length || list[j].b.min[0] > list[i].b.max[0] + grow) { i++; j = i + 1; continue; }
                    var A = list[i], B = list[j]; j++;
                    if (A.b.min[1] > B.b.max[1] + grow || B.b.min[1] > A.b.max[1] + grow || A.b.min[2] > B.b.max[2] + grow || B.b.min[2] > A.b.max[2] + grow) continue;
                    if (!wanted(A.pid, B.pid)) continue;
                    pairs.push(A.pid < B.pid ? [A.pid, B.pid] : [B.pid, A.pid]);
                    if ((pairs.length & 1023) === 0 && Date.now() - t0 > budget) { job.progress = 0.3 * i / list.length; return false; }
                }
                while (phase === 1) {
                    if (k >= pairs.length || (opts.maxPairs && results.length >= opts.maxPairs)) { phase = 2; break; }
                    var pr = pairs[k++], ma = mesh(pr[0]), mb = mesh(pr[1]);
                    job.pairsTested++;
                    if (ma && mb) {
                        var rr = classifyPair(ma, mb, byPid[pr[0]], byPid[pr[1]], tol, touch);
                        if (rr) { rr.pidA = pr[0]; rr.pidB = pr[1]; results.push(rr); }
                    }
                    if (Date.now() - t0 > budget) { job.progress = 0.3 + 0.7 * k / Math.max(1, pairs.length); return false; }
                }
                if (phase === 2) {
                    var rank = { clash: 0, touch: 1, clearance: 2 };
                    results.sort(function (a, b) { return (rank[a.kind] - rank[b.kind]) || (a.distance - b.distance) || (a.pidA < b.pidA ? -1 : a.pidA > b.pidA ? 1 : 0) || (a.pidB < b.pidB ? -1 : a.pidB > b.pidB ? 1 : 0); });
                    phase = 3; job.progress = 1;
                }
                return true;
            }
        };
        return job;
    }
    // Is some point of the overlap of the two boxes inside both closed meshes? (ray parity, a
    // fixed slanted ray so no edge is hit head on; 9 points: the center and 8 inset corners)
    function _inv(m) {
        if (!m) return null;
        var a = m, r = [a[0], a[4], a[8], a[1], a[5], a[9], a[2], a[6], a[10]];   // rotation transposed (rigid placements)
        var s2 = a[0] * a[0] + a[1] * a[1] + a[2] * a[2]; r = r.map(function (x) { return x / s2; });
        var t = [-(r[0] * a[12] + r[1] * a[13] + r[2] * a[14]), -(r[3] * a[12] + r[4] * a[13] + r[5] * a[14]), -(r[6] * a[12] + r[7] * a[13] + r[8] * a[14])];
        return [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, t[0], t[1], t[2], 1];
    }
    function _inside(mesh, p) {
        var q = mesh.matrix ? xf(_inv(mesh.matrix), p) : p;
        var d = [0.8017837, 0.2672612, 0.5345225];
        return (mesh.bvh.countHits(q, d) & 1) === 1;
    }
    function sharedVolume(ma, mb, ba, bb, eps) {
        if (!ba || !bb) return false;
        var mn = [0, 1, 2].map(function (j) { return Math.max(ba.min[j], bb.min[j]); }), mx = [0, 1, 2].map(function (j) { return Math.min(ba.max[j], bb.max[j]); });
        if ([0, 1, 2].some(function (j) { return mx[j] - mn[j] <= Math.max(eps, 1e-6); })) return false;
        var pts = [[0.5, 0.5, 0.5]];
        for (var c = 0; c < 8; c++) pts.push([c & 1 ? 0.75 : 0.25, c & 2 ? 0.75 : 0.25, c & 4 ? 0.75 : 0.25]);
        return pts.some(function (f) { var p = [mn[0] + (mx[0] - mn[0]) * f[0], mn[1] + (mx[1] - mn[1]) * f[1], mn[2] + (mx[2] - mn[2]) * f[2]]; return _inside(ma, p) && _inside(mb, p); });
    }
    function runClash(parts, mesh, opts) { var j = clashJob(parts, mesh, opts); while (!j.step(1e9)) { /* run to the end */ } return j; }


    // ------------------------------------------------------------------ clash across workers
    // Full-aircraft clash: the broad phase (sweep and prune over flat boxes) here, the narrow
    // phase in parallel workers, results merged in one fixed order. The data travels as flat
    // arrays: boxes (6 per part), prototype index per part, placements (16 per part, identity
    // flagged), the prototype meshes once per worker.
    //   data = { n, bbox: Float64Array, proto: Int32Array, matrix: Float32Array(16n), hasMatrix: Uint8Array, protos: [{ position, index }] }
    //   opts = { tolerance, touch, workers: [ { post(msg, transfer), onmessage = fn } ], onProgress(frac) }
    // Resolves { results: [{ i, j, kind, distance, a, b }] sorted, candidates, ms }.
    function broadPhase(data, grow) {
        var n = data.n, B = data.bbox, ord = new Int32Array(n), i, j;
        for (i = 0; i < n; i++) ord[i] = i;
        ord.sort(function (a, b) { return (B[a * 6] - B[b * 6]) || (a - b); });
        var cap = 1 << 16, pairs = new Int32Array(cap * 2), np = 0;
        for (var p = 0; p < n; p++) {
            var a = ord[p], ax1 = B[a * 6 + 3] + grow, ay0 = B[a * 6 + 1] - grow, ay1 = B[a * 6 + 4] + grow, az0 = B[a * 6 + 2] - grow, az1 = B[a * 6 + 5] + grow;
            for (var q = p + 1; q < n; q++) {
                var b = ord[q];
                if (B[b * 6] > ax1) break;
                if (B[b * 6 + 1] > ay1 || B[b * 6 + 4] < ay0 || B[b * 6 + 2] > az1 || B[b * 6 + 5] < az0) continue;
                if (np === cap) { var nw = new Int32Array(cap * 4); nw.set(pairs); pairs = nw; cap *= 2; }
                pairs[np * 2] = Math.min(a, b); pairs[np * 2 + 1] = Math.max(a, b); np++;
            }
        }
        return pairs.subarray(0, np * 2);
    }
    // the narrow phase on one batch of pairs (runs inside a worker): state from 'clash-init'
    function clashBatch(state, pairs, tol, touch) {
        var out = [], d = state.data, bvh = state.bvh || (state.bvh = {});
        function mesh(i) {
            var pr = d.proto[i], P = d.protos[pr];
            var b = bvh[pr] || (bvh[pr] = new Bvh(P.position, P.index));
            return { bvh: b, matrix: d.hasMatrix[i] ? d.matrix.subarray(i * 16, i * 16 + 16) : null };
        }
        function box(i) { var o = i * 6, B = d.bbox; return { min: [B[o], B[o + 1], B[o + 2]], max: [B[o + 3], B[o + 4], B[o + 5]] }; }
        for (var k = 0; k < pairs.length; k += 2) {
            var i = pairs[k], j = pairs[k + 1], r = classifyPair(mesh(i), mesh(j), box(i), box(j), tol, touch);
            if (r) out.push({ i: i, j: j, kind: r.kind, distance: r.distance, a: r.a, b: r.b });
        }
        return out;
    }
    // message handler shared by the browser worker (cad_import_worker.js) and node test workers
    function clashWorkerMessage(state, msg, post) {
        if (msg.type === 'clash-init') { state.data = msg.data; state.bvh = {}; return true; }
        if (msg.type === 'clash-pairs') { post({ type: 'clash-done', batch: msg.batch, results: clashBatch(state, msg.pairs, msg.tolerance, msg.touch) }); return true; }
        return false;
    }
    // Each part's box from its actual shape (the prototype's own box moved by the placement), so
    // the broad phase never misses a pair because a stored box was only an estimate.
    function shapeBoxes(data) {
        var np = data.protos.length, lb = new Float64Array(np * 6), n = data.n, out = new Float64Array(n * 6), k, i;
        for (k = 0; k < np; k++) {
            var P = data.protos[k].position, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
            for (i = 0; i < P.length; i += 3) for (var j = 0; j < 3; j++) { var v = P[i + j]; if (v < mn[j]) mn[j] = v; if (v > mx[j]) mx[j] = v; }
            lb.set([mn[0], mn[1], mn[2], mx[0], mx[1], mx[2]], k * 6);
        }
        for (i = 0; i < n; i++) {
            var o = data.proto[i] * 6, cx = (lb[o] + lb[o + 3]) / 2, cy = (lb[o + 1] + lb[o + 4]) / 2, cz = (lb[o + 2] + lb[o + 5]) / 2, ex = (lb[o + 3] - lb[o]) / 2, ey = (lb[o + 4] - lb[o + 1]) / 2, ez = (lb[o + 5] - lb[o + 2]) / 2;
            var q = i * 6;
            if (!data.hasMatrix[i]) { out[q] = lb[o]; out[q + 1] = lb[o + 1]; out[q + 2] = lb[o + 2]; out[q + 3] = lb[o + 3]; out[q + 4] = lb[o + 4]; out[q + 5] = lb[o + 5]; continue; }
            var m = data.matrix, b = i * 16;
            var wx = m[b] * cx + m[b + 4] * cy + m[b + 8] * cz + m[b + 12], wy = m[b + 1] * cx + m[b + 5] * cy + m[b + 9] * cz + m[b + 13], wz = m[b + 2] * cx + m[b + 6] * cy + m[b + 10] * cz + m[b + 14];
            var hx = Math.abs(m[b]) * ex + Math.abs(m[b + 4]) * ey + Math.abs(m[b + 8]) * ez, hy = Math.abs(m[b + 1]) * ex + Math.abs(m[b + 5]) * ey + Math.abs(m[b + 9]) * ez, hz = Math.abs(m[b + 2]) * ex + Math.abs(m[b + 6]) * ey + Math.abs(m[b + 10]) * ez;
            out[q] = wx - hx; out[q + 1] = wy - hy; out[q + 2] = wz - hz; out[q + 3] = wx + hx; out[q + 4] = wy + hy; out[q + 5] = wz + hz;
        }
        return out;
    }
    function clashParallel(data, opts) {
        opts = opts || {};
        data.bbox = shapeBoxes(data);
        var tol = Math.max(0, +opts.tolerance || 0), touch = opts.touch != null ? +opts.touch : 0.01, t0 = Date.now();
        var pairs = broadPhase(data, tol + touch), np = pairs.length / 2;
        var workers = opts.workers || [], BATCH = opts.batch || 2048, batches = [];
        for (var s = 0; s < np; s += BATCH) batches.push(pairs.slice(s * 2, Math.min(np, s + BATCH) * 2));
        var results = new Array(batches.length), next = 0, doneN = 0;
        return new Promise(function (resolve) {
            function finish() {
                var all = [];
                results.forEach(function (r) { if (r) all.push.apply(all, r); });
                var rank = { clash: 0, touch: 1, clearance: 2 }, pid = opts.pidOf || function (i) { return i; };
                all.forEach(function (r) { var a = pid(r.i), b = pid(r.j); if (a > b) { var t = a; a = b; b = t; } r.pidA = a; r.pidB = b; });
                all.sort(function (a, b) { return (rank[a.kind] - rank[b.kind]) || (a.distance - b.distance) || (a.pidA < b.pidA ? -1 : a.pidA > b.pidA ? 1 : 0) || (a.pidB < b.pidB ? -1 : a.pidB > b.pidB ? 1 : 0); });
                resolve({ results: all, candidates: np, ms: Date.now() - t0, workers: workers.length });
            }
            if (!batches.length) return finish();
            if (!workers.length) {   // no workers: here, in order
                var st = { data: data };
                batches.forEach(function (b, k) { results[k] = clashBatch(st, b, tol, touch); });
                return finish();
            }
            workers.forEach(function (w) {
                w.post({ type: 'clash-init', data: data });
                w.onmessage = function (msg) {
                    if (!msg || msg.type !== 'clash-done') return;
                    results[msg.batch] = msg.results; doneN++;
                    if (opts.onProgress) { try { opts.onProgress(doneN / batches.length); } catch (_) {} }
                    if (next < batches.length) send(w); else if (doneN === batches.length) finish();
                };
                send(w); send(w);
            });
            function send(w) { if (next >= batches.length) return; var k = next++; w.post({ type: 'clash-pairs', batch: k, pairs: batches[k], tolerance: tol, touch: touch }); }
        });
    }

    // ------------------------------------------------------------------ three.js scene
    // Scene(T, opts): owns the chunks of one model.
    //   build(geom, parts, onProgress) -> Promise (progressive: chunks appear as they are built)
    //   setVisible(pids|all, on), setColor(pid, [r,g,b]|null), setAlpha (ghost material only),
    //   setExplode(offsets|null), update(camera, heightPx) (LOD + culling, time-sliced),
    //   raycast(origin, dir) -> { pid, point, t, tri, proto }, worldPositions(pid), dispose().
    function Scene(T, opts) {
        this.T = T; this.opts = Object.assign({}, DEF, opts || {});
        this.group = new T.Group(); this.group.name = 'sl-cad-model';
        this.chunks = []; this.inst = []; this._byPid = {}; this.list = []; this.protos = []; this.bvh = {};
        this.material = opts && opts.material || new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.65, side: T.DoubleSide });
        this.ghostMaterial = new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0.0, roughness: 0.9, side: T.DoubleSide, transparent: true, opacity: 0.12, depthWrite: false });
        this.stats = { chunks: 0, instancedShapes: 0, instances: 0, prototypes: 0, coarse: 0, drawn: 0, culledFrustum: 0, culledSmall: 0, coarseDrawn: 0, occludedChunks: 0, drawCalls: 0 };
        this._cursor = 0; this._viewKey = ''; this.ghost = false;
    }
    var SP = Scene.prototype;
    Object.defineProperty(SP, 'byPid', { get: function () {
        if (!this._byPid) { var m = {}, L = this.list; for (var i = 0; i < L.length; i++) m[L[i].pid] = L[i]; this._byPid = m; }
        return this._byPid;
    } });
    function _geomOf(T, p) {
        var g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(p.position, 3));
        g.setIndex(new T.BufferAttribute(p.index, 1));
        if (p.normal && p.normal.length === p.position.length) g.setAttribute('normal', new T.BufferAttribute(p.normal, 3)); else g.computeVertexNormals();
        g.computeBoundingSphere();
        return g;
    }
    // Two kinds of drawing:
    //   * a shape used by at least INST_MIN parts is drawn with GPU instancing: one InstancedMesh
    //     for all its copies (and one for its coarse copy), the visible copies packed at the front
    //     each time visibility or detail changes: one draw call per shape, however many copies;
    //   * the other parts go to spatial chunks of BatchedMesh (one multi-draw per chunk).
    var INST_MIN = 4;
    // Items straight from the cache's flat arrays: no part records needed to draw. An item's
    // part record (it.meta) is looked up by position when first asked for.
    function PItem() {}
    Object.defineProperty(PItem.prototype, 'meta', { get: function () { var L = this._sc._allParts(); return L[this._i]; } });
    SP._bboxOf = function (it) {
        if (it instanceof PItem) { var B = this._packedBox, o = it._i * 6; return { min: [B[o], B[o + 1], B[o + 2]], max: [B[o + 3], B[o + 4], B[o + 5]] }; }
        return it.meta.bbox;
    };
    SP._allParts = function () { if (!this._parts) this._parts = this._partsFn ? this._partsFn() : []; return this._parts; };
    SP._itemsPacked = function (PK, parts, box) {
        var I = root.SLCadImport, PP = parts.packed, n = PK.n, pids = I.pidsOf(PK, PP), M16 = I.matrices16(PK), items = new Array(n), B = PP.bbox, protos = this.geom.protos;
        this._partsFn = parts.all; this._parts = null; this._packedBox = B;
        for (var i = 0; i < n; i++) {
            var o = i * 6, x0 = B[o], y0 = B[o + 1], z0 = B[o + 2], x1 = B[o + 3], y1 = B[o + 4], z1 = B[o + 5];
            if (x0 < box.min[0]) box.min[0] = x0; if (y0 < box.min[1]) box.min[1] = y0; if (z0 < box.min[2]) box.min[2] = z0;
            if (x1 > box.max[0]) box.max[0] = x1; if (y1 > box.max[1]) box.max[1] = y1; if (z1 > box.max[2]) box.max[2] = z1;
            var it = new PItem();
            it._sc = this; it._i = i; it.pid = pids[i]; it.proto = PK.proto[i];
            it.matrix = PK.hasMatrix[i] ? M16.subarray(i * 16, i * 16 + 16) : null;
            it.color = I.colorAt(PK, i);
            it.center = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
            it.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
            it.verts = protos[it.proto].position.length / 3;
            items[i] = it;
        }
        return items;
    };
    SP.build = function (geom, parts, onProgress) {
        var T = this.T, self = this, I = root.SLCadImport;
        geom = I && I.normalizeGeometry ? I.normalizeGeometry(geom) : geom;
        this.geom = geom;
        // parts and placements in the same order (a large model straight from its cache): read
        // by position, no pid index needed to draw the first frame
        var box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        var items = [];
        if (parts && parts.packed && geom.packed) items = this._itemsPacked(geom.packed, parts, box);
        else {
        var ms = geom.meshes, aligned = !!parts && parts.length === ms.length;
        for (var q = 0; aligned && q < ms.length; q++) if (parts[q].pid !== ms[q].pid) aligned = false;
        var meta = null;
        if (!aligned) { meta = {}; (parts || []).forEach(function (p) { meta[p.pid] = p; }); }
        ms.forEach(function (m, mi) {
            var p = aligned ? parts[mi] : meta[m.pid]; if (!p) return;
            for (var j = 0; j < 3; j++) { box.min[j] = Math.min(box.min[j], p.bbox.min[j]); box.max[j] = Math.max(box.max[j], p.bbox.max[j]); }
            var c = [(p.bbox.min[0] + p.bbox.max[0]) / 2, (p.bbox.min[1] + p.bbox.max[1]) / 2, (p.bbox.min[2] + p.bbox.max[2]) / 2];
            var r = Math.hypot(p.bbox.max[0] - p.bbox.min[0], p.bbox.max[1] - p.bbox.min[1], p.bbox.max[2] - p.bbox.min[2]) / 2;
            items.push({ pid: m.pid, meta: p, proto: m.proto, matrix: m.matrix || null, color: m.color, center: c, radius: r, verts: geom.protos[m.proto].position.length / 3 });
        });
        }
        var TR = (I && I._trace) || function () {}; TR('scene: items');
        this.box = box; this.list = items;
        items.forEach(function (it, i) { it.index = i; it.base = (it.color || [0.75, 0.77, 0.8]).slice(); it.cur = it.base.slice(); it.userVisible = true; it.lod = 0; });
        this._byPid = null;   // pid -> item, built on first use (not needed for the first frame)
        // coarse copies for heavy prototypes
        var D = I && I.decimate;
        this.protos = geom.protos.map(function (p) {
            var tris = p.index.length / 3, out = { src: p, tris: tris, coarse: null };
            if (D && tris >= self.opts.lodMinTris) { var d = D(p.position, p.index, Math.max(12, Math.floor(tris * self.opts.lodRatio))); if (d.decimated && d.index.length < p.index.length * 0.6) { out.coarse = { position: d.position, index: d.index }; self.stats.coarse++; } }
            return out;
        });
        TR('scene: prototypes');
        var copies = this.protos.map(function () { return 0; }); items.forEach(function (it) { copies[it.proto]++; });
        var instItems = {}, batchItems = [];
        items.forEach(function (it) { if (copies[it.proto] >= INST_MIN) (instItems[it.proto] = instItems[it.proto] || []).push(it); else batchItems.push(it); });
        // instanced shapes
        Object.keys(instItems).map(Number).sort(function (a, b) { return a - b; }).forEach(function (pi) {
            var list = instItems[pi], pr = self.protos[pi];
            var g = { proto: pi, items: list, dirty: true, full: null, coarse: null };
            var mk = function (src) {
                var geo = _geomOf(T, src), im = new T.InstancedMesh(geo, self.material, list.length);
                im.instanceColor = new T.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
                im.frustumCulled = false; im.count = 0; im.layers.enable(1); im.userData.sharedMat = true;
                self.group.add(im); return im;
            };
            g.full = mk(pr.src); if (pr.coarse) g.coarse = mk(pr.coarse);
            list.forEach(function (it) { it.group = g; it.drawn = true; });
            self.inst.push(g);
        });
        this.stats.instancedShapes = this.inst.length;
        TR('scene: instanced meshes');
        this.inst.forEach(function (g) { self._pack(g); });
        TR('scene: packed');
        var plan = planChunks(batchItems, box, this.opts);
        TR('scene: chunks planned (' + batchItems.length + ' batched parts)');
        plan.forEach(function (c) { c.items = c.items.map(function (k) { return batchItems[k].index; }); c.size = c.items.reduce(function (s, i) { return Math.max(s, items[i].radius); }, 0); });
        // Largest parts first, so the overall shape shows at once.
        plan.sort(function (a, b) { return b.size - a.size; });
        this.stats.prototypes = geom.protos.length; this.stats.instances = items.length;
        var k = 0, M4 = new T.Matrix4(), C = new T.Color();
        return new Promise(function (resolve) {
            (function slice() {
                if (self.disposed) return resolve(false);
                var t0 = Date.now();
                while (k < plan.length && Date.now() - t0 < 30) {
                    var c = plan[k++], nv = 0, ni = 0, protosHere = {};
                    c.items.forEach(function (ii) { protosHere[items[ii].proto] = 1; });
                    var pList = Object.keys(protosHere).map(Number).sort(function (a, b) { return a - b; });
                    pList.forEach(function (pi) { var p = self.protos[pi]; nv += p.src.position.length / 3; ni += p.src.index.length; if (p.coarse) { nv += p.coarse.position.length / 3; ni += p.coarse.index.length; } });
                    var bm = new T.BatchedMesh(c.items.length, Math.max(3, nv), Math.max(3, ni), self.material);
                    bm.perObjectFrustumCulled = false; bm.sortObjects = false; bm.frustumCulled = true; bm.layers.enable(1); bm.userData.sharedMat = true;
                    var gid = {};
                    pList.forEach(function (pi) {
                        var p = self.protos[pi], g = _geomOf(T, p.src), full = bm.addGeometry(g), coarse = null;
                        g.dispose();
                        if (p.coarse) { var g2 = _geomOf(T, p.coarse); coarse = bm.addGeometry(g2); g2.dispose(); }
                        gid[pi] = { full: full, coarse: coarse };
                    });
                    var chunk = { mesh: bm, items: c.items, gid: gid, box: null, occluded: false, query: null };
                    var cb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
                    c.items.forEach(function (ii) {
                        var it = items[ii], id = bm.addInstance(gid[it.proto].full);
                        if (it.matrix) M4.fromArray(it.matrix); else M4.identity();
                        bm.setMatrixAt(id, M4);
                        bm.setColorAt(id, C.setRGB(it.base[0], it.base[1], it.base[2]));
                        it.chunk = chunk; it.id = id; it.drawn = true; it.gidNow = gid[it.proto].full;
                        var ib = self._bboxOf(it); for (var j = 0; j < 3; j++) { cb.min[j] = Math.min(cb.min[j], ib.min[j]); cb.max[j] = Math.max(cb.max[j], ib.max[j]); }
                    });
                    bm.computeBoundingBox(); bm.computeBoundingSphere();
                    chunk.box = cb;
                    self.chunks.push(chunk); self.group.add(bm);
                }
                self.stats.chunks = self.chunks.length;
                if (onProgress) { try { onProgress(plan.length ? k / plan.length : 1); } catch (_) {} }
                if (k < plan.length) { setTimeout(slice, 0); return; }
                self._viewKey = ''; self._cursor = 0;
                resolve(true);
            })();
        });
    };
    // Pack an instanced shape: the copies to draw, at full detail or coarse, at the front of the
    // two instance buffers.
    SP._pack = function (g) {
        var T = this.T, M4 = this._m4 || (this._m4 = new T.Matrix4()), off = this.offsets;
        var nf = 0, nc = 0, F = g.full, Cm = g.coarse;
        for (var i = 0; i < g.items.length; i++) {
            var it = g.items[i];
            if (!it.drawn) { it.slotMesh = null; continue; }
            var tgt = it.lod === 1 && Cm ? Cm : F, slot = tgt === F ? nf++ : nc++;
            if (it.matrix) M4.fromArray(it.matrix); else M4.identity();
            var o = off && off[it.pid]; if (o) { M4.elements[12] += o[0]; M4.elements[13] += o[1]; M4.elements[14] += o[2]; }
            tgt.instanceMatrix.array.set(M4.elements, slot * 16);
            tgt.instanceColor.array[slot * 3] = it.cur[0]; tgt.instanceColor.array[slot * 3 + 1] = it.cur[1]; tgt.instanceColor.array[slot * 3 + 2] = it.cur[2];
            it.slotMesh = tgt; it.slot = slot;
        }
        F.count = nf; F.instanceMatrix.needsUpdate = true; F.instanceColor.needsUpdate = true;
        if (Cm) { Cm.count = nc; Cm.instanceMatrix.needsUpdate = true; Cm.instanceColor.needsUpdate = true; }
        g.dirty = false;
    };
    SP._apply = function (it) {
        var want = it.userVisible && !it.ghostHidden && it.lod >= 0 && !it.frustumOut;
        if (it.group) {
            var lodNow = it.lod === 1 && it.group.coarse ? 1 : 0;
            if (want !== it.drawn || (want && lodNow !== it.lodDrawn)) { it.drawn = want; it.lodDrawn = lodNow; it.group.dirty = true; }
            return;
        }
        var bm = it.chunk && it.chunk.mesh; if (!bm) return;
        if (want !== it.drawn) { bm.setVisibleAt(it.id, want); it.drawn = want; }
        var g = it.chunk.gid[it.proto], gidWant = it.lod === 1 && g.coarse != null ? g.coarse : g.full;
        if (it.gidNow !== gidWant) { bm.setGeometryIdAt(it.id, gidWant); it.gidNow = gidWant; }
    };
    // Streaming detail: real shapes replace the first view's boxes, prototype by prototype.
    // list = [{ proto, position, index, faces }]. Instanced shapes swap their geometry in place;
    // a chunk of batched parts is rebuilt once per call with every new shape it holds.
    SP.replaceProtos = function (list) {
        var T = this.T, self = this, dirtyChunks = [];
        var D = root.SLCadImport && root.SLCadImport.decimate;
        list.forEach(function (n) {
            var pr = self.protos[n.proto]; if (!pr) return;
            var src = { position: n.position, index: n.index, normal: null, faces: n.faces || null };
            if (self.geom && self.geom.protos[n.proto]) self.geom.protos[n.proto] = src;
            pr.src = src; pr.tris = n.index.length / 3; pr.coarse = null;
            if (D && pr.tris >= self.opts.lodMinTris) { var d = D(src.position, src.index, Math.max(12, Math.floor(pr.tris * self.opts.lodRatio))); if (d.decimated && d.index.length < src.index.length * 0.6) pr.coarse = { position: d.position, index: d.index }; }
            delete self.bvh[n.proto];
            pr._chunks = pr._chunks || null;
        });
        var touched = {}; list.forEach(function (n) { touched[n.proto] = 1; });
        this.inst.forEach(function (g) {
            if (!touched[g.proto]) return;
            var pr = self.protos[g.proto];
            g.full.geometry.dispose(); g.full.geometry = _geomOf(T, pr.src);
            if (pr.coarse) {
                if (g.coarse) { g.coarse.geometry.dispose(); g.coarse.geometry = _geomOf(T, pr.coarse); }
                else {
                    var im = new T.InstancedMesh(_geomOf(T, pr.coarse), g.full.material, g.items.length);
                    im.instanceColor = new T.InstancedBufferAttribute(new Float32Array(g.items.length * 3), 3);
                    im.frustumCulled = false; im.count = 0; im.layers.enable(1); im.userData.sharedMat = true;
                    self.group.add(im); g.coarse = im;
                }
            } else if (g.coarse) { self.group.remove(g.coarse); g.coarse.geometry.dispose(); g.coarse.dispose(); g.coarse = null; g.items.forEach(function (it) { if (it.lod === 1) it.lodDrawn = -1; }); }
            g.dirty = true; self._pack(g);
        });
        this.chunks.forEach(function (c) { for (var k in c.gid) if (touched[k]) { dirtyChunks.push(c); return; } });
        dirtyChunks.forEach(function (c) { self._rebuildChunk(c); });
        this._viewKey = ''; this._tlas = null;
        return { instanced: this.inst.filter(function (g) { return touched[g.proto]; }).length, chunks: dirtyChunks.length };
    };
    SP._rebuildChunk = function (c) {
        var T = this.T, self = this, items = this.list, M4 = new T.Matrix4(), C = new T.Color();
        var pList = Object.keys(c.gid).map(Number).sort(function (a, b) { return a - b; }), nv = 0, ni = 0;
        pList.forEach(function (pi) { var p = self.protos[pi]; nv += p.src.position.length / 3; ni += p.src.index.length; if (p.coarse) { nv += p.coarse.position.length / 3; ni += p.coarse.index.length; } });
        var old = c.mesh;
        var bm = new T.BatchedMesh(c.items.length, Math.max(3, nv), Math.max(3, ni), old.material);
        bm.perObjectFrustumCulled = false; bm.sortObjects = false; bm.frustumCulled = true; bm.layers.mask = old.layers.mask; bm.userData = old.userData;
        bm.onBeforeRender = old.onBeforeRender; bm.onAfterRender = old.onAfterRender; bm.visible = old.visible; bm.renderOrder = old.renderOrder;
        var gid = {};
        pList.forEach(function (pi) {
            var p = self.protos[pi], g = _geomOf(T, p.src), full = bm.addGeometry(g), coarse = null; g.dispose();
            if (p.coarse) { var g2 = _geomOf(T, p.coarse); coarse = bm.addGeometry(g2); g2.dispose(); }
            gid[pi] = { full: full, coarse: coarse };
        });
        c.items.forEach(function (ii) {
            var it = items[ii], id = bm.addInstance(gid[it.proto].full);
            M4.fromArray(old.getMatrixAt(it.id, M4).elements);
            bm.setMatrixAt(id, M4);
            bm.setColorAt(id, C.setRGB(it.cur[0], it.cur[1], it.cur[2]));
            it.id = id; it.gidNow = gid[it.proto].full;
            if (!it.drawn) bm.setVisibleAt(id, false);
        });
        c.gid = gid; c.mesh = bm;
        bm.computeBoundingBox(); bm.computeBoundingSphere();
        this.group.remove(old); this.group.add(bm);
        try { old.dispose(); } catch (_) {}
        c.items.forEach(function (ii) { self._apply(items[ii]); });
    };
    SP._flush = function () { var self = this; this.inst.forEach(function (g) { if (g.dirty) self._pack(g); }); };
    SP.setVisible = function (pids, on) {
        var self = this;
        (pids === true ? this.list.map(function (it) { return it.pid; }) : pids).forEach(function (pid) { var it = self.byPid[pid]; if (it) { it.userVisible = !!on; self._apply(it); } });
        this._flush();
        this._viewKey = '';
    };
    SP.isVisible = function (pid) { var it = this.byPid[pid]; return !!(it && it.userVisible); };
    SP.setColor = function (pid, rgb, alpha) {
        var it = this.byPid[pid]; if (!it) return;
        var c = rgb || it.base; it.cur = [c[0], c[1], c[2]];
        if (it.group) {
            var m = it.slotMesh;
            if (m) { m.instanceColor.array[it.slot * 3] = c[0]; m.instanceColor.array[it.slot * 3 + 1] = c[1]; m.instanceColor.array[it.slot * 3 + 2] = c[2]; m.instanceColor.needsUpdate = true; }
            return;
        }
        if (!it.chunk) return;
        it.chunk.mesh.setColorAt(it.id, new this.T.Vector4(c[0], c[1], c[2], alpha == null ? 1 : alpha));
    };
    // Ghost mode: every part draws see-through; `focus` parts are drawn solid by the caller.
    SP.setGhost = function (on, focusPids) {
        var self = this; this.ghost = !!on;
        var focus = new Set(focusPids || []);
        var mat = on ? self.ghostMaterial : self.material;
        this.chunks.forEach(function (c) { c.mesh.material = mat; });
        this.inst.forEach(function (g) { g.full.material = mat; if (g.coarse) g.coarse.material = mat; });
        this.list.forEach(function (it) { var h = on && focus.has(it.pid); if (!!it.ghostHidden !== h) { it.ghostHidden = h; self._apply(it); } });
        this._flush();
    };
    // Explode: offsets { pid: [dx,dy,dz] } or null.
    SP.setOffsets = function (off) {
        var T = this.T, M4 = new T.Matrix4();
        this.offsets = off || null;
        this.list.forEach(function (it) {
            if (it.group || !it.chunk) return;
            if (it.matrix) M4.fromArray(it.matrix); else M4.identity();
            var o = off && off[it.pid];
            if (o) { M4.elements[12] += o[0]; M4.elements[13] += o[1]; M4.elements[14] += o[2]; }
            it.chunk.mesh.setMatrixAt(it.id, M4);
        });
        this.inst.forEach(function (g) { g.dirty = true; });
        this._flush();
        this.chunks.forEach(function (c) { c.mesh.computeBoundingBox(); c.mesh.computeBoundingSphere(); });
        this._viewKey = ''; this._tlas = null;
    };
    SP.offsetOf = function (pid) { var o = this.offsets && this.offsets[pid]; return o || [0, 0, 0]; };
    // Level of detail and culling, a time slice per frame, only while the view changes: the parts
    // are visited round robin (the next slice starts where the last stopped), each against the
    // latest camera, so a moving camera never starves the parts at the end of the list. The
    // frustum test uses a sphere 1.5 times the part's, so a part does not pop in at the edge.
    SP.update = function (camera, heightPx) {
        var T = this.T, n = this.list.length; if (!n) return false;
        var e = camera.matrixWorld.elements, key = e.map(function (x) { return x.toFixed(3); }).join(',') + '|' + heightPx + '|' + camera.fov + '|' + (this.cullingOff ? 1 : 0);
        if (key !== this._viewKey) {
            this._viewKey = key; this._left = n;   // visit every part once against this view
            camera.updateMatrixWorld(); this._frustum = this._frustum || new T.Frustum();
            this._pm = this._pm || new T.Matrix4();
            this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            this._frustum.setFromProjectionMatrix(this._pm);
            this._cam = camera.position.clone(); this._h = heightPx; this._fov = camera.fov;
        }
        if (!(this._left > 0)) return false;
        var t0 = performance.now(), S = this._sphere || (this._sphere = new T.Sphere()), cam = this._cam;
        var budget = this.opts.sliceMs, off = this.offsets, done = 0;
        while (this._left > 0) {
            if (this._cursor >= n) { this._cursor = 0; this._pass = (this._pass || 0) + 1; }
            var it = this.list[this._cursor++]; this._left--; done++;
            if (this.cullingOff) { it.frustumOut = false; it.lod = 0; }
            else {
                var o = off && off[it.pid];
                S.center.set(it.center[0] + (o ? o[0] : 0), it.center[1] + (o ? o[1] : 0), it.center[2] + (o ? o[2] : 0)); S.radius = it.radius * 1.5;
                it.frustumOut = !this._frustum.intersectsSphere(S);
                var px = pixelRadius(it.radius, S.center.distanceTo(cam), this._fov, this._h);
                it.lod = lodLevel(px, !!this.protos[it.proto].coarse, this.opts);
            }
            this._apply(it);
            if ((done & 255) === 0 && performance.now() - t0 > budget) break;
        }
        this._flush();
        if (!(this._left > 0)) this._count();
        return true;
    };
    SP._count = function () {
        var c = { drawn: 0, culledFrustum: 0, culledSmall: 0, coarseDrawn: 0, drawCalls: 0 };
        this.list.forEach(function (it) { if (!it.userVisible) return; if (it.frustumOut) c.culledFrustum++; else if (it.lod < 0) c.culledSmall++; else { c.drawn++; if (it.lod === 1 && (it.group ? it.group.coarse : it.chunk && it.chunk.gid[it.proto].coarse != null)) c.coarseDrawn++; } });
        this.chunks.forEach(function (ch) { if (ch.mesh.visible) c.drawCalls++; });
        this.inst.forEach(function (g) { if (g.full.count) c.drawCalls++; if (g.coarse && g.coarse.count) c.drawCalls++; });
        Object.assign(this.stats, c);
    };
    // Every part at full detail, nothing culled (for a measurement or a full-quality snapshot).
    SP.setCulling = function (on) { this.cullingOff = !on; this._viewKey = ''; if (!on) this.disableOcclusion(); };
    // ---- occlusion queries per chunk (WebGL2): one frame late, conservative
    SP.setupOcclusion = function (renderer) {
        var gl = renderer.getContext();
        if (!gl || typeof gl.createQuery !== 'function' || typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) return false;
        var T = this.T, self = this;
        this._gl = gl; this.occlusion = true;
        this._qScene = new T.Scene();
        var mat = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: T.DoubleSide });
        var unit = new T.BoxGeometry(1, 1, 1);
        this.chunks.forEach(function (c) {
            var bx = new T.Mesh(unit, mat), b = c.mesh.boundingBox || new T.Box3(new T.Vector3().fromArray(c.box.min), new T.Vector3().fromArray(c.box.max));
            var s = new T.Vector3(); b.getSize(s); var ctr = new T.Vector3(); b.getCenter(ctr);
            bx.scale.set(Math.max(s.x, 1e-3) * 1.02, Math.max(s.y, 1e-3) * 1.02, Math.max(s.z, 1e-3) * 1.02); bx.position.copy(ctr);
            bx.frustumCulled = true; bx.matrixAutoUpdate = false; bx.updateMatrix();
            bx.onBeforeRender = function () { if (!c.query) c.query = gl.createQuery(); if (!c.pending) { gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, c.query); c._began = true; } };
            bx.onAfterRender = function () { if (c._began) { gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE); c._began = false; c.pending = true; } };
            c.qbox = bx; self._qScene.add(bx);
        });
        return true;
    };
    // Called after the main render: read last results, issue new queries.
    SP.occlusionPass = function (renderer, camera) {
        if (!this.occlusion) return;
        var gl = this._gl, occluded = 0, cam = camera.position;
        this.chunks.forEach(function (c) {
            if (c.pending && c.query && gl.getQueryParameter(c.query, gl.QUERY_RESULT_AVAILABLE)) {
                var vis = !!gl.getQueryParameter(c.query, gl.QUERY_RESULT); c.pending = false;
                var inside = cam.x >= c.box.min[0] && cam.x <= c.box.max[0] && cam.y >= c.box.min[1] && cam.y <= c.box.max[1] && cam.z >= c.box.min[2] && cam.z <= c.box.max[2];
                c.occluded = !vis && !inside;
            }
            c.mesh.visible = !c.occluded && !c.hidden;
            if (c.occluded) occluded++;
        });
        this.stats.occludedChunks = occluded;
        var ac = renderer.autoClear; renderer.autoClear = false;
        renderer.render(this._qScene, camera);
        renderer.autoClear = ac;
    };
    SP.disableOcclusion = function () { this.occlusion = false; this.chunks.forEach(function (c) { c.occluded = false; c.mesh.visible = !c.hidden; }); };
    SP.drawCalls = function () { this._count(); return this.stats.drawCalls; };
    // ---- picking and geometry access
    SP.protoBvh = function (pi) { return this.bvh[pi] || (this.bvh[pi] = new Bvh(this.protos[pi].src.position, this.protos[pi].src.index)); };
    SP.matrixOf = function (pid) {
        var it = this.byPid[pid]; if (!it) return null;
        var m = it.matrix ? Array.prototype.slice.call(it.matrix) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        var o = this.offsets && this.offsets[pid]; if (o) { m[12] += o[0]; m[13] += o[1]; m[14] += o[2]; }
        return m;
    };
    SP.meshOf = function (pid) { var it = this.byPid[pid]; if (!it) return null; return { bvh: this.protoBvh(it.proto), matrix: this.matrixOf(pid) }; };
    // Placement as drawn, without the explode offset (what measurements use).
    SP.trueMatrixOf = function (pid) { var it = this.byPid[pid]; return it ? (it.matrix ? Array.prototype.slice.call(it.matrix) : null) : null; };
    // The parts' boxes as drawn (explode offsets included), in a hierarchy; rebuilt when needed.
    SP.tlas = function () {
        if (this._tlas) return this._tlas;
        var n = this.list.length, B = new Float64Array(n * 6), off = this.offsets;
        for (var i = 0; i < n; i++) { var it = this.list[i], b = this._bboxOf(it), o = off && off[it.pid]; for (var j = 0; j < 3; j++) { B[i * 6 + j] = b.min[j] + (o ? o[j] : 0); B[i * 6 + 3 + j] = b.max[j] + (o ? o[j] : 0); } }
        this._tlas = new Tlas(B, n);
        return this._tlas;
    };
    // origin, dir: arrays (world). filter(it) -> false to skip. tmax: farthest distance. Nearest hit.
    SP.raycast = function (o, d, filter, tmax) {
        var self = this, T = this.T, best = null;
        var L = Math.hypot(d[0], d[1], d[2]); d = [d[0] / L, d[1] / L, d[2] / L];
        var cand = this.tlas().rayItems(o, d, tmax);
        var inv = new T.Matrix4(), M = new T.Matrix4(), v = new T.Vector3(), w = new T.Vector3();
        for (var k = 0; k < cand.length; k++) {
            var c = cand[k], it = this.list[c.i]; if (best && c.t > best.t) break;
            if (!it.userVisible || (!it.chunk && !it.group)) continue;
            if (filter && filter(it) === false) continue;
            var m = self.matrixOf(it.pid); M.fromArray(m); inv.copy(M).invert();
            v.fromArray(o).applyMatrix4(inv); w.fromArray([o[0] + d[0], o[1] + d[1], o[2] + d[2]]).applyMatrix4(inv).sub(v);
            var scale = w.length(); w.normalize();
            var h = self.protoBvh(it.proto).raycast([v.x, v.y, v.z], [w.x, w.y, w.z], tmax != null ? tmax * scale : undefined);
            if (h) {
                var tw = h.t / scale;
                if (!best || tw < best.t) {
                    var p = [o[0] + d[0] * tw, o[1] + d[1] * tw, o[2] + d[2] * tw];
                    if (!self.clipOk || self.clipOk(p)) best = { pid: it.pid, t: tw, point: p, tri: h.tri, proto: it.proto };
                }
            }
        }
        return best;
    };
    // The world normal of a hit triangle.
    SP.hitNormal = function (hit) {
        var P = this.protos[hit.proto].src.position, I = this.protos[hit.proto].src.index, m = this.matrixOf(hit.pid);
        var a = xf(m, [P[I[hit.tri * 3] * 3], P[I[hit.tri * 3] * 3 + 1], P[I[hit.tri * 3] * 3 + 2]]), b = xf(m, [P[I[hit.tri * 3 + 1] * 3], P[I[hit.tri * 3 + 1] * 3 + 1], P[I[hit.tri * 3 + 1] * 3 + 2]]), c = xf(m, [P[I[hit.tri * 3 + 2] * 3], P[I[hit.tri * 3 + 2] * 3 + 1], P[I[hit.tri * 3 + 2] * 3 + 2]]);
        var n = _cross(_sub(b, a), _sub(c, a)), L = Math.hypot(n[0], n[1], n[2]);
        return L > 0 ? [n[0] / L, n[1] / L, n[2] / L] : [0, 0, 1];
    };
    // The B-rep face a triangle came from (when the prototype kept its face ranges).
    SP.faceOfTri = function (proto, tri) {
        var f = this.protos[proto] && this.protos[proto].src.faces; if (!f) return null;
        var lo = 0, hi = f.length - 1;
        while (lo <= hi) { var mid = (lo + hi) >> 1; if (tri < f[mid].first) hi = mid - 1; else if (tri > f[mid].last) lo = mid + 1; else return mid; }
        return null;
    };
    SP.worldPositions = function (pid) {
        var it = this.byPid[pid]; if (!it) return null;
        var p = this.protos[it.proto].src.position, m = it.matrix;
        if (!m) return p;
        var out = new Float32Array(p.length);
        for (var i = 0; i < p.length; i += 3) { var q = xf(m, [p[i], p[i + 1], p[i + 2]]); out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2]; }
        return out;
    };
    // A plain three.js mesh of some parts (for the solid focus group, caps, snapshots).
    SP.partsMesh = function (pids, material) {
        var T = this.T, self = this, g = new T.Group();
        var byProto = {};
        pids.forEach(function (pid) { var it = self.byPid[pid]; if (it) (byProto[it.proto] = byProto[it.proto] || []).push(it); });
        Object.keys(byProto).forEach(function (k) {
            var list = byProto[k], geo = _geomOf(T, self.protos[k].src);
            var im = new T.InstancedMesh(geo, material, list.length), M4 = new T.Matrix4();
            list.forEach(function (it, i) { M4.fromArray(self.matrixOf(it.pid)); im.setMatrixAt(i, M4); });
            im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
            im.userData.pids = list.map(function (it) { return it.pid; });
            g.add(im);
        });
        return g;
    };
    SP.dispose = function () {
        this.disposed = true;
        this.chunks.forEach(function (c) { try { c.mesh.dispose(); } catch (_) {} if (c.mesh.parent) c.mesh.parent.remove(c.mesh); });
        this.inst.forEach(function (g) { [g.full, g.coarse].forEach(function (m) { if (!m) return; try { m.geometry.dispose(); m.dispose(); } catch (_) {} if (m.parent) m.parent.remove(m); }); });
        this.chunks = []; this.inst = []; this.list = []; this._byPid = {}; this.bvh = {};
        if (this._qScene) this._qScene.clear();
    };

    var api = {
        VERSION: VERSION, DEFAULTS: DEF, Scene: Scene, Bvh: Bvh, Tlas: Tlas,
        morton3: morton3, mortonOf: mortonOf, planChunks: planChunks, pixelRadius: pixelRadius, lodLevel: lodLevel, explodeOffsets: explodeOffsets,
        rayTri: rayTri, closestOnTri: closestOnTri, closestSegSeg: closestSegSeg, triTriIntersect: triTriIntersect, triTriDistance: triTriDistance,
        meshDistance: meshDistance, fastMeshDistance: fastMeshDistance, classifyPair: classifyPair, broadPhase: broadPhase, clashBatch: clashBatch, clashWorkerMessage: clashWorkerMessage, clashParallel: clashParallel, shapeBoxes: shapeBoxes, triTriCrossProper: triTriCrossProper, clashJob: clashJob, runClash: runClash, sharedVolume: sharedVolume, xf: xf
    };
    root.SLCadRender = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

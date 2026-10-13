// ============================================================================
// cad_viewer.js, v1.2: the 3D CAD viewer (window.SLCadViewer, 13 Oct 2026).
//
// View only: move through the aircraft, never author it. Built on three.js
// (vendor/three/three.min.js, r186, loaded on first use). Mountable in any
// container, so Cert Lab and Sys Lab can reuse it later.
//
//   * parts tree (the model's own assembly tree): click a row to select and
//     frame the part; click a part in 3D to reveal its row.
//   * orbit, pan, zoom (to the cursor), fit all, standard views, fly-through
//     and walk-through (W A S D + mouse, Q / E down / up, Shift faster),
//     full screen. Buttons and keys follow the diagram editor's style.
//   * hide, show all, isolate, x-ray, section planes X / Y / Z (drag the plane
//     or its slider), measure point to point or part to part.
//   * zones overlay from projectConfig.zones[*].volume (box -> translucent box,
//     parts -> those parts tinted), labelled with the zone code, per-zone
//     toggles; PRA volumes from projectConfig.praVolumes (cone, sphere, box,
//     disk-sector), toggled.
//
// API: SLCadViewer.mount(el, opts) -> viewer, with loadModel(cadId),
// showModel(entry, meshes), highlightZone(zoneId), highlightParts(pids),
// highlightVolume(id), onSelect(cb) -> unsubscribe, dispose(). The same names
// on SLCadViewer itself act on the most recently mounted viewer.
//
// Geometry comes only from this computer's IndexedDB cache (SLCadImport). If
// it is not there, the viewer asks for the STEP file to be re-opened locally
// and checks its fingerprint; it never downloads geometry. No eval, no
// Function constructor, no network calls.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.2';
    var THREE_URL = 'vendor/three/three.min.js';

    // =================================================================== pure helpers
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    // A stable, distinct color per zone code.
    function zoneColor(code) {
        var hue = (hashStr(code) % 360) / 360, s = 0.65, l = 0.5;
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        function f(t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
        var r = Math.round(f(hue + 1 / 3) * 255), g = Math.round(f(hue) * 255), b = Math.round(f(hue - 1 / 3) * 255);
        return '#' + [r, g, b].map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    }
    // Assembly tree from the parts' paths. Order follows the parts list.
    function buildTree(parts) {
        var rootNode = { key: '', label: '', children: [], pids: [], depth: -1 };
        var byKey = { '': rootNode };
        var counts = {};
        (parts || []).forEach(function (p) { var k = (p.path || []).join('/') + '//' + p.name; counts[k] = (counts[k] || 0) + 1; });
        var seen = {};
        (parts || []).forEach(function (p) {
            var node = rootNode, key = '';
            (p.path || []).forEach(function (seg, i) {
                key += '/' + seg;
                var n = byKey[key];
                if (!n) { n = byKey[key] = { key: key, label: seg, children: [], pids: [], depth: i }; node.children.push(n); }
                node = n;
            });
            var k = (p.path || []).join('/') + '//' + p.name;
            seen[k] = (seen[k] || 0) + 1;
            // An installed copy shows its designator (from the STEP instance name) when it has one.
            var label = p.name + (p.designator ? ' (' + p.designator + ')' : counts[k] > 1 ? ' (' + seen[k] + ')' : '');
            node.children.push({ key: 'pid:' + p.pid, label: label, pid: p.pid, partNumber: p.partNumber || null, children: [], pids: [p.pid], depth: (p.path || []).length });
            var up = rootNode; up.pids.push(p.pid);
            key = '';
            (p.path || []).forEach(function (seg) { key += '/' + seg; byKey[key].pids.push(p.pid); });
        });
        return { root: rootNode, byKey: byKey };
    }
    function ancestorsOf(pid, parts) {
        var p = (parts || []).find(function (x) { return x.pid === pid; }); if (!p) return [];
        var out = [], key = ''; (p.path || []).forEach(function (seg) { key += '/' + seg; out.push(key); }); return out;
    }
    function unionBox(boxes) {
        var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], any = false;
        (boxes || []).forEach(function (b) { if (!b) return; any = true; for (var j = 0; j < 3; j++) { if (b.min[j] < mn[j]) mn[j] = b.min[j]; if (b.max[j] > mx[j]) mx[j] = b.max[j]; } });
        return any ? { min: mn, max: mx } : null;
    }
    // Standard views. Aircraft axes: X aft, Y right wing, Z up. "Front" looks
    // from the nose (-X) toward the tail.
    var VIEWS = {
        front: { dir: [-1, 0, 0], label: 'Front' }, back: { dir: [1, 0, 0], label: 'Back' },
        left: { dir: [0, -1, 0], label: 'Left' }, right: { dir: [0, 1, 0], label: 'Right' },
        // Top and bottom lean 2 degrees off vertical so the Z-up orbit keeps a heading.
        top: { dir: [-0.035, 0, 1], label: 'Top' }, bottom: { dir: [-0.035, 0, -1], label: 'Bottom' },
        iso: { dir: [-1, -1, 0.8], label: 'Isometric' }
    };
    // Distance from the box center, along unit direction dir (target to camera), at which
    // every corner of the box is inside the view. Tighter than a bounding sphere for long
    // shapes like a fuselage.
    function fitBoxDistance(box, dir, fovDeg, aspect) {
        var up = Math.abs(dir[2]) > 0.999 ? [1, 0, 0] : [0, 0, 1];
        var f = [-dir[0], -dir[1], -dir[2]];
        var r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
        var rl = Math.hypot(r[0], r[1], r[2]) || 1; r = [r[0] / rl, r[1] / rl, r[2] / rl];
        var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
        var tv = Math.tan(fovDeg * Math.PI / 360), th = tv * (aspect || 1);
        var c = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
        var d = 0;
        for (var i = 0; i < 8; i++) {
            var p = [i & 1 ? box.max[0] : box.min[0], i & 2 ? box.max[1] : box.min[1], i & 4 ? box.max[2] : box.min[2]];
            var v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
            var x = v[0] * r[0] + v[1] * r[1] + v[2] * r[2], y = v[0] * u[0] + v[1] * u[1] + v[2] * u[2], z = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
            d = Math.max(d, z + Math.abs(x) / th, z + Math.abs(y) / tv);
        }
        return Math.max(d * 1.08, 1e-6);
    }
    function standardView(name, box, fovDeg, aspect) {
        var v = VIEWS[name] || VIEWS.iso;
        var c = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
        var dx = box.max[0] - box.min[0], dy = box.max[1] - box.min[1], dz = box.max[2] - box.min[2];
        var L = Math.sqrt(v.dir[0] * v.dir[0] + v.dir[1] * v.dir[1] + v.dir[2] * v.dir[2]);
        var u = [v.dir[0] / L, v.dir[1] / L, v.dir[2] / L];
        var d = Math.max(fitBoxDistance(box, u, fovDeg || 45, aspect || 1), 1e-3 * Math.sqrt(dx * dx + dy * dy + dz * dz));
        return { position: [c[0] + u[0] * d, c[1] + u[1] * d, c[2] + u[2] * d], target: c, up: [0, 0, 1], distance: d };
    }
    // PRA shape -> a plain description the renderer turns into geometry.
    // Lathe profiles are [radius, height] pairs around the shape's axis.
    function _n3(a) { return Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every(function (x) { return typeof x === 'number' && isFinite(x); }); }
    function _unit(a) { var L = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); return L > 0 ? [a[0] / L, a[1] / L, a[2] / L] : null; }
    // Drawn exactly as the engine (cad_zonal.js inShape) decides what is inside, so what the
    // engineer sees is what is counted:
    //   cone        apex, axis, halfAngleDeg; length optional (no length: drawn to opts.reach).
    //   disk-sector center, axis (of rotation), spread about the rotor plane: spreadDeg, else the
    //               fragment model's default (oneThirdDisc 3, intermediate 5, small 15 degrees;
    //               intermediate when unnamed); reach: range, else radius, else opts.reach (the
    //               engine counts an unbounded sector); optional sector fromDeg..toDeg measured
    //               from refDir about the axis.
    var FRAGMENTS = { oneThirdDisc: 3, intermediate: 5, small: 15 };
    function _spread(sh) {
        var E = root.SLCadZonal; if (E && typeof E.spreadOf === 'function') return E.spreadOf(sh);
        if (typeof sh.spreadDeg === 'number' && sh.spreadDeg >= 0) return sh.spreadDeg;
        return FRAGMENTS[sh.fragment] != null ? FRAGMENTS[sh.fragment] : FRAGMENTS.intermediate;
    }
    function volumeSpec(shape, opts) {
        opts = opts || {};
        var reachDefault = opts.reach > 0 ? opts.reach : null;
        if (!shape || typeof shape !== 'object') return { ok: false, err: 'no shape' };
        var k = shape.kind;
        if (k === 'sphere') {
            if (!_n3(shape.center) || !(shape.radius > 0)) return { ok: false, err: 'sphere needs center and a positive radius' };
            return { ok: true, type: 'sphere', center: shape.center.slice(0, 3), radius: shape.radius, anchor: shape.center.slice(0, 3) };
        }
        if (k === 'box') {
            if (!_n3(shape.min) || !_n3(shape.max)) return { ok: false, err: 'box needs min and max' };
            var mn = [0, 1, 2].map(function (j) { return Math.min(shape.min[j], shape.max[j]); }), mx = [0, 1, 2].map(function (j) { return Math.max(shape.min[j], shape.max[j]); });
            return { ok: true, type: 'box', min: mn, max: mx, anchor: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mx[2]] };
        }
        if (k === 'cone') {
            var ax = _n3(shape.axis) ? _unit(shape.axis) : null, a = +shape.halfAngleDeg;
            var L = shape.length != null ? +shape.length : reachDefault;
            if (!_n3(shape.apex) || !ax || !(a > 0 && a < 90) || !(L > 0)) return { ok: false, err: 'cone needs apex, axis, a half angle between 0 and 90 degrees and a positive length' };
            var R = L * Math.tan(a * Math.PI / 180);
            return { ok: true, type: 'lathe', origin: shape.apex.slice(0, 3), axis: ax, points: [[0, 0], [R, L], [0, L]], baseRadius: R, bounded: shape.length != null, anchor: shape.apex.slice(0, 3) };
        }
        if (k === 'disk-sector') {
            var nx = _n3(shape.axis) ? _unit(shape.axis) : null, sp = _spread(shape);
            var Rd = shape.range != null ? +shape.range : shape.radius != null ? +shape.radius : reachDefault;
            if (!_n3(shape.center) || !nx || !(Rd > 0) || !(sp >= 0 && sp < 90)) return { ok: false, err: 'disk-sector needs center, axis, a reach and a spread between 0 and 90 degrees' };
            var sr = Math.max(sp, 0.25) * Math.PI / 180, pts = [[0, 0]], N = 12, i;
            for (i = -N; i <= N; i++) { var t = sr * i / N; pts.push([Rd * Math.cos(t), Rd * Math.sin(t)]); }
            pts.push([0, 0]);
            var out = { ok: true, type: 'lathe', origin: shape.center.slice(0, 3), axis: nx, points: pts, reach: Rd, spreadDeg: sp, bounded: shape.range != null || shape.radius != null, anchor: shape.center.slice(0, 3) };
            if (shape.fromDeg != null || shape.toDeg != null) {
                if (!_n3(shape.refDir)) return { ok: false, err: 'a sector needs a reference direction' };
                var d = shape.refDir, dn = d[0] * nx[0] + d[1] * nx[1] + d[2] * nx[2];
                var e1 = _unit([d[0] - nx[0] * dn, d[1] - nx[1] * dn, d[2] - nx[2] * dn]);
                if (e1) {
                    var e2 = [nx[1] * e1[2] - nx[2] * e1[1], nx[2] * e1[0] - nx[0] * e1[2], nx[0] * e1[1] - nx[1] * e1[0]];
                    var from = ((+shape.fromDeg || 0) % 360 + 360) % 360, to = shape.toDeg == null ? from + 360 : +shape.toDeg;
                    var len = shape.toDeg != null && to - (+shape.fromDeg || 0) >= 360 ? 360 : (((to % 360) + 360) % 360 - from + 360) % 360 || 360;
                    // lathe angle phi maps to e1 cos(phi) + e2 sin(phi): local Z = e1, local X = e2, local Y = axis
                    out.basis = { x: e2, y: nx, z: e1 }; out.phiStart = from * Math.PI / 180; out.phiLength = len * Math.PI / 180;
                }
            }
            return out;
        }
        return { ok: false, err: 'unknown shape kind ' + k };
    }
    // Closest pair of vertices between two parts (world coordinates, which is
    // what the cache holds). Exact over the vertices, so the error is at most
    // the tessellation's edge length. Sort-and-sweep on X.
    function _unbounded(sh) { return !!sh && ((sh.kind === 'cone' && sh.length == null) || (sh.kind === 'disk-sector' && sh.range == null && sh.radius == null)); }
    function closestVertexPair(posA, posB, maxVerts) {
        maxVerts = maxVerts || 200000;
        var na = posA.length / 3, nb = posB.length / 3;
        var sa = Math.max(1, Math.ceil(na / maxVerts)), sb = Math.max(1, Math.ceil(nb / maxVerts));
        var ib = []; for (var j = 0; j < nb; j += sb) ib.push(j);
        ib.sort(function (p, q) { return posB[p * 3] - posB[q * 3]; });
        var xs = ib.map(function (k) { return posB[k * 3]; });
        var best = Infinity, ba = -1, bb = -1;
        for (var i = 0; i < na; i += sa) {
            var x = posA[i * 3], y = posA[i * 3 + 1], z = posA[i * 3 + 2];
            var lo = 0, hi = xs.length; while (lo < hi) { var mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid + 1; else hi = mid; }
            for (var dir = -1; dir <= 1; dir += 2) {
                for (var t = dir < 0 ? lo - 1 : lo; t >= 0 && t < xs.length; t += dir) {
                    var dx = xs[t] - x; if (dx * dx >= best) break;
                    var k = ib[t], dy = posB[k * 3 + 1] - y, dz = posB[k * 3 + 2] - z, d2 = dx * dx + dy * dy + dz * dz;
                    if (d2 < best) { best = d2; ba = i; bb = k; }
                }
            }
        }
        if (ba < 0) return null;
        return { distance: Math.sqrt(best), a: [posA[ba * 3], posA[ba * 3 + 1], posA[ba * 3 + 2]], b: [posB[bb * 3], posB[bb * 3 + 1], posB[bb * 3 + 2]] };
    }
    function fmtMm(v) { return (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) + ' mm'; }
    function _pc() {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get('projectConfig'); if (v) return v; } } catch (_) {}
        try { if (typeof projectConfig !== 'undefined' && projectConfig) return projectConfig; } catch (_) {}   // eslint-disable-line no-undef
        return root.projectConfig || {};
    }

    var _threeP = null;
    function loadThree() {
        if (root.THREE && root.THREE.WebGLRenderer) return Promise.resolve(root.THREE);
        if (_threeP) return _threeP;
        _threeP = new Promise(function (resolve, reject) {
            var s = document.createElement('script'); s.src = THREE_URL;
            s.onload = function () { if (root.THREE) resolve(root.THREE); else { _threeP = null; reject(new Error('The 3D library did not start.')); } };
            s.onerror = function () { _threeP = null; reject(new Error('Could not load the 3D library (' + THREE_URL + ' is missing from this build).')); };
            document.head.appendChild(s);
        });
        return _threeP;
    }

    // =================================================================== styles
    var CSS = [
        '.scv{--scv-bg:var(--color-surface-1,#fff);--scv-panel:var(--color-surface-2,#f5f6f8);--scv-border:var(--color-border-thin,rgba(20,23,28,.35));--scv-accent:var(--color-accent,#1A6EF2);--scv-muted:var(--color-text-tertiary,#7a828f);--scv-bad:var(--color-danger,#c0392b);',
        'position:relative;display:flex;flex-direction:column;border:1px solid var(--scv-border);border-radius:8px;background:var(--scv-bg);color:var(--color-text-primary,#14171c);font:13px/1.35 var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif);height:620px;min-height:360px;overflow:hidden}',
        '.scv.scv-fullscreen{position:fixed;inset:0;z-index:9000;border-radius:0;height:auto!important}',
        '.scv-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--scv-border);background:var(--scv-panel)}',
        '.scv-sep{width:1px;height:20px;background:var(--scv-border);margin:0 4px}',
        '.scv-btn{display:inline-flex;align-items:center;gap:4px;height:28px;margin:0;padding:0 9px;box-shadow:none;background-image:none;border:1px solid var(--scv-border);border-radius:6px;background:var(--scv-bg);color:inherit;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;width:auto}',
        '.scv select.scv-btn{padding:0 6px;min-width:0;flex:0 0 auto}',
        // The app styles every <button> with a gradient and a hover lift (safety_lab.css, specificity 0,2,1);
        // the viewer's own buttons are flat, so its rules carry the .scv prefix to win.
        '.scv button:hover:not(:disabled){transform:none;box-shadow:none}',
        '.scv .scv-btn:hover:not(:disabled){background:var(--scv-bg);border-color:var(--scv-accent)}',
        '.scv .scv-btn[aria-pressed="true"],.scv .scv-btn[aria-pressed="true"]:hover:not(:disabled){background:var(--scv-accent);border-color:var(--scv-accent);color:#fff}',
        '.scv .scv-tab:hover:not(:disabled){background:var(--scv-bg)}',
        '.scv .scv-car:hover:not(:disabled),.scv .scv-eye:hover:not(:disabled){background:transparent;color:var(--scv-accent)}',
        '.scv-btn:disabled{opacity:.45;cursor:default}',
        '.scv-btn:focus-visible,.scv-canvas:focus-visible{outline:2px solid var(--scv-accent);outline-offset:1px}',
        '.scv-body{position:relative;display:flex;flex:1;min-height:0}',
        '.scv-side{width:270px;flex:0 0 auto;display:flex;flex-direction:column;border-right:1px solid var(--scv-border);background:var(--scv-panel);min-height:0}',
        '.scv-tabs{display:flex;gap:2px;padding:6px 6px 0}',
        '.scv-tab{flex:1;height:26px;border:1px solid var(--scv-border);border-bottom:none;border-radius:6px 6px 0 0;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;margin:0;padding:0 4px;box-shadow:none}',
        '.scv-tab[aria-selected="true"]{background:var(--scv-bg);font-weight:600}',
        '.scv-pane{flex:1;overflow:auto;background:var(--scv-bg);border-top:1px solid var(--scv-border);padding:6px 4px;min-height:0}',
        '.scv-search{width:100%;box-sizing:border-box;margin:0 0 6px;padding:5px 7px;border:1px solid var(--scv-border);border-radius:5px;background:var(--scv-bg);color:inherit;font:inherit;font-size:12px}',
        '.scv-row{display:flex;align-items:center;gap:3px;padding:2px 4px;border-radius:4px;cursor:pointer;white-space:nowrap;font-size:12px}',
        '.scv-row:hover{background:var(--scv-panel)}',
        '.scv-row.scv-sel{background:rgba(26,110,242,.14);box-shadow:inset 3px 0 0 var(--scv-accent)}',
        '.scv-row .scv-lbl{overflow:hidden;text-overflow:ellipsis;flex:1}',
        '.scv-row .scv-pn{color:var(--scv-muted);font-family:var(--font-mono,monospace);font-size:10.5px}',
        '.scv-car,.scv-eye{flex:0 0 auto;width:18px;height:18px;padding:0;margin:0;border:none;background:transparent;color:var(--scv-muted);cursor:pointer;font-size:11px;line-height:18px;box-shadow:none}',
        '.scv-eye.scv-off{opacity:.35}',
        '.scv-swatch{display:inline-block;width:11px;height:11px;border-radius:3px;border:1px solid rgba(0,0,0,.25);flex:0 0 auto}',
        '.scv-canvas{position:relative;flex:1;min-width:0;overflow:hidden;outline:none;touch-action:none;background:linear-gradient(#eef1f6,#cfd6e2)}',
        '.scv-canvas canvas{display:block;width:100%!important;height:100%!important}',
        '.scv-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}',
        '.scv-label{position:absolute;transform:translate(-50%,-100%);padding:1px 6px;border-radius:4px;font:600 11px/1.4 var(--font-mono,monospace);color:#fff;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.25)}',
        '.scv-label.scv-measure{background:#14171c;font-family:var(--font-sans,system-ui,sans-serif);font-weight:500}',
        '.scv-secpanel{position:absolute;top:8px;right:8px;display:none;flex-direction:column;gap:4px;padding:6px 8px;border:1px solid var(--scv-border);border-radius:6px;background:var(--scv-bg);font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.12)}',
        '.scv-secpanel.scv-open{display:flex}',
        '.scv-secpanel label{display:flex;align-items:center;gap:6px}',
        '.scv-secpanel input[type=range]{width:160px}',
        '.scv-overlay{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(245,246,248,.94);text-align:center}',
        '.scv-overlay.scv-open{display:flex}',
        '.scv-overlay .scv-card{max-width:460px;font-size:13px}',
        '.scv-prog{height:6px;border-radius:3px;background:var(--scv-panel);overflow:hidden;margin:10px 0}',
        '.scv-prog>div{height:100%;width:0;background:var(--scv-accent);transition:width .2s}',
        '.scv-status{display:flex;gap:12px;align-items:center;padding:4px 10px;border-top:1px solid var(--scv-border);background:var(--scv-panel);font-size:12px;color:var(--scv-muted);min-height:24px}',
        '.scv-status .scv-hint{flex:1}',
        '.scv-empty{padding:12px;color:var(--scv-muted);font-size:12px}'
    ].join('\n');
    function injectCss() {
        if (document.getElementById('scv-css')) return;
        var st = document.createElement('style'); st.id = 'scv-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    function h(tag, attrs, html) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        if (html != null) e.innerHTML = html;
        return e;
    }

    // =================================================================== the viewer
    var _seq = 0;
    function Viewer(el, opts) {
        this.el = el; this.opts = opts || {}; this.id = ++_seq;
        this.listeners = []; this.parts = {}; this.order = []; this.sel = new Set();
        this.mode = 'orbit'; this.measure = 'off'; this.xray = false;
        this.sections = { x: { on: false, t: 0.5, flip: false }, y: { on: false, t: 0.5, flip: false }, z: { on: false, t: 0.5, flip: false } };
        this.zonesOn = false; this.volumesOn = false; this.zoneVis = {}; this.volVis = {};
        this.focusZone = null; this.focusVolume = null;
        this.keys = {}; this.labels = []; this.entry = null; this.disposed = false; this.dirty = true;
        this.expanded = {};
        this._build();
    }
    var P = Viewer.prototype;

    P._build = function () {
        injectCss();
        var self = this;
        var rootEl = this.root = h('div', { class: 'scv', 'data-scv': String(this.id) });
        if (this.opts.height) rootEl.style.height = typeof this.opts.height === 'number' ? this.opts.height + 'px' : this.opts.height;
        var bar = h('div', { class: 'scv-bar', role: 'toolbar', 'aria-label': '3D viewer tools' });
        this.$ = {};
        function btn(act, label, title) { var b = h('button', { type: 'button', class: 'scv-btn', 'data-act': act, title: title || label, 'aria-label': label }, esc(label)); bar.appendChild(b); return b; }
        function sep() { bar.appendChild(h('span', { class: 'scv-sep', 'aria-hidden': 'true' })); }
        btn('fit', 'Fit all', 'Fit everything visible in view (F)');
        var vsel = h('select', { class: 'scv-btn', 'data-act': 'view', 'aria-label': 'Standard view', title: 'Look from a standard direction' },
            '<option value="">View</option>' + Object.keys(VIEWS).map(function (k) { return '<option value="' + k + '">' + VIEWS[k].label + '</option>'; }).join(''));
        bar.appendChild(vsel);
        sep();
        this.$.orbit = btn('mode-orbit', 'Orbit', 'Drag to turn around the model, right drag or Shift drag to pan, wheel to zoom at the cursor, double click to turn around a point');
        this.$.fly = btn('mode-fly', 'Fly', 'Fly through: W A S D to move, Q / E down / up, drag to look, Shift for speed, wheel sets speed');
        this.$.walk = btn('mode-walk', 'Walk', 'Walk through at a fixed height: W A S D to move, Q / E to change height, drag to look');
        sep();
        btn('hide', 'Hide', 'Hide the selected parts (H)');
        btn('show-all', 'Show all', 'Show every part');
        btn('isolate', 'Isolate', 'Show only the selected parts (I)');
        this.$.xray = btn('xray', 'X-ray', 'See through everything except the selection (X)');
        sep();
        this.$.secx = btn('sec-x', 'Section X', 'Cut the model with a plane across X; drag the plane or use its slider');
        this.$.secy = btn('sec-y', 'Section Y', 'Cut the model with a plane across Y');
        this.$.secz = btn('sec-z', 'Section Z', 'Cut the model with a plane across Z');
        sep();
        var msel = h('select', { class: 'scv-btn', 'data-act': 'measure', 'aria-label': 'Measure', title: 'Measure the distance between two points or two parts' },
            '<option value="off">Measure</option><option value="point">Point to point</option><option value="part">Part to part</option>');
        bar.appendChild(msel); this.$.measure = msel;
        sep();
        this.$.zones = btn('zones', 'Zones', 'Show the zone volumes');
        this.$.vols = btn('volumes', 'PRA volumes', 'Show the particular risk volumes');
        sep();
        this.$.full = btn('fullscreen', 'Full screen', 'Full screen (Esc exits)');
        btn('keys', 'Keys', 'Keyboard and mouse controls');
        rootEl.appendChild(bar);

        var body = h('div', { class: 'scv-body' });
        var side = h('div', { class: 'scv-side' });
        var tabs = h('div', { class: 'scv-tabs', role: 'tablist' });
        ['parts', 'zones', 'volumes'].forEach(function (t) {
            var b = h('button', { type: 'button', class: 'scv-tab', role: 'tab', 'data-tab': t, 'aria-selected': t === 'parts' ? 'true' : 'false' }, t === 'parts' ? 'Parts' : t === 'zones' ? 'Zones' : 'PRA volumes');
            tabs.appendChild(b);
        });
        side.appendChild(tabs);
        this.$.pane = h('div', { class: 'scv-pane' });
        side.appendChild(this.$.pane);
        body.appendChild(side);
        var cv = this.$.canvas = h('div', { class: 'scv-canvas', tabindex: '0', 'aria-label': '3D model view' });
        this.$.labels = h('div', { class: 'scv-labels' }); cv.appendChild(this.$.labels);
        this.$.secpanel = h('div', { class: 'scv-secpanel' }); cv.appendChild(this.$.secpanel);
        this.$.overlay = h('div', { class: 'scv-overlay', role: 'status' }); cv.appendChild(this.$.overlay);
        body.appendChild(cv);
        rootEl.appendChild(body);
        var status = h('div', { class: 'scv-status' });
        this.$.hint = h('span', { class: 'scv-hint' }, 'No model loaded.'); status.appendChild(this.$.hint);
        this.$.selInfo = h('span', {}, ''); status.appendChild(this.$.selInfo);
        rootEl.appendChild(status);
        this.el.appendChild(rootEl);
        this.tab = 'parts';

        bar.addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (b && b.tagName === 'BUTTON') self._act(b.getAttribute('data-act')); });
        vsel.addEventListener('change', function () { if (vsel.value) self.setView(vsel.value); vsel.value = ''; });
        msel.addEventListener('change', function () { self.setMeasure(msel.value); });
        tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; self.tab = b.getAttribute('data-tab'); Array.prototype.forEach.call(tabs.children, function (x) { x.setAttribute('aria-selected', String(x === b)); }); self._renderPane(); });
        this.$.pane.addEventListener('click', function (e) { self._paneClick(e); });
        this.$.pane.addEventListener('input', function (e) { if (e.target.classList.contains('scv-search')) { self.filter = e.target.value; self._renderTreeList(); } });
        this.$.pane.addEventListener('change', function (e) { self._paneChange(e); });
        this.$.secpanel.addEventListener('input', function (e) { var ax = e.target.getAttribute('data-ax'); if (ax) { self.sections[ax].t = +e.target.value / 1000; self._applySections(); } });
        this.$.secpanel.addEventListener('click', function (e) { var ax = e.target.getAttribute('data-flip'); if (ax) { self.sections[ax].flip = !self.sections[ax].flip; self._applySections(); } });
        this._docKey = function (e) { if (self.fullscreen && e.key === 'Escape') { e.preventDefault(); self.toggleFullscreen(false); } };
        document.addEventListener('keydown', this._docKey, true);
        this._syncButtons();
        this._renderPane();
    };

    // ---------------------------------------------------------------- three setup
    P._ensure3d = function () {
        var self = this;
        if (this._3dp) return this._3dp;
        this._3dp = loadThree().then(function (T) {
            if (self.disposed) return null;
            self.T = T;
            var r;
            try { r = new T.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: !!self.opts.preserveDrawingBuffer }); }
            catch (e) { self._overlay('<div class="scv-card"><b>3D view unavailable.</b><br>This computer did not allow a WebGL view (' + esc(e && e.message || e) + ').</div>'); throw e; }
            r.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
            r.localClippingEnabled = true;
            r.setClearColor(0x000000, 0);
            self.renderer = r;
            self.$.canvas.insertBefore(r.domElement, self.$.labels);
            var scene = self.scene = new T.Scene();
            self.camera = new T.PerspectiveCamera(45, 1, 1, 1e7);
            self.camera.up.set(0, 0, 1);
            self.camera.position.set(-1000, -1000, 800);
            self.target = new T.Vector3();
            scene.add(new T.HemisphereLight(0xffffff, 0x8890a0, 1.1));
            self.light = new T.DirectionalLight(0xffffff, 1.6);
            self.camera.add(self.light); self.light.position.set(0.3, 0.6, 1);
            self.light.target.position.set(0, 0, -1); self.camera.add(self.light.target);
            scene.add(self.camera);
            self.gModel = new T.Group(); self.gZones = new T.Group(); self.gVols = new T.Group(); self.gSec = new T.Group(); self.gMeasure = new T.Group();
            self.gZones.visible = false; self.gVols.visible = false;
            [self.gModel, self.gZones, self.gVols, self.gSec, self.gMeasure].forEach(function (g) { scene.add(g); });
            self.planes = { x: new T.Plane(new T.Vector3(1, 0, 0), 0), y: new T.Plane(new T.Vector3(0, 1, 0), 0), z: new T.Plane(new T.Vector3(0, 0, 1), 0) };
            self.raycaster = new T.Raycaster();
            self._bindInput();
            self._resize();
            if (typeof ResizeObserver === 'function') { self._ro = new ResizeObserver(function () { self._resize(); }); self._ro.observe(self.$.canvas); }
            var last = performance.now();
            var loop = function (now) {
                if (self.disposed) return;
                self._raf = requestAnimationFrame(loop);
                var dt = Math.min(0.1, (now - last) / 1000); last = now;
                if (self.mode !== 'orbit' && self._moveKeys(dt)) self.dirty = true;
                if (self.dirty) { self.dirty = false; self._render(); }
            };
            self._raf = requestAnimationFrame(loop);
            return T;
        });
        return this._3dp;
    };
    P._resize = function () {
        if (!this.renderer) return;
        var w = this.$.canvas.clientWidth || 1, hh = this.$.canvas.clientHeight || 1;
        this.renderer.setSize(w, hh, false);
        this.camera.aspect = w / hh; this.camera.updateProjectionMatrix();
        this.dirty = true;
    };
    P._render = function () {
        this.renderer.render(this.scene, this.camera);
        this._updateLabels();
        this.frames = (this.frames || 0) + 1;
    };

    // ---------------------------------------------------------------- loading
    P._overlay = function (html) {
        if (html == null) { this.$.overlay.classList.remove('scv-open'); this.$.overlay.innerHTML = ''; return; }
        this.$.overlay.innerHTML = html; this.$.overlay.classList.add('scv-open');
    };
    P.loadModel = function (cadId) {
        var self = this, I = root.SLCadImport;
        var entry = I ? I.getModel(cadId) : null;
        if (!entry) { this._overlay('<div class="scv-card">No CAD model with this id in the project.</div>'); return Promise.resolve(false); }
        this.entry = entry;
        this._overlay('<div class="scv-card">Opening ' + esc(entry.fileName) + ' from this computer...</div>');
        return I.cacheGet(entry.sha256).catch(function () { return null; }).then(function (payload) {
            if (self.disposed) return false;
            if (payload && Array.isArray(payload.meshes)) return self.showModel(entry, payload.meshes);
            self._askReopen(entry);
            return false;
        });
    };
    // Geometry is not on this computer: ask for the file, verify, cache, show.
    P._askReopen = function (entry) {
        var self = this;
        this._overlay('<div class="scv-card"><b>The geometry for ' + esc(entry.fileName) + ' is not on this computer.</b><br>' +
            'CAD geometry is kept only on the computer that read the file and is never uploaded. Open the same STEP file from this computer to view it; it is checked against the project\'s fingerprint first.' +
            '<div style="margin-top:12px"><button type="button" class="scv-btn" data-reopen>Open the STEP file...</button></div><div class="scv-prog" style="display:none"><div></div></div><div data-reopen-msg style="font-size:12px;color:var(--scv-muted)"></div></div>');
        var b = this.$.overlay.querySelector('[data-reopen]');
        b.addEventListener('click', function () {
            var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.stp,.step,.p21';
            inp.onchange = function () { if (inp.files && inp.files[0]) self.reopenWith(inp.files[0], entry); };
            inp.click();
        });
    };
    P.reopenWith = function (file, entry) {
        var self = this, I = root.SLCadImport;
        var msg = this.$.overlay.querySelector('[data-reopen-msg]'), prog = this.$.overlay.querySelector('.scv-prog');
        if (prog) prog.style.display = 'block';
        var job = I.reopen(file, entry, { onProgress: function (ph, f) { if (msg) msg.textContent = ph === 'parse' ? 'Reading the geometry...' : ph === 'hash' ? 'Checking the fingerprint...' : ph === 'mesh' ? 'Building parts...' : ''; if (prog && f != null) prog.firstChild.style.width = Math.round(f * 100) + '%'; } });
        this._job = job;
        return job.promise.then(function (r) { self._job = null; return self.showModel(entry, r.model.meshes); }, function (e) {
            self._job = null;
            if (msg) { msg.style.color = 'var(--scv-bad)'; msg.textContent = e.message || String(e); }
            return false;
        });
    };
    // Build the scene from cached meshes. Chunked so a big aircraft keeps the
    // page responsive while it builds.
    P.showModel = function (entry, meshes) {
        var self = this;
        this.entry = entry;
        return this._ensure3d().then(function (T) {
            if (!T || self.disposed) return false;
            self._clearModel();
            var metaBy = {}; (entry.parts || []).forEach(function (p) { metaBy[p.pid] = p; });
            var mats = {};
            var i = 0, N = meshes.length;
            self._overlay('<div class="scv-card">Building ' + N + ' parts...<div class="scv-prog"><div></div></div></div>');
            return new Promise(function (resolve) {
                (function step() {
                    if (self.disposed) return resolve(false);
                    var t0 = performance.now();
                    while (i < N && performance.now() - t0 < 30) {
                        var m = meshes[i++]; var meta = metaBy[m.pid]; if (!meta) continue;
                        var g = new T.BufferGeometry();
                        g.setAttribute('position', new T.BufferAttribute(m.position, 3));
                        g.setIndex(new T.BufferAttribute(m.index, 1));
                        if (m.normal && m.normal.length === m.position.length) g.setAttribute('normal', new T.BufferAttribute(m.normal, 3)); else g.computeVertexNormals();
                        g.computeBoundingBox(); g.computeBoundingSphere();
                        var col = m.color ? new T.Color(m.color[0], m.color[1], m.color[2]) : new T.Color(0.75, 0.77, 0.8);
                        var mat = new T.MeshStandardMaterial({ color: col, metalness: 0.1, roughness: 0.65, side: T.DoubleSide });
                        var mesh = new T.Mesh(g, mat);
                        mesh.userData.pid = m.pid;
                        self.gModel.add(mesh);
                        self.parts[m.pid] = { meta: meta, mesh: mesh, color: col.clone(), position: m.position };
                        self.order.push(m.pid);
                    }
                    var bar = self.$.overlay.querySelector('.scv-prog>div'); if (bar) bar.style.width = Math.round(i / Math.max(1, N) * 100) + '%';
                    if (i < N) { setTimeout(step, 0); return; }
                    self._overlay(null);
                    self.tree = buildTree(self.order.map(function (pid) { return self.parts[pid].meta; }));
                    self.expanded = {}; (self.tree.root.children || []).forEach(function (c) { self.expanded[c.key] = true; });
                    self._modelBox = unionBox(self.order.map(function (pid) { return self.parts[pid].meta.bbox; })) || { min: [0, 0, 0], max: [1, 1, 1] };
                    self._sizeScene();
                    self._buildZones(); self._buildVolumes(); self._applySections();
                    self.setView('iso');
                    self._renderPane();
                    self._hint(entry.fileName + ' rev ' + entry.revision + ' · ' + self.order.length + ' parts · mm');
                    self.dirty = true;
                    resolve(true);
                })();
            });
        });
    };
    P._clearModel = function () {
        var self = this;
        [this.gModel, this.gZones, this.gVols, this.gMeasure].forEach(function (g) {
            if (!g) return;
            while (g.children.length) { var o = g.children.pop(); self._disposeObj(o); }
        });
        this.labels.forEach(function (l) { if (l.el.parentNode) l.el.parentNode.removeChild(l.el); });
        this.labels = []; this.parts = {}; this.order = []; this.sel = new Set(); this.measureState = null;
    };
    P._disposeObj = function (o) {
        o.traverse(function (x) { if (x.geometry) x.geometry.dispose(); if (x.material) { (Array.isArray(x.material) ? x.material : [x.material]).forEach(function (m) { m.dispose(); }); } });
    };
    P._sizeScene = function () {
        var b = this._modelBox, d = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) || 1;
        this.size = d;
        this.camera.near = Math.max(d * 1e-5, 0.01); this.camera.far = d * 100; this.camera.updateProjectionMatrix();
        this.flySpeed = d * 0.12;
    };

    // ---------------------------------------------------------------- camera
    P.setView = function (name) {
        if (!this.camera || !this._modelBox) return;
        var box = this._visibleBox() || this._modelBox;
        var v = standardView(name, box, this.camera.fov, this.camera.aspect);
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(v.position[0], v.position[1], v.position[2]);
        this.target.set(v.target[0], v.target[1], v.target[2]);
        this.camera.lookAt(this.target);
        if (this.mode !== 'orbit') this._setMode('orbit');
        this.dirty = true;
    };
    P._visibleBox = function () {
        var self = this;
        return unionBox(this.order.filter(function (pid) { return self.parts[pid].mesh.visible; }).map(function (pid) { return self.parts[pid].meta.bbox; }));
    };
    P.frameBox = function (box) {
        if (!box || !this.camera) return;
        var T = this.T, c = new T.Vector3((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2);
        var dir = new T.Vector3().subVectors(this.camera.position, this.target);
        if (dir.lengthSq() < 1e-12) dir.set(-1, -1, 0.8);
        dir.normalize();
        var d = Math.max(fitBoxDistance(box, [dir.x, dir.y, dir.z], this.camera.fov, this.camera.aspect), this.size * 0.004);
        this.target.copy(c);
        this.camera.position.copy(c).addScaledVector(dir, d);
        this.camera.lookAt(this.target);
        this.dirty = true;
    };
    P.fitAll = function () { this.frameBox(this._visibleBox() || this._modelBox); };
    P._orbit = function (dx, dy) {
        var T = this.T, cam = this.camera, off = new T.Vector3().subVectors(cam.position, this.target);
        var up = new T.Vector3(0, 0, 1);
        off.applyAxisAngle(up, -dx * 0.008);
        var right = new T.Vector3().crossVectors(off, up).normalize();
        var cand = off.clone().applyAxisAngle(right, -dy * 0.008);
        var ang = cand.angleTo(up);
        if (ang > 0.02 && ang < Math.PI - 0.02) off = cand;
        cam.position.copy(this.target).add(off);
        cam.lookAt(this.target);
    };
    P._pan = function (dx, dy) {
        var T = this.T, cam = this.camera;
        var dist = cam.position.distanceTo(this.target);
        var k = 2 * dist * Math.tan(cam.fov * Math.PI / 360) / (this.$.canvas.clientHeight || 1);
        var right = new T.Vector3().setFromMatrixColumn(cam.matrix, 0), upv = new T.Vector3().setFromMatrixColumn(cam.matrix, 1);
        var mv = right.multiplyScalar(-dx * k).add(upv.multiplyScalar(dy * k));
        cam.position.add(mv); this.target.add(mv);
    };
    P._look = function (dx, dy) {
        var T = this.T, cam = this.camera;
        var dir = new T.Vector3(); cam.getWorldDirection(dir);
        var up = new T.Vector3(0, 0, 1);
        dir.applyAxisAngle(up, -dx * 0.004);
        var right = new T.Vector3().crossVectors(dir, up).normalize();
        var cand = dir.clone().applyAxisAngle(right, -dy * 0.004);
        var ang = cand.angleTo(up); if (ang > 0.05 && ang < Math.PI - 0.05) dir = cand;
        var dist = Math.max(this.size * 0.01, cam.position.distanceTo(this.target));
        this.target.copy(cam.position).addScaledVector(dir, dist);
        cam.lookAt(this.target);
    };
    P._zoomAt = function (clientX, clientY, deltaY) {
        var T = this.T, cam = this.camera;
        var hit = this._pick(clientX, clientY);
        var p = hit ? hit.point : this.target.clone();
        var f = Math.pow(1.0015, deltaY);
        var nd = cam.position.distanceTo(p) * f;
        if (nd < this.size * 1e-4 && f < 1) return;
        var dir = new T.Vector3().subVectors(cam.position, p);
        cam.position.copy(p).addScaledVector(dir, f);
        this.target.sub(p).multiplyScalar(f).add(p);
        cam.lookAt(this.target);
    };
    P._moveKeys = function (dt) {
        var k = this.keys, T = this.T, cam = this.camera;
        var f = (k.w ? 1 : 0) - (k.s ? 1 : 0), s = (k.d ? 1 : 0) - (k.a ? 1 : 0), u = (k.e ? 1 : 0) - (k.q ? 1 : 0);
        if (!f && !s && !u) return false;
        var sp = this.flySpeed * (k.shift ? 4 : 1) * dt;
        var dir = new T.Vector3(); cam.getWorldDirection(dir);
        if (this.mode === 'walk') { dir.z = 0; if (dir.lengthSq() < 1e-9) dir.set(1, 0, 0); dir.normalize(); }
        var right = new T.Vector3().crossVectors(dir, new T.Vector3(0, 0, 1)).normalize();
        var mv = new T.Vector3().addScaledVector(dir, f * sp).addScaledVector(right, s * sp).add(new T.Vector3(0, 0, u * sp));
        cam.position.add(mv); this.target.add(mv);
        cam.lookAt(this.target);
        return true;
    };
    P._setMode = function (m) {
        this.mode = m;
        if (m === 'walk' && this.camera && this._modelBox) {
            // Walk at the model's mid-height, looking level.
            var T = this.T, dir = new T.Vector3(); this.camera.getWorldDirection(dir); dir.z = 0; if (dir.lengthSq() < 1e-9) dir.set(1, 0, 0); dir.normalize();
            var dist = Math.max(this.size * 0.01, this.camera.position.distanceTo(this.target));
            this.target.copy(this.camera.position).addScaledVector(dir, dist);
            this.camera.lookAt(this.target);
        }
        this._syncButtons();
        this._hint(m === 'orbit' ? 'Orbit: drag to turn, right drag to pan, wheel to zoom at the cursor.' : m === 'fly' ? 'Fly: W A S D to move, Q / E down and up, drag to look, Shift for speed, wheel sets speed.' : 'Walk: W A S D to move at this height, Q / E to change height, drag to look.');
        this.dirty = true;
    };

    // ---------------------------------------------------------------- input
    P._ndc = function (cx, cy) {
        var r = this.renderer.domElement.getBoundingClientRect();
        return new this.T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    };
    P._clipOk = function (pt) {
        var self = this;
        return ['x', 'y', 'z'].every(function (a) { return !self.sections[a].on || self.planes[a].distanceToPoint(pt) >= -1e-6; });
    };
    P._pick = function (cx, cy) {
        if (!this.raycaster) return null;
        this.raycaster.setFromCamera(this._ndc(cx, cy), this.camera);
        var self = this;
        var objs = this.gModel.children.filter(function (m) { return m.visible; });
        var hits = this.raycaster.intersectObjects(objs, false);
        for (var i = 0; i < hits.length; i++) {
            var m = hits[i].object;
            if (this.xray && !this.sel.has(m.userData.pid) && this.sel.size) continue;
            if (self._clipOk(hits[i].point)) return { pid: m.userData.pid, point: hits[i].point.clone() };
        }
        return null;
    };
    P._pickSection = function (cx, cy) {
        if (!this.raycaster) return null;
        this.raycaster.setFromCamera(this._ndc(cx, cy), this.camera);
        var hits = this.raycaster.intersectObjects(this.gSec.children.filter(function (m) { return m.visible; }), false);
        return hits.length ? hits[0].object.userData.axis : null;
    };
    P._bindInput = function () {
        var self = this, cv = this.$.canvas, el = this.renderer.domElement;
        var drag = null;
        el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        el.addEventListener('pointerdown', function (e) {
            cv.focus({ preventScroll: true });
            var secAx = self._pickSection(e.clientX, e.clientY);
            drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, shift: e.shiftKey, moved: false, sec: secAx };
            try { el.setPointerCapture(e.pointerId); } catch (_) {}
        });
        el.addEventListener('pointermove', function (e) {
            if (!drag) return;
            var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            drag.x = e.clientX; drag.y = e.clientY;
            if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.moved = true;
            if (!drag.moved) return;
            if (drag.sec) self._dragSection(drag.sec, e.clientX, e.clientY);
            else if (self.mode !== 'orbit') self._look(dx, dy);
            else if (drag.button === 2 || drag.button === 1 || drag.shift) self._pan(dx, dy);
            else self._orbit(dx, dy);
            self.dirty = true;
        });
        el.addEventListener('pointerup', function (e) {
            if (!drag) return;
            var d = drag; drag = null;
            try { el.releasePointerCapture(e.pointerId); } catch (_) {}
            if (!d.moved && d.button === 0) self._click(e.clientX, e.clientY, e.ctrlKey || e.metaKey || e.shiftKey);
        });
        el.addEventListener('dblclick', function (e) {
            if (self.mode !== 'orbit') return;
            var hit = self._pick(e.clientX, e.clientY); if (!hit) return;
            self.target.copy(hit.point); self.camera.lookAt(self.target); self.dirty = true;
        });
        el.addEventListener('wheel', function (e) {
            e.preventDefault();
            if (self.mode !== 'orbit') { self.flySpeed *= e.deltaY < 0 ? 1.2 : 1 / 1.2; self._hint('Speed ' + fmtMm(self.flySpeed) + ' per second.'); return; }
            self._zoomAt(e.clientX, e.clientY, e.deltaY); self.dirty = true;
        }, { passive: false });
        cv.addEventListener('keydown', function (e) {
            var k = e.key.toLowerCase();
            if (e.shiftKey) self.keys.shift = true;
            if (self.mode !== 'orbit' && 'wasdqe'.indexOf(k) >= 0 && k.length === 1) { self.keys[k] = true; e.preventDefault(); return; }
            if (k === 'f') { self.fitAll(); e.preventDefault(); }
            else if (k === 'h') { self.hideSelected(); e.preventDefault(); }
            else if (k === 'i') { self.isolate(); e.preventDefault(); }
            else if (k === 'x') { self.setXray(!self.xray); e.preventDefault(); }
            else if (k === 'escape') { if (self.measure !== 'off') self.setMeasure('off'); else if (self.mode !== 'orbit') self._setMode('orbit'); else self.select([]); }
        });
        cv.addEventListener('keyup', function (e) { var k = e.key.toLowerCase(); delete self.keys[k]; if (!e.shiftKey) delete self.keys.shift; });
        cv.addEventListener('blur', function () { self.keys = {}; });
    };
    P._click = function (cx, cy, additive) {
        var hit = this._pick(cx, cy);
        if (this.measure !== 'off') { this._measureClick(hit); return; }
        if (!hit) { if (!additive) this.select([], true); return; }
        if (additive) { var s = new Set(this.sel); if (s.has(hit.pid)) s.delete(hit.pid); else s.add(hit.pid); this.select(Array.from(s), true); }
        else this.select([hit.pid], true);
        this._reveal(hit.pid);
    };

    // ---------------------------------------------------------------- selection + visibility
    P._paint = function () {
        var self = this, anySel = this.sel.size > 0;
        var tint = this._zoneTint || {};
        this.order.forEach(function (pid) {
            var p = self.parts[pid], m = p.mesh.material, on = self.sel.has(pid);
            m.color.copy(tint[pid] ? new self.T.Color(tint[pid]) : p.color);
            m.emissive.set(on ? 0x1a6ef2 : 0x000000); m.emissiveIntensity = on ? 0.55 : 0;
            var ghost = self.xray && !(on || (!anySel && tint[pid]));
            m.transparent = ghost; m.opacity = ghost ? 0.12 : 1; m.depthWrite = !ghost;
            m.needsUpdate = true;
        });
        this.dirty = true;
    };
    P.select = function (pids, fromUser) {
        var self = this;
        this.sel = new Set((pids || []).filter(function (p) { return self.parts[p]; }));
        if (this.T) this._paint();
        this._renderPane();
        var parts = Array.from(this.sel).map(function (p) { return self.parts[p].meta; });
        this.$.selInfo.textContent = parts.length === 1 ? (parts[0].name + (parts[0].designator ? ' · ' + parts[0].designator : '') + (parts[0].partNumber ? ' · ' + parts[0].partNumber : '')) : parts.length ? parts.length + ' parts selected' : '';
        if (fromUser) this._emit();
    };
    P._emit = function () {
        var self = this, ev = { cadId: this.entry && this.entry.id, pids: Array.from(this.sel), parts: Array.from(this.sel).map(function (p) { return self.parts[p].meta; }) };
        this.listeners.slice().forEach(function (cb) { try { cb(ev); } catch (_) {} });
    };
    P.onSelect = function (cb) { var self = this; if (typeof cb !== 'function') return function () {}; this.listeners.push(cb); return function () { self.listeners = self.listeners.filter(function (x) { return x !== cb; }); }; };
    P.setVisible = function (pids, on) { var self = this; pids.forEach(function (p) { if (self.parts[p]) self.parts[p].mesh.visible = on; }); this.dirty = true; this._renderPane(); };
    P.hideSelected = function () { this.setVisible(Array.from(this.sel), false); };
    P.showAll = function () { this.setVisible(this.order, true); };
    P.isolate = function () {
        if (!this.sel.size) { this._hint('Select one or more parts first.'); return; }
        var self = this; this.order.forEach(function (p) { self.parts[p].mesh.visible = self.sel.has(p); }); this.dirty = true; this._renderPane(); this.fitAll();
    };
    P.setXray = function (on) { this.xray = !!on; this._paint(); this._syncButtons(); };
    P.highlightParts = function (pids) {
        var self = this, list = (pids || []).filter(function (p) { return self.parts[p]; });
        list.forEach(function (p) { self.parts[p].mesh.visible = true; });
        this.select(list, false);
        if (list.length) { this._reveal(list[0]); this.frameBox(unionBox(list.map(function (p) { return self.parts[p].meta.bbox; }))); }
        return list.length;
    };

    // ---------------------------------------------------------------- sections
    P.toggleSection = function (ax, on) {
        var s = this.sections[ax]; s.on = on == null ? !s.on : !!on;
        this._applySections(); this._syncButtons();
    };
    P._applySections = function () {
        var self = this, T = this.T, b = this._modelBox;
        var any = ['x', 'y', 'z'].some(function (a) { return self.sections[a].on; });
        this.$.secpanel.classList.toggle('scv-open', any);
        this.$.secpanel.innerHTML = ['x', 'y', 'z'].filter(function (a) { return self.sections[a].on; }).map(function (a) {
            var s = self.sections[a], j = 'xyz'.indexOf(a), v = b ? b.min[j] + (b.max[j] - b.min[j]) * s.t : 0;
            return '<label>' + a.toUpperCase() + ' <input type="range" min="0" max="1000" value="' + Math.round(s.t * 1000) + '" data-ax="' + a + '" aria-label="Section ' + a.toUpperCase() + ' position"> <span style="min-width:72px;font-variant-numeric:tabular-nums">' + fmtMm(v) + '</span> <button type="button" class="scv-btn" data-flip="' + a + '" title="Keep the other side">Flip</button></label>';
        }).join('');
        if (!T || !b) return;
        var active = [];
        ['x', 'y', 'z'].forEach(function (a) {
            var s = self.sections[a], j = 'xyz'.indexOf(a), pl = self.planes[a];
            var pos = b.min[j] + (b.max[j] - b.min[j]) * s.t;
            var n = [0, 0, 0]; n[j] = s.flip ? 1 : -1;
            pl.normal.set(n[0], n[1], n[2]); pl.constant = s.flip ? -pos : pos;
            if (s.on) active.push(pl);
        });
        this.order.forEach(function (p) { var m = self.parts[p].mesh.material; m.clippingPlanes = active.length ? active : null; m.needsUpdate = true; });
        // The draggable plane handles.
        while (this.gSec.children.length) this._disposeObj(this.gSec.children.pop());
        ['x', 'y', 'z'].forEach(function (a) {
            if (!self.sections[a].on) return;
            var j = 'xyz'.indexOf(a), pad = 0.08;
            var ext = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
            var u = (j + 1) % 3, v = (j + 2) % 3;
            var g = new T.PlaneGeometry(ext[u] * (1 + pad) || 1, ext[v] * (1 + pad) || 1);
            var mat = new T.MeshBasicMaterial({ color: 0x1a6ef2, transparent: true, opacity: 0.08, side: T.DoubleSide, depthWrite: false });
            var q = new T.Mesh(g, mat); q.userData.axis = a;
            var c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
            c[j] = b.min[j] + ext[j] * self.sections[a].t;
            q.position.set(c[0], c[1], c[2]);
            if (a === 'x') q.rotation.set(Math.PI / 2, Math.PI / 2, 0); else if (a === 'y') q.rotation.set(Math.PI / 2, 0, 0);
            if (a === 'x') q.geometry = new T.PlaneGeometry(ext[1] * (1 + pad) || 1, ext[2] * (1 + pad) || 1);
            if (a === 'y') q.geometry = new T.PlaneGeometry(ext[0] * (1 + pad) || 1, ext[2] * (1 + pad) || 1);
            if (a === 'z') q.geometry = new T.PlaneGeometry(ext[0] * (1 + pad) || 1, ext[1] * (1 + pad) || 1);
            g.dispose();
            var edge = new T.LineSegments(new T.EdgesGeometry(q.geometry), new T.LineBasicMaterial({ color: 0x1a6ef2 }));
            q.add(edge);
            self.gSec.add(q);
        });
        this.dirty = true;
    };
    // Drag a plane: the point on its axis nearest the mouse ray.
    P._dragSection = function (ax, cx, cy) {
        var T = this.T, b = this._modelBox, j = 'xyz'.indexOf(ax);
        this.raycaster.setFromCamera(this._ndc(cx, cy), this.camera);
        var ray = this.raycaster.ray;
        var c = new T.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
        var d = new T.Vector3(); d.setComponent(j, 1);
        var w0 = new T.Vector3().subVectors(c, ray.origin);
        var a = 1, bb = d.dot(ray.direction), cc = ray.direction.dot(ray.direction), dd = d.dot(w0), ee = ray.direction.dot(w0);
        var den = a * cc - bb * bb; if (Math.abs(den) < 1e-9) return;
        var s = (bb * ee - cc * dd) / den;
        var coord = c.getComponent(j) + s, ext = b.max[j] - b.min[j] || 1;
        this.sections[ax].t = Math.max(0, Math.min(1, (coord - b.min[j]) / ext));
        this._applySections();
    };

    // ---------------------------------------------------------------- measure
    P.setMeasure = function (m) {
        this.measure = m || 'off'; this.measureState = null;
        if (this.measure === 'off') this._clearMeasure();
        if (this.$.measure.value !== this.measure) this.$.measure.value = this.measure;
        this._hint(this.measure === 'point' ? 'Measure: click two points on the model.' : this.measure === 'part' ? 'Measure: click two parts.' : 'Measure off.');
    };
    P._clearMeasure = function () {
        var self = this;
        while (this.gMeasure && this.gMeasure.children.length) this._disposeObj(this.gMeasure.children.pop());
        this.labels = this.labels.filter(function (l) { if (l.kind === 'measure') { if (l.el.parentNode) l.el.parentNode.removeChild(l.el); return false; } return true; });
        self.dirty = true;
    };
    P._measureClick = function (hit) {
        if (!hit) return;
        var st = this.measureState;
        if (!st) { this._clearMeasure(); this.measureState = { first: hit }; this._marker(hit.point); this._hint(this.measure === 'part' ? 'First part: ' + this.parts[hit.pid].meta.name + '. Click the second part.' : 'Click the second point.'); return; }
        this.measureState = null;
        var a, b, text;
        if (this.measure === 'part') {
            var r = closestVertexPair(this.parts[st.first.pid].position, this.parts[hit.pid].position);
            if (!r) return;
            a = new this.T.Vector3(r.a[0], r.a[1], r.a[2]); b = new this.T.Vector3(r.b[0], r.b[1], r.b[2]);
            text = 'Closest ' + fmtMm(r.distance) + ' (to mesh resolution)';
            var ca = this.parts[st.first.pid].meta.centroid, cb = this.parts[hit.pid].meta.centroid;
            this._hint(this.parts[st.first.pid].meta.name + ' to ' + this.parts[hit.pid].meta.name + ': closest ' + fmtMm(r.distance) + ', centroids ' + fmtMm(Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2])) + ' apart.');
        } else {
            a = st.first.point; b = hit.point;
            var dd = b.clone().sub(a);
            text = fmtMm(dd.length());
            this._hint('Distance ' + fmtMm(dd.length()) + ' (dX ' + fmtMm(dd.x) + ', dY ' + fmtMm(dd.y) + ', dZ ' + fmtMm(dd.z) + ').');
        }
        this._clearMeasure();
        this._marker(a); this._marker(b);
        var T = this.T;
        var line = new T.Line(new T.BufferGeometry().setFromPoints([a, b]), new T.LineBasicMaterial({ color: 0x14171c, depthTest: false }));
        line.renderOrder = 10; this.gMeasure.add(line);
        this._label(a.clone().add(b).multiplyScalar(0.5), text, null, 'measure');
        this.lastMeasure = { text: text, distance: a.distanceTo(b) };
        this.dirty = true;
    };
    P._marker = function (p) {
        var T = this.T, s = new T.Mesh(new T.SphereGeometry(this.size * 0.004, 12, 8), new T.MeshBasicMaterial({ color: 0x14171c, depthTest: false }));
        s.position.copy(p); s.renderOrder = 11; this.gMeasure.add(s); this.dirty = true;
    };

    // ---------------------------------------------------------------- labels
    P._label = function (pos, text, color, kind, key) {
        var el = h('div', { class: 'scv-label' + (kind === 'measure' ? ' scv-measure' : '') }, esc(text));
        if (color) el.style.background = color;
        this.$.labels.appendChild(el);
        var l = { el: el, pos: pos, kind: kind, key: key }; this.labels.push(l); return l;
    };
    P._updateLabels = function () {
        if (!this.labels.length) return;
        var w = this.$.canvas.clientWidth, hh = this.$.canvas.clientHeight, cam = this.camera, v = new this.T.Vector3();
        var self = this;
        this.labels.forEach(function (l) {
            var show = l.kind === 'measure' || (l.kind === 'zone' && self.gZones.visible && self.zoneVis[l.key] !== false) || (l.kind === 'vol' && self.gVols.visible && self.volVis[l.key] !== false);
            if (show) { v.copy(l.pos).project(cam); show = v.z > -1 && v.z < 1; }
            l.el.style.display = show ? 'block' : 'none';
            if (show) { l.el.style.left = ((v.x + 1) / 2 * w) + 'px'; l.el.style.top = ((1 - v.y) / 2 * hh) + 'px'; }
        });
    };

    // ---------------------------------------------------------------- zones + PRA volumes
    P._zones = function () { var z = _pc().zones; return Array.isArray(z) ? z : []; };
    P._vols = function () { var v = _pc().praVolumes; return Array.isArray(v) ? v : []; };
    P._dropLabels = function (kind) { this.labels = this.labels.filter(function (l) { if (l.kind === kind) { if (l.el.parentNode) l.el.parentNode.removeChild(l.el); return false; } return true; }); };
    P._buildZones = function () {
        var self = this, T = this.T; if (!T) return;
        while (this.gZones.children.length) this._disposeObj(this.gZones.children.pop());
        this._dropLabels('zone');
        this.zoneObjs = {}; this._zoneTint = {};
        var cadId = this.entry && this.entry.id;
        this._zones().forEach(function (z) {
            if (!z || !z.volume) return;
            var col = zoneColor(z.code || z.id), vol = z.volume, on = self.zoneVis[z.id] !== false;
            var focus = self.focusZone === z.id, dim = self.focusZone && !focus;
            if (vol.kind === 'box' && _n3(vol.min) && _n3(vol.max)) {
                var mn = vol.min, mx = vol.max;
                var g = new T.BoxGeometry(Math.abs(mx[0] - mn[0]) || 1, Math.abs(mx[1] - mn[1]) || 1, Math.abs(mx[2] - mn[2]) || 1);
                var mesh = new T.Mesh(g, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: focus ? 0.32 : dim ? 0.05 : 0.16, depthWrite: false, depthTest: false, side: T.DoubleSide }));
                mesh.renderOrder = 5;
                mesh.position.set((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
                var edges = new T.LineSegments(new T.EdgesGeometry(g), new T.LineBasicMaterial({ color: col, transparent: true, opacity: dim ? 0.3 : 1, depthTest: false }));
                edges.renderOrder = 6; mesh.add(edges);
                mesh.visible = on; mesh.userData.zoneId = z.id;
                self.gZones.add(mesh);
                self.zoneObjs[z.id] = { box: { min: mn.slice(), max: mx.slice() } };
                self._label(new T.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, Math.max(mn[2], mx[2])), z.code || z.id, col, 'zone', z.id);
            } else if (vol.kind === 'parts' && Array.isArray(vol.pids) && (!vol.cadId || vol.cadId === cadId)) {
                var pids = vol.pids.filter(function (p) { return self.parts[p]; });
                if (self.gZones.visible && on && !dim) pids.forEach(function (p) { self._zoneTint[p] = col; });
                var bx = unionBox(pids.map(function (p) { return self.parts[p].meta.bbox; }));
                self.zoneObjs[z.id] = { box: bx, pids: pids };
                if (bx) self._label(new T.Vector3((bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2, bx.max[2]), z.code || z.id, col, 'zone', z.id);
            }
        });
        this._paint();
    };
    P._buildVolumes = function () {
        var self = this, T = this.T; if (!T) return;
        while (this.gVols.children.length) this._disposeObj(this.gVols.children.pop());
        this._dropLabels('vol');
        this.volObjs = {};
        this._vols().forEach(function (v) {
            if (!v || !v.id) return;
            var sp = volumeSpec(v.shape, { reach: self.size }); if (!sp.ok) return;
            var focus = self.focusVolume === v.id, dim = self.focusVolume && !focus;
            var col = '#d9480f', g, mesh;
            if (sp.type === 'sphere') { g = new T.SphereGeometry(sp.radius, 32, 16); }
            else if (sp.type === 'box') { g = new T.BoxGeometry(sp.max[0] - sp.min[0] || 1, sp.max[1] - sp.min[1] || 1, sp.max[2] - sp.min[2] || 1); }
            else { g = new T.LatheGeometry(sp.points.map(function (p) { return new T.Vector2(p[0], p[1]); }), 48, sp.phiStart || 0, sp.phiLength || Math.PI * 2); }
            mesh = new T.Mesh(g, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: focus ? 0.3 : dim ? 0.05 : 0.15, depthWrite: false, depthTest: false, side: T.DoubleSide }));
            mesh.renderOrder = 5;
            var vedges = new T.LineSegments(new T.EdgesGeometry(g, 20), new T.LineBasicMaterial({ color: col, transparent: true, opacity: dim ? 0.3 : 1, depthTest: false }));
            vedges.renderOrder = 6; mesh.add(vedges);
            if (sp.type === 'sphere') mesh.position.set(sp.center[0], sp.center[1], sp.center[2]);
            else if (sp.type === 'box') mesh.position.set((sp.min[0] + sp.max[0]) / 2, (sp.min[1] + sp.max[1]) / 2, (sp.min[2] + sp.max[2]) / 2);
            else {
                mesh.position.set(sp.origin[0], sp.origin[1], sp.origin[2]);
                if (sp.basis) mesh.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3().fromArray(sp.basis.x), new T.Vector3().fromArray(sp.basis.y), new T.Vector3().fromArray(sp.basis.z)));
                else mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(sp.axis[0], sp.axis[1], sp.axis[2]));
            }
            mesh.visible = self.volVis[v.id] !== false; mesh.userData.volumeId = v.id;
            self.gVols.add(mesh);
            mesh.updateMatrixWorld(true);
            var bb = new T.Box3().setFromObject(mesh);
            self.volObjs[v.id] = { box: { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] } };
            self._label(new T.Vector3(sp.anchor[0], sp.anchor[1], sp.anchor[2]), v.label || v.id, col, 'vol', v.id);
        });
        this.dirty = true;
    };
    P.setZonesOn = function (on) { this.zonesOn = !!on; if (this.gZones) { this.gZones.visible = this.zonesOn; this._buildZones(); } this._syncButtons(); this.dirty = true; };
    P.setVolumesOn = function (on) { this.volumesOn = !!on; if (this.gVols) this.gVols.visible = this.volumesOn; this._syncButtons(); this.dirty = true; };
    P.refreshOverlays = function () { if (this.T && this.order.length) { this._buildZones(); this._buildVolumes(); } this._renderPane(); };
    P.highlightZone = function (zoneId) {
        var z = this._zones().find(function (x) { return x && x.id === zoneId; });
        if (!z) return false;
        this.focusZone = zoneId; this.zoneVis[zoneId] = true;
        this.setZonesOn(true);
        var o = this.zoneObjs && this.zoneObjs[zoneId];
        if (o && o.pids) this.select(o.pids, false);
        if (o && o.box) this.frameBox(o.box);
        if (this.tab === 'zones') this._renderPane();
        return !!o;
    };
    P.highlightVolume = function (id) {
        var v = this._vols().find(function (x) { return x && x.id === id; });
        if (!v) return false;
        this.focusVolume = id; this.volVis[id] = true;
        if (this.T) this._buildVolumes();
        this.setVolumesOn(true);
        var o = this.volObjs && this.volObjs[id];
        if (o && o.box) this.frameBox(o.box);
        if (this.tab === 'volumes') this._renderPane();
        return !!o;
    };

    // ---------------------------------------------------------------- side panel
    P._renderPane = function () {
        var pane = this.$.pane; if (!pane) return;
        var self = this;
        if (this.tab === 'parts') {
            if (!this.tree) { pane.innerHTML = '<div class="scv-empty">No model loaded.</div>'; return; }
            if (!pane.querySelector('.scv-search')) pane.innerHTML = '<input type="search" class="scv-search" placeholder="Find a part by name, number or designator" aria-label="Find a part"><div class="scv-tree" role="tree"></div>';
            this._renderTreeList();
        } else if (this.tab === 'zones') {
            var zs = this._zones();
            if (!zs.length) { pane.innerHTML = '<div class="scv-empty">No zones in this project. Import a zone list or build zones on the Zonal Model tab.</div>'; return; }
            pane.innerHTML = '<label class="scv-row"><input type="checkbox" data-zones-all' + (this.zonesOn ? ' checked' : '') + '> <b>Show zones</b></label>' + zs.map(function (z) {
                var has = z && z.volume, col = zoneColor(z.code || z.id);
                return '<div class="scv-row' + (self.focusZone === z.id ? ' scv-sel' : '') + '" data-zone="' + esc(z.id) + '"' + (has ? '' : ' style="opacity:.55"') + '>' +
                    (has ? '<input type="checkbox" data-zone-vis="' + esc(z.id) + '"' + (self.zoneVis[z.id] !== false ? ' checked' : '') + ' aria-label="Show zone ' + esc(z.code) + '">' : '<span style="width:13px"></span>') +
                    '<span class="scv-swatch" style="background:' + col + '"></span><span class="scv-lbl"><b>' + esc(z.code || '') + '</b> ' + esc(z.name || '') + (has ? '' : ' (no volume)') + '</span></div>';
            }).join('');
        } else {
            var vs = this._vols();
            if (!vs.length) { pane.innerHTML = '<div class="scv-empty">No particular risk volumes in this project.</div>'; return; }
            pane.innerHTML = '<label class="scv-row"><input type="checkbox" data-vols-all' + (this.volumesOn ? ' checked' : '') + '> <b>Show PRA volumes</b></label>' + vs.map(function (v) {
                var ok = volumeSpec(v && v.shape, { reach: self.size || 1 }).ok;
                return '<div class="scv-row' + (self.focusVolume === v.id ? ' scv-sel' : '') + '" data-vol="' + esc(v.id) + '"' + (ok ? '' : ' style="opacity:.55"') + '>' +
                    (ok ? '<input type="checkbox" data-vol-vis="' + esc(v.id) + '"' + (self.volVis[v.id] !== false ? ' checked' : '') + '>' : '<span style="width:13px"></span>') +
                    '<span class="scv-lbl">' + esc(v.label || v.id) + ' <span class="scv-pn">' + esc(v.shape && v.shape.kind || '') + (ok ? (_unbounded(v.shape) ? ', no reach given: drawn to the model size' : '') : ', incomplete shape') + '</span></span></div>';
            }).join('');
        }
    };
    P._renderTreeList = function () {
        var host = this.$.pane.querySelector('.scv-tree'); if (!host || !this.tree) return;
        var self = this, rows = [], q = String(this.filter || '').trim().toLowerCase();
        function eyeOn(n) { return n.pids.some(function (p) { return self.parts[p] && self.parts[p].mesh.visible; }); }
        function row(n, depth) {
            var isLeaf = !!n.pid, open = !!self.expanded[n.key];
            var sel = isLeaf ? self.sel.has(n.pid) : (n.pids.length && n.pids.every(function (p) { return self.sel.has(p); }));
            rows.push('<div class="scv-row' + (sel ? ' scv-sel' : '') + '" role="treeitem" data-key="' + esc(n.key) + '"' + (isLeaf ? ' data-pid="' + esc(n.pid) + '"' : ' aria-expanded="' + open + '"') + ' style="padding-left:' + (4 + depth * 14) + 'px">' +
                (isLeaf ? '<span style="width:18px"></span>' : '<button type="button" class="scv-car" data-car="' + esc(n.key) + '" aria-label="' + (open ? 'Collapse' : 'Expand') + '">' + (open ? '&#9662;' : '&#9656;') + '</button>') +
                '<button type="button" class="scv-eye' + (eyeOn(n) ? '' : ' scv-off') + '" data-eye="' + esc(n.key) + '" title="Show or hide" aria-label="Show or hide">&#9673;</button>' +
                '<span class="scv-lbl">' + esc(n.label) + '</span>' + (n.partNumber ? '<span class="scv-pn">' + esc(n.partNumber) + '</span>' : '') + '</div>');
            if (!isLeaf && open) n.children.forEach(function (c) { row(c, depth + 1); });
        }
        if (q) {
            var hits = this.order.map(function (p) { return self.parts[p].meta; }).filter(function (m) { return (m.name + ' ' + (m.partNumber || '') + ' ' + (m.designator || '')).toLowerCase().indexOf(q) >= 0; });
            hits.slice(0, 500).forEach(function (m) { row({ key: 'pid:' + m.pid, label: m.name + (m.designator ? ' (' + m.designator + ')' : ''), pid: m.pid, partNumber: m.partNumber, pids: [m.pid], children: [] }, 0); });
            if (!hits.length) rows.push('<div class="scv-empty">No part matches.</div>');
            if (hits.length > 500) rows.push('<div class="scv-empty">' + (hits.length - 500) + ' more; narrow the search.</div>');
        } else this.tree.root.children.forEach(function (c) { row(c, 0); });
        host.innerHTML = rows.join('');
    };
    P._nodeByKey = function (key) {
        if (!this.tree) return null;
        if (key.indexOf('pid:') === 0) { var pid = key.slice(4); return this.parts[pid] ? { pid: pid, pids: [pid] } : null; }
        return this.tree.byKey[key] || null;
    };
    P._paneClick = function (e) {
        var t = e.target, self = this;
        var car = t.closest('[data-car]'); if (car) { var k = car.getAttribute('data-car'); this.expanded[k] = !this.expanded[k]; this._renderTreeList(); return; }
        var eye = t.closest('[data-eye]'); if (eye) { var n = this._nodeByKey(eye.getAttribute('data-eye')); if (n) { var on = !n.pids.some(function (p) { return self.parts[p].mesh.visible; }); this.setVisible(n.pids, on); } return; }
        if (t.matches('input')) return;
        var r = t.closest('[data-key]');
        if (r) { var nn = this._nodeByKey(r.getAttribute('data-key')); if (!nn) return; this.select(nn.pids, true); this.setVisible(nn.pids.filter(function (p) { return !self.parts[p].mesh.visible; }), true); this.frameBox(unionBox(nn.pids.map(function (p) { return self.parts[p].meta.bbox; }))); return; }
        var zr = t.closest('[data-zone]'); if (zr) { this.highlightZone(zr.getAttribute('data-zone')); this._emitZone(zr.getAttribute('data-zone')); return; }
        var vr = t.closest('[data-vol]'); if (vr) { this.highlightVolume(vr.getAttribute('data-vol')); this._emitVol(vr.getAttribute('data-vol')); }
    };
    P._emitZone = function (id) { var cb = this.opts.onZone; if (typeof cb === 'function') { try { cb(id); } catch (_) {} } };
    P._emitVol = function (id) { var cb = this.opts.onVolume; if (typeof cb === 'function') { try { cb(id); } catch (_) {} } };
    P._paneChange = function (e) {
        var t = e.target;
        if (t.hasAttribute('data-zones-all')) { this.setZonesOn(t.checked); return; }
        if (t.hasAttribute('data-vols-all')) { this.setVolumesOn(t.checked); return; }
        var zid = t.getAttribute('data-zone-vis'); if (zid) { this.zoneVis[zid] = t.checked; if (!this.zonesOn && t.checked) this.setZonesOn(true); else if (this.T) this._buildZones(); return; }
        var vid = t.getAttribute('data-vol-vis'); if (vid) { this.volVis[vid] = t.checked; if (!this.volumesOn && t.checked) this.setVolumesOn(true); if (this.T) this._buildVolumes(); }
    };
    P._reveal = function (pid) {
        var self = this;
        ancestorsOf(pid, this.order.map(function (p) { return self.parts[p].meta; })).forEach(function (k) { self.expanded[k] = true; });
        if (this.tab !== 'parts') { this.tab = 'parts'; Array.prototype.forEach.call(this.root.querySelectorAll('.scv-tab'), function (x) { x.setAttribute('aria-selected', String(x.getAttribute('data-tab') === 'parts')); }); this.$.pane.innerHTML = ''; this._renderPane(); }
        else this._renderTreeList();
        var rowEl = this.$.pane.querySelector('[data-pid="' + (root.CSS && root.CSS.escape ? root.CSS.escape(pid) : pid.replace(/"/g, '\\"')) + '"]');
        if (rowEl && rowEl.scrollIntoView) rowEl.scrollIntoView({ block: 'nearest' });
    };

    // ---------------------------------------------------------------- toolbar
    P._act = function (a) {
        switch (a) {
            case 'fit': this.fitAll(); break;
            case 'mode-orbit': this._setMode('orbit'); break;
            case 'mode-fly': this._setMode('fly'); break;
            case 'mode-walk': this._setMode('walk'); break;
            case 'hide': this.hideSelected(); break;
            case 'show-all': this.showAll(); break;
            case 'isolate': this.isolate(); break;
            case 'xray': this.setXray(!this.xray); break;
            case 'sec-x': this.toggleSection('x'); break;
            case 'sec-y': this.toggleSection('y'); break;
            case 'sec-z': this.toggleSection('z'); break;
            case 'zones': this.setZonesOn(!this.zonesOn); this._renderPane(); break;
            case 'volumes': this.setVolumesOn(!this.volumesOn); this._renderPane(); break;
            case 'fullscreen': this.toggleFullscreen(); break;
            case 'keys': this._hint('Orbit: drag, right drag pans, wheel zooms at the cursor, double click sets the turning point. Fly / Walk: W A S D, Q / E, drag to look, Shift faster. F fit, H hide, I isolate, X x-ray, Esc clears.'); break;
        }
    };
    P._syncButtons = function () {
        var $ = this.$, self = this;
        $.orbit.setAttribute('aria-pressed', String(this.mode === 'orbit'));
        $.fly.setAttribute('aria-pressed', String(this.mode === 'fly'));
        $.walk.setAttribute('aria-pressed', String(this.mode === 'walk'));
        $.xray.setAttribute('aria-pressed', String(this.xray));
        ['x', 'y', 'z'].forEach(function (a) { $['sec' + a].setAttribute('aria-pressed', String(self.sections[a].on)); });
        $.zones.setAttribute('aria-pressed', String(this.zonesOn));
        $.vols.setAttribute('aria-pressed', String(this.volumesOn));
        $.full.setAttribute('aria-pressed', String(!!this.fullscreen));
        $.full.textContent = this.fullscreen ? 'Exit full screen' : 'Full screen';
    };
    P.toggleFullscreen = function (force) {
        this.fullscreen = force != null ? !!force : !this.fullscreen;
        this.root.classList.toggle('scv-fullscreen', this.fullscreen);
        try { document.documentElement.style.overflow = this.fullscreen ? 'hidden' : ''; } catch (_) {}
        this._syncButtons(); this._resize();
        return this.fullscreen;
    };
    P._hint = function (t) { this.$.hint.textContent = t; };
    P.dispose = function () {
        this.disposed = true;
        if (this._job) { try { this._job.cancel(); } catch (_) {} }
        try { cancelAnimationFrame(this._raf); } catch (_) {}
        if (this._ro) { try { this._ro.disconnect(); } catch (_) {} }
        document.removeEventListener('keydown', this._docKey, true);
        if (this.fullscreen) { try { document.documentElement.style.overflow = ''; } catch (_) {} }
        this._clearModel();
        if (this.gSec) while (this.gSec.children.length) this._disposeObj(this.gSec.children.pop());
        if (this.renderer) { try { this.renderer.dispose(); this.renderer.forceContextLoss(); } catch (_) {} }
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        if (_last === this) _last = null;
    };

    // =================================================================== module API
    var _last = null;
    function mount(el, opts) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (!el) throw new Error('SLCadViewer.mount: no container.');
        var v = new Viewer(el, opts);
        _last = v;
        if (opts && opts.cadId) v.loadModel(opts.cadId);
        return v;
    }
    function _on(name) { return function () { if (!_last) return false; return _last[name].apply(_last, arguments); }; }
    var api = {
        VERSION: VERSION, mount: mount, current: function () { return _last; },
        loadModel: _on('loadModel'), showModel: _on('showModel'), highlightZone: _on('highlightZone'), highlightParts: _on('highlightParts'),
        highlightVolume: _on('highlightVolume'), onSelect: _on('onSelect'), dispose: function () { if (_last) _last.dispose(); },
        _pure: { fitBoxDistance: fitBoxDistance, buildTree: buildTree, ancestorsOf: ancestorsOf, unionBox: unionBox, zoneColor: zoneColor, standardView: standardView, volumeSpec: volumeSpec, closestVertexPair: closestVertexPair, VIEWS: VIEWS }
    };
    root.SLCadViewer = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

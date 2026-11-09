// cad_shots.js, v1.1: screenshots of the 3D model for the reports (window.SLCadShots, 8 Nov 2026; v1.1 9 Nov 2026).
//
// v1.1, Waqas, 9 Nov 2026: "where we have multiple impact zones, we should have 1 image per cone like in the rotor burst
// PRA 1 per engine and the cones be different distinct colors"; "yeah needs to look clean and legible".
//   views({ kind:'pra', ... }) now starts with one view per danger source (r.sources from the PRA Autopilot: each engine,
//   each bogie, each fire volume, each group of forward-facing surfaces or lightning attachment points), id
//   'src:<riskKey>:<sourceId>', flagged default: true (the report pre-ticks them), each drawn in its own color of PALETTE
//   with only the parts that source reaches lit, and carrying caption, lead, color and colorName. The overview views
//   (side, above, front, close-up) draw every source in its own color and name them in their caption.
//   PALETTE: red, blue, teal, purple, orange, sky blue, green, olive (Paul Tol's colorblind-safe "vibrant" and "bright"
//   colors, then an olive): apart for the common forms of color blindness, strong on white and in print. Parts a PRA picture lights are drawn solid
//   CHARCOAL, a color no source uses; the ZSA pictures keep the HIGHLIGHT blue and the ZONE green.
//   Framing: engines, surface groups and attachment points are drawn from above with the nose to the left and the whole
//   aircraft in view (the same size for every source); a bogie close in from its own side. The camera distance is fitted
//   for the picture's own up direction, so a plan view fills the frame.
//
// Waqas: "I want the images in the reports to be relevant screenshots of the 3D-Model".
// Step 1 of 2: the capture service. Step 2 (the Autopilot asks the engineer which views go in) builds on it.
//
//   SLCadShots.ready()                     true when the project has a CAD model this computer can draw.
//   SLCadShots.views(subject)              the candidate views for a subject, [] without a model:
//        subject = { kind: 'pra', praId | riskKey }  or  { kind: 'zsa', zone: code or id }
//        each view = { id, label (plain words), camera: { dir, box, up, fov }, lit: { parts, volumes, zones }, why }
//   SLCadShots.capture(subject, viewId, { w, h })
//        -> Promise { png, thumb (data URLs), w, h, at, modelRev, label }
//        Drawn offscreen in a hidden viewer of its own (the person's visible viewer and its camera are never touched),
//        reusing the model already loaded (the visible viewer's geometry, else this computer's cache, else the demo's
//        bundled file). Cached by subject + view + size + model revision + what is lit; any change draws it again.
//
// The pictures always have a light background (Word, print, and dark mode alike: a screenshot is not inverted).
// The lit parts are drawn solid (CHARCOAL on the PRA pictures since v1.1, HIGHLIGHT blue on the ZSA ones), the danger
// sources and zone boxes in their own colors, and every other part ghosted in gray so the aircraft still reads around them.
(function (root) {
    'use strict';
    var VERSION = '1.1';
    var BG = '#FFFFFF';                // light background, every theme
    var HIGHLIGHT = '#1A6EF2';         // lit parts (ZSA pictures)
    var CHARCOAL = '#262A30';          // lit parts (PRA pictures): solid and dark, a color no danger source uses
    var DANGER = '#E03131';            // particular risk danger areas with no source of their own
    // v1.1: one color per danger source, in this order (the caption names it)
    var PALETTE = [['#CC3311', 'red'], ['#0077BB', 'blue'], ['#009988', 'teal'], ['#AA3377', 'purple'], ['#EE7733', 'orange'], ['#33BBEE', 'sky blue'], ['#228833', 'green'], ['#7A6A00', 'olive']];
    var ZONE = '#0CA678';              // the zone box (ZSA)
    var GHOST = '#7D8794';             // every other part
    var THUMB_W = 192;

    function _g(n) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
    function _arr(a) { return Array.isArray(a) ? a : []; }
    function CZ() { return root.SLCadZonal || null; }
    function _hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
    function _n3(a) { return Array.isArray(a) && a.length >= 3 && [0, 1, 2].every(function (i) { return typeof a[i] === 'number' && isFinite(a[i]); }); }
    function _union(boxes) {
        var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], any = false;
        (boxes || []).forEach(function (b) { if (!b || !_n3(b.min) || !_n3(b.max)) return; any = true; for (var j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], b.min[j], b.max[j]); mx[j] = Math.max(mx[j], b.min[j], b.max[j]); } });
        return any ? { min: mn, max: mx } : null;
    }
    function _clip(b, to) { if (!b || !to) return b; var mn = [], mx = []; for (var j = 0; j < 3; j++) { mn[j] = Math.max(b.min[j], to.min[j]); mx[j] = Math.min(b.max[j], to.max[j]); if (mn[j] > mx[j]) { mn[j] = to.min[j]; mx[j] = to.max[j]; } } return { min: mn, max: mx }; }
    function _grow(b, f) { if (!b) return b; var d = [0, 1, 2].map(function (j) { return Math.max(b.max[j] - b.min[j], 1) * f; }); return { min: b.min.map(function (v, j) { return v - d[j]; }), max: b.max.map(function (v, j) { return v + d[j]; }) }; }
    function _ctr(b) { return [0, 1, 2].map(function (j) { return (b.min[j] + b.max[j]) / 2; }); }

    // ------------------------------------------------------------------ the model
    function entry() { var C = CZ(); if (!C || !C.latestCadId) return null; var id = C.latestCadId(); return id ? C.model(id) : null; }
    function modelRev(e) { return e ? String(e.revision || '1') + ':' + String(e.sha256 || e.id).slice(0, 12) : ''; }
    function visibleViewer() { var v = null; try { v = (root.SLCadPage && root.SLCadPage.state && root.SLCadPage.state.viewer) || (root.SLCadViewer && root.SLCadViewer.current && root.SLCadViewer.current()); } catch (_) {} return v && v !== _hv ? v : null; }
    var _cacheHas = {};
    function ready() {
        var e = entry(); if (!e) return false;
        if (_hv && _hv.scene3 && _hv.entry && _hv.entry.sha256 === e.sha256) return true;
        var v = visibleViewer(); if (v && v.scene3 && v.entry && v.entry.sha256 === e.sha256) return true;
        if (root.SLCadBundled && root.SLCadBundled[e.sha256]) return true;
        if (_cacheHas[e.sha256] === undefined) {
            _cacheHas[e.sha256] = false;
            try { var I = root.SLCadImport; if (I && I.cacheHas) I.cacheHas(e.sha256).then(function (y) { _cacheHas[e.sha256] = !!y; }, function () {}); } catch (_) {}
        }
        return !!_cacheHas[e.sha256];
    }
    var _mb = null;
    function modelBox(e) {
        var C = CZ(), parts = C && C.partsOf ? C.partsOf(e) : _arr(e && e.parts);
        var k = e.sha256 + '|' + parts.length;
        if (_mb && _mb.k === k) return _mb.box;
        _mb = { k: k, box: _union(parts.map(function (p) { return p && p.bbox; })) };
        return _mb.box;
    }

    // ------------------------------------------------------------------ danger area shapes
    function _spreadOf(f) {
        try { var M = root.SLPraModels && root.SLPraModels.FRAGMENT_MODELS; if (M && M[f.id] && M[f.id].spread && typeof M[f.id].spread.value === 'number') return M[f.id].spread.value; } catch (_) {}
        return typeof f.spread === 'number' ? f.spread : 15;
    }
    // the shapes a risk is drawn with: rotor bursts as their burst bands (one per fragment type, around each disc's
    // axis), tire bursts, fires and the rest as their volumes (sphere or box)
    // The bands are drawn out to the far edge of the aircraft (the hit list counts the full range; past the aircraft
    // there is nothing to hit), and see-through enough that the bands of every disc together still let the parts show.
    function riskShapes(r, MB, color) {
        var out = [];
        color = color || DANGER;
        if (r.kind === 'ROTOR' && _arr(r.discs).length) {
            var range = (_arr(r.shapes)[0] || {}).range || 20000, n = r.discs.length * Math.max(1, _arr(r.frags).length);
            r.discs.forEach(function (d) {
                var reach = range;
                if (MB) { var far = 0; for (var i = 0; i < 8; i++) { var q = [i & 1 ? MB.max[0] : MB.min[0], i & 2 ? MB.max[1] : MB.min[1], i & 4 ? MB.max[2] : MB.min[2]], w = [q[0] - d.center[0], q[1] - d.center[1], q[2] - d.center[2]], a = w[0] * d.axis[0] + w[1] * d.axis[1] + w[2] * d.axis[2]; far = Math.max(far, Math.sqrt(Math.max(0, w[0] * w[0] + w[1] * w[1] + w[2] * w[2] - a * a))); } reach = Math.min(range, far * 1.02); }
                _arr(r.frags).forEach(function (f) { out.push({ kind: 'disk-sector', center: d.center, axis: d.axis, range: reach, spreadDeg: _spreadOf(f), color: color, opacity: Math.max(0.04, 0.3 / Math.sqrt(n)) }); });
            });
            return out;
        }
        _arr(r.shapes).forEach(function (s) {
            if (s.kind === 'sphere' && _n3(s.center) && s.radius > 0) out.push({ kind: 'sphere', center: s.center, radius: s.radius, color: color });
            else if (s.kind === 'box' && _n3(s.min) && _n3(s.max)) out.push({ kind: 'box', min: s.min, max: s.max, color: color });
        });
        return out;
    }
    // v1.1: the shapes of one danger source, in its color (a rotor burst source is the engine: its discs' bands)
    function sourceShapes(r, src, MB, color) {
        if (r.kind === 'ROTOR') return riskShapes(r, MB, color).map(function (x) { return Object.assign(x, { opacity: Math.min(0.2, x.opacity * 1.4) }); });
        return riskShapes({ kind: r.kind, shapes: _arr(src.shapes) }, MB, color).map(function (x) { return Object.assign(x, { opacity: 0.32 }); });   // strong enough to read in print
    }
    // the danger sources of a subject, in order, each with its color
    function sourcesOf(rs, MB) {
        var out = [];
        rs.forEach(function (r) { _arr(r.sources).forEach(function (s) { var c = PALETTE[out.length % PALETTE.length]; out.push({ r: r, s: s, id: 'src:' + r.key + ':' + s.id, color: c[0], colorName: c[1], shapes: sourceShapes(r, s, MB, c[0]) }); }); });
        return out;
    }
    function shapeBox(s) {
        if (s.kind === 'sphere') return { min: s.center.map(function (v) { return v - s.radius; }), max: s.center.map(function (v) { return v + s.radius; }) };
        if (s.kind === 'box') return { min: s.min, max: s.max };
        if (s.kind === 'disk-sector') {
            var n = s.axis, L = Math.hypot(n[0], n[1], n[2]) || 1, R = s.range, h = R * Math.sin(Math.min(89, s.spreadDeg) * Math.PI / 180);
            var ext = [0, 1, 2].map(function (i) { var c = Math.abs(n[i] / L); return R * Math.sqrt(Math.max(0, 1 - c * c)) + h * c; });
            return { min: s.center.map(function (v, i) { return v - ext[i]; }), max: s.center.map(function (v, i) { return v + ext[i]; }) };
        }
        return null;
    }

    // ------------------------------------------------------------------ subjects
    function _pra() { return root.SLPraAuto && root.SLPraAuto.compute ? root.SLPraAuto.compute() : null; }
    function praRisks(subject) {
        var res = _pra(); if (!res) return [];
        if (subject.riskKey) return res.byKey[subject.riskKey] ? [res.byKey[subject.riskKey]] : [];
        if (subject.praId) return res.risks.filter(function (r) { return r.praId === subject.praId; });
        return [];
    }
    function _zoneByCode(code) { var Z = root.ZONES; if (!Z || !Z.all) return null; return Z.all().find(function (z) { return z && (z.code === code || z.id === code); }) || null; }
    function _zoneBox(z) { var v = z && z.volume; return v && v.kind === 'box' && _n3(v.min) && _n3(v.max) ? { min: v.min.slice(0, 3), max: v.max.slice(0, 3) } : null; }
    // parts in each zone (with the zones under it), equipment only (structure left out), memoized per model and zone set
    var _zm = null;
    function zoneEquipment(e, zone) {
        var C = CZ(), Z = root.ZONES, ZA = root.SLZsaAuto; if (!C || !Z) return [];
        var parts = C.partsOf ? C.partsOf(e) : _arr(e.parts), links = C.confirmed ? C.confirmed(e.id) : {};
        var k = e.id + '|' + parts.length + '|' + Z.all().length + '|' + Object.keys(links).length;
        if (!_zm || _zm.k !== k) {
            var zoneOf = {}; try { C.containment(e.id).parts.forEach(function (r) { if (r.zoneId) zoneOf[r.pid] = r.zoneId; }); } catch (_) {}
            var byZone = {};
            parts.forEach(function (p) {
                var zid = zoneOf[p.pid]; if (!zid) return;
                if (ZA && ZA.classify) { var kk = ZA.classify(p, links[p.pid] || null); if (kk && kk.kind === 'structure') return; }
                var z = Z.get(zid), g = 0;
                while (z && g++ < 30) { (byZone[z.id] = byZone[z.id] || []).push(p); z = z.parentId ? Z.get(z.parentId) : null; }
            });
            _zm = { k: k, byZone: byZone };
        }
        return (_zm.byZone[zone.id] || []).slice();
    }

    function _view(id, label, dir, box, lit, why) { return { id: id, label: label, camera: { dir: dir, box: box, up: [0, 0, 1], fov: 45 }, lit: lit, why: why }; }
    var TOP = [-0.035, 0, 1];
    // v1.1: the PRA plan view: from straight above with the nose to the left and the right wing at the top, as a plan drawing
    // reads (nothing mirrored), the aircraft's length along the picture's width
    var PLAN = [0, 0, 1], PLAN_UP = [0, 1, 0];
    function _plan(v) { v.camera.up = PLAN_UP.slice(); return v; }
    function _lc(t) { t = String(t || ''); return /^[A-Z]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1); }
    // a box grown to at least frac of the model's size along each axis (around its center), so a small source keeps the
    // aircraft around it in the picture
    function _atLeast(b, MB, frac) { var c = _ctr(b); return { min: b.min.map(function (v, j) { var h = Math.max((b.max[j] - b.min[j]) / 2, (MB.max[j] - MB.min[j]) * frac / 2); return Math.min(v, c[j] - h); }), max: b.max.map(function (v, j) { var h = Math.max((b.max[j] - b.min[j]) / 2, (MB.max[j] - MB.min[j]) * frac / 2); return Math.max(v, c[j] + h); }) }; }
    // v1.1: the picture of one danger source: its shapes in its color, only the parts it reaches lit (charcoal), framed so
    // the source and the aircraft around it are in view
    function sourceView(x, MB, unitBox) {
        var r = x.r, s = x.s, pids = _arr(s.hits).map(String).filter(function (p) { return unitBox[p]; }).sort();
        var hb = _union(pids.map(function (p) { return unitBox[p]; })), sb = _clip(_union(x.shapes.map(shapeBox)), _grow(MB, 0.04));
        var sc = sb ? _ctr(sb) : _ctr(MB), mc = _ctr(MB), sy = Math.abs(sc[1] - mc[1]) < (MB.max[1] - MB.min[1]) * 0.03 ? -1 : (sc[1] > mc[1] ? 1 : -1);
        var lit = { parts: pids, volumes: x.shapes, zones: [], ghost: true, highlight: CHARCOAL }, dir, box, cap, lead, why;
        var lab = s.label, col = x.colorName;
        if (r.kind === 'ROTOR') {
            dir = PLAN; box = _union([_grow(MB, 0.03), sb, hb]);   // the whole aircraft, the same size for every engine
            cap = r.title + ', seen from above (nose to the left): its burst bands in ' + col + ' (darker where a narrower band lies inside a wider one) and the parts they reach in charcoal';
            lead = '{N} shows ' + _lc(lab) + ' and the parts its burst bands reach, on the 3D model, in ' + col + '.';
            why = 'Engine ' + (r.engine || '') + ' alone: its burst bands in ' + col + ' and the parts they reach in charcoal.';
        } else if (r.kind === 'BIRD') {
            dir = PLAN; box = _union([_grow(MB, 0.03), sb, hb]);   // the whole aircraft: the surfaces of a group spread over it
            cap = r.title + ', ' + _lc(lab) + ', seen from above (nose to the left): the slabs behind the struck surfaces in ' + col + ' and the parts a bird can reach in charcoal';
            lead = '{N} shows the ' + _lc(lab) + ' and what sits right behind them, on the 3D model, in ' + col + '.';
            why = _cap(_lc(lab)) + ' alone: the slabs behind the surfaces in ' + col + ' and the parts they reach in charcoal.';
        } else if (r.kind === 'LIGHT') {
            dir = PLAN; box = _union([_grow(MB, 0.03), sb, hb]);   // the whole aircraft: the points of a group spread over it
            cap = r.title + ', ' + _lc(lab) + ', seen from above (nose to the left): the attachment spheres in ' + col + ' and the units within reach in charcoal';
            lead = '{N} shows the ' + _lc(lab) + ' attachment points and the units close to them, on the 3D model, in ' + col + '.';
            why = _cap(_lc(lab)) + ' alone: the attachment spheres in ' + col + ' and the units within reach in charcoal.';
        } else if (r.kind === 'TIRE') {
            // from the bogie's own side and a little below, close in, so the bogie, its volume and the gear bay fill the picture
            dir = [-0.3, sy, -0.12]; var tg = _grow(sb || hb, 0.6); box = _atLeast(tg, MB, 0.16); box.min[2] = tg.min[2] + (tg.max[2] - tg.min[2]) * 0.45; box.max[2] = tg.max[2] + (tg.max[2] - tg.min[2]) * 0.3;   // wide along the aircraft, not down below the ground
            cap = r.title + ', ' + _lc(lab) + ': its danger volume in ' + col + ' and the parts it reaches in charcoal';
            lead = '{N} shows the ' + _lc(lab) + ' volume and the parts it reaches, on the 3D model, in ' + col + '.';
            why = _cap(_lc(lab)) + ' alone: its volume in ' + col + ' and the parts it reaches in charcoal.';
        } else {
            dir = [-1, sy * 0.9, 0.75]; box = _atLeast(_grow(_union([sb, hb]), 0.18), MB, 0.16);
            cap = r.title + (_lc(lab) !== _lc(r.title) ? ', ' + _lc(lab) : '') + ': its danger volume in ' + col + ' and the parts it reaches in charcoal';
            lead = '{N} shows ' + (_lc(lab) !== _lc(r.title) ? 'the ' + _lc(lab) + ' volume' : 'the danger volume') + ' and the parts it reaches, on the 3D model, in ' + col + '.';
            why = _cap(_lc(lab)) + ' alone: its volume in ' + col + ' and the parts it reaches in charcoal.';
        }
        var v = _view(x.id, lab, dir, box || _grow(MB, 0.02), lit, why); if (dir === PLAN) _plan(v);
        v.default = true; v.source = { risk: r.key, id: s.id, label: lab }; v.color = x.color; v.colorName = col; v.caption = cap; v.lead = lead;
        return v;
    }
    function _cap(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
    function views(subject) {
        if (!subject || !ready()) return [];
        var e = entry(), MB = modelBox(e); if (!MB) return [];
        if (subject.kind === 'pra') {
            var rs = praRisks(subject); if (!rs.length) return [];
            var srcs = sourcesOf(rs, MB), unitBox = {};
            var shapes = [], hitPids = {}, hitBoxes = [];
            rs.forEach(function (r) {
                var mine = srcs.filter(function (x) { return x.r === r; });
                if (mine.length) mine.forEach(function (x) { shapes = shapes.concat(x.shapes); });
                else { var rsh = riskShapes(r, MB); shapes = shapes.concat(rsh); if (!rsh.length) _arr(r.zones).forEach(function (code) { var b = _zoneBox(_zoneByCode(code)); if (b) shapes.push({ kind: 'box', min: b.min, max: b.max, color: DANGER }); }); }
                _arr(r.hits).forEach(function (u) { unitBox[u.pid] = u.bbox; if (!hitPids[u.pid]) { hitPids[u.pid] = 1; hitBoxes.push(u.bbox); } });
            });
            if (!shapes.length) return [];
            var pids = Object.keys(hitPids).sort(), hb = _union(hitBoxes);
            var danger = _clip(_union(shapes.map(shapeBox)), _grow(MB, 0.08));
            var area = _union([danger, hb]), dc = _ctr(danger), mc = _ctr(MB), sy = dc[1] > mc[1] + 1e-6 ? 1 : -1;
            var lit = { parts: pids, volumes: shapes, zones: [], ghost: true, highlight: srcs.length ? CHARCOAL : HIGHLIGHT };
            var name = rs.length === 1 ? rs[0].title : rs[0].title.replace(/^Engine \S+ /, 'Engine ');
            var what = rs[0].kind === 'ROTOR' ? 'the burst bands' : rs[0].kind === 'TIRE' ? 'the tire burst area' : 'the danger area';
            var hitWord = srcs.length ? 'charcoal' : 'blue';
            // v1.1: one picture per danger source first, each in its own color (pre-ticked in the report)
            var out = srcs.map(function (x) { return sourceView(x, MB, unitBox); });
            var who = srcs.length > 1 ? srcs.map(function (x) { return _lc(x.s.label) + ' in ' + x.colorName; }).join(', ') : (srcs.length ? what.replace(/^the /, '') + ' in ' + srcs[0].colorName : what.replace(/^the /, '') + ' in red');
            var cap = function (lab) { return name + ', ' + _lc(lab) + ': ' + who + '; the parts reached in ' + hitWord; };
            var ov = function (id, label, dir, box, l, why) { var v = _view(id, label, dir, box, l, why); v.caption = cap(label); return v; };
            out.push(ov('side', 'Danger area, from the side', [0, sy, 0], area, lit, 'Shows ' + what + ' of ' + name + ' along the aircraft and how high it reaches, with the parts it hits in ' + hitWord + '.'),
                _plan(ov('above', 'Danger area, from above', PLAN, _union([area, _grow(MB, 0.03)]), lit, 'Shows how far ' + what + ' of ' + name + ' spreads across the aircraft, with the parts it hits in ' + hitWord + '.')),
                ov('front', 'Danger area, from the front', [-1, 0, 0], area, lit, 'Shows ' + what + ' of ' + name + ' seen from the nose, which sides and heights it reaches.'));
            // close up, the danger area is drawn as its outline so the parts it hits stay in view
            if (pids.length) out.push(ov('closeup', 'Close-up of the parts it hits', [-1, sy, 0.8], _grow(hb, 0.08), Object.assign({}, lit, { volumeStyle: 'outline' }), 'The ' + pids.length + ' parts ' + name + ' reaches, close up, inside ' + what + '.'));
            return out;
        }
        if (subject.kind === 'zsa') {
            var z = _zoneByCode(subject.zone), zb = _zoneBox(z); if (!zb) return [];
            var eq = zoneEquipment(e, z), eqPids = eq.map(function (p) { return p.pid; }).sort(), eb = _union(eq.map(function (p) { return p.bbox; }));
            var zl = { parts: eqPids, volumes: [{ kind: 'box', min: zb.min, max: zb.max, color: ZONE }], zones: [z.id], ghost: true };
            var nm = (z.code ? z.code + ' ' : '') + (z.name || '');
            var zo = [
                _view('outside', 'The zone from outside', [-1, -1, 0.8], _grow(zb, 0.3), zl, 'Where zone ' + nm + ' sits on the aircraft, its box in green and its equipment in blue.'),
                _view('above', 'The zone from above', TOP, _grow(zb, 0.3), zl, 'Zone ' + nm + ' seen from above, with the equipment inside it in blue.')
            ];
            if (eqPids.length) zo.push(_view('equipment', 'The zone\'s equipment, close up', [-1, -1, 0.8], _grow(_union([eb]), 0.08), zl, 'The ' + eqPids.length + ' parts of equipment in zone ' + nm + ', close up.'));
            return zo;
        }
        return [];
    }

    // ------------------------------------------------------------------ the hidden viewer
    var _hv = null, _hvHost = null, _hvLoad = null, _chain = Promise.resolve();
    function hiddenViewer() {
        if (_hv && !_hv.disposed) return _hv;
        var host = _hvHost = document.createElement('div');
        host.setAttribute('data-cad-shots', '1'); host.setAttribute('aria-hidden', 'true');
        host.style.cssText = 'position:fixed;left:-40000px;top:0;width:800px;height:500px;overflow:hidden;pointer-events:none;visibility:hidden;';
        document.body.appendChild(host);
        var SM = root.SLSpaceMouse; root.SLSpaceMouse = null;   // the device belongs to the person's viewer
        try { _hv = new root.SLCadViewer.Viewer(host, { height: 500, preserveDrawingBuffer: true, occlusion: false, viewCube: false }); }
        finally { root.SLSpaceMouse = SM; }
        _hv._resize = function () {};   // sized per capture, never by its (offscreen) box
        return _hv;
    }
    function _waitLoaded(v, e) {
        return new Promise(function (resolve, reject) {
            var t0 = Date.now();
            (function poll() {
                if (v.disposed) return reject(new Error('viewer closed'));
                if (v.scene3 && v.entry && v.entry.sha256 === e.sha256 && !v.$.overlay.classList.contains('scv-open')) return resolve(v);
                if (/is not on this computer/.test(v.$.overlay.textContent || '') && !v._bundledTried) return reject(new Error('The CAD geometry is not on this computer.'));
                if (Date.now() - t0 > 180000) return reject(new Error('The CAD model took too long to load.'));
                setTimeout(poll, 150);
            })();
        });
    }
    function ensureLoaded(e) {
        var v = hiddenViewer();
        if (v.scene3 && v.entry && v.entry.sha256 === e.sha256 && _hvLoad && _hvLoad.sha === e.sha256) return _hvLoad.p;
        var vis = visibleViewer(), p;
        if (vis && vis.geom && vis.entry && vis.entry.sha256 === e.sha256) p = v.showModel(e, Object.assign({}, vis.geom, { attrs: vis.attrs || {} }));   // the model already loaded
        else p = v.loadModel(e.id);
        _hvLoad = { sha: e.sha256, p: Promise.resolve(p).then(function () { return _waitLoaded(v, e); }).then(function () {
            var sc = v.scene3;
            if (sc && sc.ghostMaterial) { sc.ghostMaterial.color.set(GHOST); sc.ghostMaterial.opacity = 0.2; sc.ghostMaterial.needsUpdate = true; }
            return v;
        }) };
        _hvLoad.p.catch(function () { _hvLoad = null; });
        return _hvLoad.p;
    }
    function _shapeMesh(T, s, style) {
        var VS = root.SLCadViewer._pure.volumeSpec, sp = VS(s, {}); if (!sp.ok) return null;
        var g;
        if (sp.type === 'sphere') g = new T.SphereGeometry(sp.radius, 32, 16);
        else if (sp.type === 'box') g = new T.BoxGeometry(sp.max[0] - sp.min[0] || 1, sp.max[1] - sp.min[1] || 1, sp.max[2] - sp.min[2] || 1);
        else g = new T.LatheGeometry(sp.points.map(function (p) { return new T.Vector2(p[0], p[1]); }), 64, sp.phiStart || 0, sp.phiLength || Math.PI * 2);
        var col = s.color || DANGER;
        var m = new T.Mesh(g, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: style === 'outline' ? 0.03 : (s.opacity || 0.22), depthWrite: false, depthTest: true, side: T.DoubleSide }));
        m.renderOrder = 8;
        var ed = new T.LineSegments(new T.EdgesGeometry(g, 20), new T.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthTest: false }));
        ed.renderOrder = 9; m.add(ed);
        if (sp.type === 'sphere') m.position.set(sp.center[0], sp.center[1], sp.center[2]);
        else if (sp.type === 'box') m.position.set((sp.min[0] + sp.max[0]) / 2, (sp.min[1] + sp.max[1]) / 2, (sp.min[2] + sp.max[2]) / 2);
        else {
            m.position.set(sp.origin[0], sp.origin[1], sp.origin[2]);
            if (sp.basis) m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3().fromArray(sp.basis.x), new T.Vector3().fromArray(sp.basis.y), new T.Vector3().fromArray(sp.basis.z)));
            else m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(sp.axis[0], sp.axis[1], sp.axis[2]));
        }
        return m;
    }
    // v1.1: the distance at which the box fills the picture, for the camera's own up direction (the viewer's fit assumes
    // its own up, which turns a plan view the other way and leaves it small)
    function _fitDistance(box, dir, fov, aspect, up) {
        if (!up) return root.SLCadViewer._pure.fitBoxDistance(box, dir, fov, aspect);
        var f = [-dir[0], -dir[1], -dir[2]], r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
        var rl = Math.hypot(r[0], r[1], r[2]); if (rl < 1e-6) return root.SLCadViewer._pure.fitBoxDistance(box, dir, fov, aspect);
        r = [r[0] / rl, r[1] / rl, r[2] / rl];
        var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
        var tv = Math.tan(fov * Math.PI / 360), th = tv * (aspect || 1), c = _ctr(box), d = 0;
        for (var i = 0; i < 8; i++) {
            var p = [i & 1 ? box.max[0] : box.min[0], i & 2 ? box.max[1] : box.min[1], i & 4 ? box.max[2] : box.min[2]], v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
            var x = v[0] * r[0] + v[1] * r[1] + v[2] * r[2], y = v[0] * u[0] + v[1] * u[1] + v[2] * u[2], z = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
            d = Math.max(d, z + Math.abs(x) / th, z + Math.abs(y) / tv);
        }
        return Math.max(d * 1.06, 1e-6);
    }
    function _draw(v, view, w, h) {
        var T = v.T, r = v.renderer, cam = v.camera;
        // what is lit
        if (!v.gShots) { v.gShots = new T.Group(); v.scene.add(v.gShots); }
        while (v.gShots.children.length) v._disposeObj(v.gShots.children.pop());
        _arr(view.lit.volumes).forEach(function (s) { var m = _shapeMesh(T, s, view.lit.volumeStyle); if (m) v.gShots.add(m); });
        // v1.1: the lit parts' color per picture (charcoal on the PRA pictures, blue on the ZSA ones)
        var hc = view.lit.highlight || HIGHLIGHT, dark = hc === CHARCOAL;
        v.focusMat.color.set(hc); v.focusMat.emissive.set(hc); v.focusMat.emissiveIntensity = dark ? 0.08 : 0.45; v.focusMat.needsUpdate = true;
        v.select(_arr(view.lit.parts), false);
        v.setXray(view.lit.ghost !== false);
        // the camera
        r.setPixelRatio(1); r.setSize(w, h, false);
        cam.aspect = w / h; cam.fov = view.camera.fov || 45;
        var L = Math.hypot.apply(null, view.camera.dir), dir = view.camera.dir.map(function (x) { return x / L; });
        var box = view.camera.box, c = _ctr(box), d = _fitDistance(box, dir, cam.fov, cam.aspect, view.camera.up);
        var size = Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) || 1;
        cam.near = Math.max(Math.min(d * 0.01, (v.size || size) * 1e-5), 0.01); cam.far = Math.max(d + size * 4, (v.size || size) * 4);
        cam.up.set(view.camera.up[0], view.camera.up[1], view.camera.up[2]);
        cam.position.set(c[0] + dir[0] * d, c[1] + dir[1] * d, c[2] + dir[2] * d);
        v.target.set(c[0], c[1], c[2]); cam.lookAt(v.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
        // settle the level of detail for this camera, then draw once
        if (v.scene3) for (var i = 0; i < 12 && v.scene3.update(cam, h); i++) {}
        v._render(performance.now());
        // onto the light background
        var out = document.createElement('canvas'); out.width = w; out.height = h;
        var g = out.getContext('2d'); g.fillStyle = BG; g.fillRect(0, 0, w, h);
        g.drawImage(r.domElement, 0, 0, w, h);
        var th = document.createElement('canvas'); th.width = THUMB_W; th.height = Math.max(1, Math.round(THUMB_W * h / w));
        th.getContext('2d').drawImage(out, 0, 0, th.width, th.height);
        return { png: out.toDataURL('image/png'), thumb: th.toDataURL('image/png') };
    }

    // ------------------------------------------------------------------ capture and its cache
    var _cache = {}, _stats = { captures: 0, hits: 0, lastMs: 0 };
    function subjectKey(s) { return s.kind === 'pra' ? 'pra:' + (s.riskKey ? 'k:' + s.riskKey : 'id:' + s.praId) : s.kind === 'zsa' ? 'zsa:' + s.zone : JSON.stringify(s); }
    function litSig(view) { return _hash(JSON.stringify([view.lit, view.camera])); }
    function cacheKey(subject, view, w, h, e) { return [subjectKey(subject), view.id, w + 'x' + h, modelRev(e), litSig(view)].join('|'); }
    function capture(subject, viewId, opts) {
        opts = opts || {};
        var w = Math.max(16, Math.min(4096, Math.round(+opts.w || 1200))), h = Math.max(16, Math.min(4096, Math.round(+opts.h || 750)));
        var e = entry();
        if (!e || !ready()) return Promise.reject(new Error('No CAD model is loaded.'));
        var view = views(subject).find(function (x) { return x.id === viewId; });
        if (!view) return Promise.reject(new Error('No view "' + viewId + '" for this subject.'));
        var key = cacheKey(subject, view, w, h, e);
        if (_cache[key]) { _stats.hits++; return _cache[key]; }
        var p = _chain.then(function () { return ensureLoaded(e); }).then(function (v) {
            var t0 = performance.now();
            var img = _draw(v, view, w, h);
            _stats.captures++; _stats.lastMs = performance.now() - t0;
            return { png: img.png, thumb: img.thumb, w: w, h: h, at: new Date().toISOString(), modelRev: modelRev(e), label: view.label, viewId: view.id, key: key, ms: _stats.lastMs };
        });
        _chain = p.catch(function () {});
        _cache[key] = p;
        p.catch(function () { if (_cache[key] === p) delete _cache[key]; });
        return p;
    }
    function clearCache() { _cache = {}; }
    function dispose() { if (_hv) { try { _hv.dispose(); } catch (_) {} } _hv = null; _hvLoad = null; if (_hvHost && _hvHost.parentNode) _hvHost.parentNode.removeChild(_hvHost); _hvHost = null; _cache = {}; }

    var api = { VERSION: VERSION, ready: ready, views: views, capture: capture, clearCache: clearCache, dispose: dispose,
        stats: function () { return { captures: _stats.captures, hits: _stats.hits, lastMs: _stats.lastMs, cached: Object.keys(_cache).length }; },
        COLORS: { background: BG, highlight: HIGHLIGHT, charcoal: CHARCOAL, danger: DANGER, zone: ZONE, ghost: GHOST }, PALETTE: PALETTE.map(function (c) { return { hex: c[0], name: c[1] }; }),
        _hidden: function () { return _hv; }, _pure: { riskShapes: riskShapes, sourceShapes: sourceShapes, shapeBox: shapeBox, cacheKey: cacheKey, subjectKey: subjectKey } };
    root.SLCadShots = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

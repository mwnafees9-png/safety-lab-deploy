/* ============================================================================
 * pra_models.js (SLPraModels), 14 Oct 2026 (p3-pra)
 *
 * Particular risk models on top of the CAD / zonal engine (SLCadZonal):
 *   rotor burst per AC 20-128A (fragment models, 360 degree release-angle sweep, the AC's
 *   hazard ratios), bird strike parameters per the certification basis rule text.
 *
 * FOUNDER RULINGS (Waqas): the AI sets risks up the way an engineer would and never fabricates;
 * Safety Lab calculates deterministically; nothing goes into the analysis without engineer
 * confirmation; where data is missing, say it is missing.
 *
 * EVERY PARAMETER CARRIES ITS SOURCE: { value, source: 'rule' | 'ac' | 'derived' |
 * 'engineer' | 'unverified' | 'missing', ref, quote }. A value the cited text does not settle
 * is configurable and marked unverified, in the result as well as on screen.
 *
 * Texts used (both US Government works, public domain), fetched 14 Oct 2026:
 *   AC 20-128A (3/25/97), faa.gov Advisory_Circular/AC_20-128A.pdf, paragraphs 6f, 9a-9e, 10c
 *   and the appendix risk method (fragment trajectory, infinite energy, uniform release).
 *   14 CFR 25.571(e)(1), 25.631, 25.775(b), 23.2320(b), 29.631 from eCFR (2026-09-01).
 * ========================================================================== */
(function (root) {
    'use strict';
    var VERSION = '1.0';
    function _g(n) { try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} return root[n]; }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _s(v) { return v == null ? '' : String(v).trim(); }
    function _cmp(a, b) { a = String(a == null ? '' : a); b = String(b == null ? '' : b); return a < b ? -1 : (a > b ? 1 : 0); }
    function _pc() { var p = _g('projectConfig'); if (p && typeof p === 'object') return p; root.projectConfig = root.projectConfig || {}; return root.projectConfig; }
    function _C() { return root.SLCadZonal || null; }
    function _save() { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} }
    // the project's certification basis: projectConfig.regulation (the app's field), never assumed
    function _projBasis() { var pc = _pc(); return _s(pc.regulation || pc.certBasis || ''); }
    function _clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
    function _r6(x) { return Math.round(x * 1e6) / 1e6; }
    function _n3(v) { return Array.isArray(v) && v.length === 3 && v.every(function (x) { return typeof x === 'number' && isFinite(x); }); }
    function _sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function _dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function _len(a) { return Math.sqrt(_dot(a, a)); }
    function _unit(a) { var l = _len(a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : null; }
    function _cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function _corners(b) { var o = []; for (var i = 0; i < 8; i++) o.push([(i & 1) ? b.max[0] : b.min[0], (i & 2) ? b.max[1] : b.min[1], (i & 4) ? b.max[2] : b.min[2]]); return o; }
    var D2R = Math.PI / 180;

    // ---- cited sources -----------------------------------------------------------------------
    var REFS = root.SL_PRA_REFS || (typeof require === 'function' ? (function () { try { return require('./pra_refs_data.js'); } catch (_) { return {}; } })() : {});
    function ref(id) { var r = REFS[id]; return r ? { id: id, doc: r.doc, section: r.section, quote: r.quote } : null; }
    function P(value, source, refId, note) { var o = { value: value, source: source }; if (refId) o.ref = refId; if (note) o.note = note; return o; }
    function cite(p) { if (!p) return 'missing'; if (p.source === 'missing') return 'missing' + (p.note ? ': ' + p.note : ''); if (p.source === 'engineer') return p.note || 'engineer entered'; if (p.source === 'unverified') return 'unverified' + (p.note ? ': ' + p.note : ''); var r = REFS[p.ref]; return (r ? r.doc + ' ' + r.section : p.ref || p.source) + (p.source === 'derived' ? ' (derived' + (p.note ? ': ' + p.note : '') + ')' : ''); }

    // ---- AC 20-128A fragment models ----------------------------------------------------------
    // R = disc radius (to the blade root), b = blade length; bladed radius Rb = R + b. Lengths mm.
    // halfWidth is half the width of the swept path in the plane of rotation; rCg the radius of
    // the fragment's c.g. at release; massFraction of the bladed disc mass.
    function _sectorCentroid(Rb) { var a = Math.PI / 3; return 2 * Rb * Math.sin(a) / (3 * a); }   // 120 degree sector
    // One palette for the app, the exports and the PDFs: Okabe-Ito (colorblind safe), a distinct edge style per
    // type so overlapping regions stay readable. Hit parts are shown light grey with a black outline, a neutral
    // that collides with no type color (charcoal #333333 with a white outline, app and exports alike).
    var PALETTE = {
        rotor: { oneThirdDisc: '#D55E00', intermediate: '#0072B2', small: '#009E73', alternate: '#CC79A7', fanBlade: '#E69F00' },
        rotorEdge: { oneThirdDisc: 'solid', intermediate: 'dashed', small: 'dotted', alternate: 'dashdot', fanBlade: 'longdash' },
        tire: { m1Large: '#D55E00', m1Small: '#0072B2', m2Flange: '#CC79A7', m3Strip: '#009E73', m4Burst: '#E69F00' },
        tireEdge: { m1Large: 'solid', m1Small: 'dashed', m2Flange: 'dashdot', m3Strip: 'dotted', m4Burst: 'longdash' },
        hitFill: '#333333', hitEdge: '#FFFFFF',
        lightning: { '1A': '#D55E00', '1B': '#E69F00', '1C': '#F0E442', '2A': '#0072B2', '2B': '#56B4E9', '3': '#009E73' }
    };
    var FRAGMENT_MODELS = {
        oneThirdDisc: { label: 'Single one-third disc fragment', order: 1, spread: P(3, 'ac', 'ac20128a-9a'), massFraction: P(1 / 3, 'ac', 'ac20128a-9a'), criterion: P(1 / 20, 'ac', 'ac20128a-10c3i'),
            geom: function (R, b) {
                // para 9a: "one-third of the disc with one-third blade height": the 120 degree sector of radius R + b/3
                var Rb = R + b / 3, rc = _sectorCentroid(Rb);
                // greatest radius from the sector centroid to its periphery: the apex or an arc end
                var toApex = rc, toEnd = Math.sqrt(Rb * Rb + rc * rc - 2 * Rb * rc * Math.cos(Math.PI / 3));
                return { rCg: P(_r6(rc), 'derived', 'ac20128a-app-a', 'centroid of the 120 degree sector of radius R + b/3 (disc with one-third blade height, para 9a): 2 r sin(60 deg) / (3 x pi/3); the path is tangential to the sector centroid locus (Appendix 1 4.1(a))'),
                         halfWidth: P(_r6(Math.max(toApex, toEnd)), 'derived', 'ac20128a-app-a', 'path width = twice the greatest radius from the sector centroid to its periphery (sector of radius R + b/3)'),
                         maxDimension: P(_r6(Rb * Math.sqrt(3)), 'derived', 'ac20128a-9a', 'chord of the 120 degree sector of radius R + b/3: sqrt(3) (R + b/3)') };
            } },
        intermediate: { label: 'Intermediate fragment', order: 2, spread: P(5, 'ac', 'ac20128a-9b'), massFraction: P(1 / 30, 'ac', 'ac20128a-9b'), criterion: P(1 / 40, 'ac', 'ac20128a-10c3ii'),
            geom: function (R, b) { var md = (R + b) / 3; return { rCg: P(_r6(R), 'ac', 'ac20128a-fig4'), halfWidth: P(_r6(md / 2), 'derived', 'ac20128a-9b', 'half the maximum dimension'), maxDimension: P(_r6(md), 'ac', 'ac20128a-9b') }; } },
        alternate: { label: 'Alternative model: single one-third disc at ±5 degrees', order: 3, spread: P(5, 'ac', 'ac20128a-9c'), massFraction: P(1 / 3, 'ac', 'ac20128a-9a'), criterion: P(1 / 20, 'ac', 'ac20128a-10c3i'), optional: true,
            geom: function (R, b) { return FRAGMENT_MODELS.oneThirdDisc.geom(R, b); } },
        small: { label: 'Small fragments', order: 4, spread: P(15, 'ac', 'ac20128a-9d'), massFraction: P(null, 'unverified', null, 'AC 20-128A para 9d gives no mass for engine small fragments; consult the engine manufacturer'), criterion: P(null, 'ac', 'ac20128a-10c5'),
            geom: function (R, b) { var md = b / 2; return { rCg: P(_r6(R + 0.75 * b), 'derived', 'ac20128a-9d', 'middle of the tip half of the blade'), halfWidth: P(_r6(md / 2), 'derived', 'ac20128a-9d', 'half the maximum dimension'), maxDimension: P(_r6(md), 'ac', 'ac20128a-9d') }; } },
        fanBlade: { label: 'Fan blade fragment', order: 5, spread: P(15, 'ac', 'ac20128a-9e'), massFraction: P(null, 'ac', 'ac20128a-fig5', 'one-third of the airfoil mass including any part span shroud (para 9e; Figure 5: "Fragment mass assumed to be 1/3 of the airfoil mass"); the airfoil mass is not in the AC: the fragment mass is an engineer input'), criterion: P(null, 'ac', 'ac20128a-10c5'), fanOnly: true,
            geom: function (R, b) { var md = b / 3; return { rCg: P(_r6(R + b * 5 / 6), 'derived', 'ac20128a-fig5', 'at the centerline of the outer one-third of the airfoil (Figure 5: "CG is taken to lie at the centerline of the 1/3 fragment"), X = airfoil length less blade root and platform: the blade length entered must be that airfoil length'), halfWidth: P(_r6(md / 2), 'derived', 'ac20128a-9e', 'half the maximum dimension'), maxDimension: P(_r6(md), 'ac', 'ac20128a-9e') }; } }
    };
    var FRAGMENT_ORDER = Object.keys(FRAGMENT_MODELS).sort(function (a, b) { return FRAGMENT_MODELS[a].order - FRAGMENT_MODELS[b].order; });

    // ---- rotors: proposed from CAD, confirmed by the engineer ---------------------------------
    var NOT_ROTOR = /\b(shield|guard|cover|case|casing|housing|containment|plate|bracket|mount)\b/i;
    var ROTOR_WORDS = /\b(rotor|disc|disk|fan|turbine|compressor|impeller|stage|hpt|lpt|hpc|lpc|apu)\b/i;
    function _rotors() { var pc = _pc(); if (!Array.isArray(pc.praRotors)) pc.praRotors = []; return pc.praRotors; }
    function rotors() { return _arr(_pc().praRotors).slice().sort(function (a, b) { return _cmp(a.id, b.id); }); }
    function rotor(id) { var r = _arr(_pc().praRotors); for (var i = 0; i < r.length; i++) if (r[i] && r[i].id === id) return r[i]; return null; }
    // proposeRotors(cadId): pure. A part whose name, designator or path names a rotating part is
    // proposed with its center at the box center, its axis along the box's thinnest extent and a
    // radius of half the larger of the other two. Nothing is written.
    function proposeRotors(cadId) {
        var C = _C(); if (!C) return [];
        cadId = cadId || C.latestCadId();
        var m = C.model(cadId); if (!m) return [];
        var out = [];
        C.partsOf(m).slice().sort(function (a, b) { return _cmp(a.pid, b.pid); }).forEach(function (p) {
            var words = [p.name, p.designator].concat(_arr(p.path)).map(_s).join(' ').replace(/[_\-]/g, ' ');
            if (!ROTOR_WORDS.test(words) || NOT_ROTOR.test((_s(p.name) + ' ' + _s(p.designator)).replace(/[_\-]/g, ' ')) || !p.bbox) return;
            var e = [0, 1, 2].map(function (i) { return p.bbox.max[i] - p.bbox.min[i]; });
            var ax = e.indexOf(Math.min(e[0], e[1], e[2]));
            var others = [0, 1, 2].filter(function (i) { return i !== ax; }).map(function (i) { return e[i]; });
            if (Math.min.apply(null, others) <= 0 || e[ax] * 1.5 > Math.min.apply(null, others)) return;   // not disc-like
            var axis = [0, 0, 0]; axis[ax] = 1;
            out.push({ cadId: cadId, pid: String(p.pid), name: p.name || String(p.pid), center: [0, 1, 2].map(function (i) { return _r6((p.bbox.min[i] + p.bbox.max[i]) / 2); }), axis: axis,
                       radius: _r6(Math.max.apply(null, others) / 2), why: 'name "' + _s(p.name || p.designator) + '" names a rotating part; axis along the thinnest extent of its box', kind: /\bfan\b/i.test(words) ? 'fan' : 'rotor' });
        });
        return out;
    }
    function rotorIssue(r) {
        if (!r || typeof r !== 'object') return 'No rotor given.';
        if (!_n3(r.center) || !_n3(r.axis) || !_unit(r.axis)) return 'A rotor needs its center and axis of rotation.';
        if (!(typeof r.discRadius === 'number' && r.discRadius > 0)) return 'A rotor needs the disc radius (to the blade root), in mm.';
        if (!(typeof r.bladeLength === 'number' && r.bladeLength >= 0)) return 'A rotor needs the blade length, in mm (0 for a bladeless disc).';
        if (r.refDir != null && !_n3(r.refDir)) return 'The reference direction must be three numbers.';
        if (r.rotation != null && r.rotation !== 1 && r.rotation !== -1) return 'Rotation is +1 (right hand about the axis) or -1.';
        return null;
    }
    // confirmRotor(setup, by): the engineer's confirmation writes the rotor. Numbers the engineer
    // typed are recorded as engineer entered; mass and speed stay missing until entered.
    function confirmRotor(r, by, opts) {
        opts = opts || {};
        if (!_s(by)) return { ok: false, err: 'A rotor goes into the analysis only with the name of the engineer who confirmed it.' };
        var bad = rotorIssue(r); if (bad) return { ok: false, err: bad };
        var arr = _rotors(), id = _s(r.id);
        if (!id) { var pc = _pc(); pc.praRotorSeq = (pc.praRotorSeq || 0) + 1; id = 'rot-' + pc.praRotorSeq; while (rotor(id)) { pc.praRotorSeq++; id = 'rot-' + pc.praRotorSeq; } }
        var rec = { id: id, label: _s(r.label) || id, cadId: r.cadId || null, pid: r.pid != null ? String(r.pid) : null, kind: r.kind === 'fan' ? 'fan' : (r.kind === 'apu' ? 'apu' : 'rotor'),
                    center: r.center.slice(), axis: _unit(r.axis), refDir: _n3(r.refDir) ? r.refDir.slice() : null, rotation: r.rotation === -1 ? -1 : 1,
                    discRadius: r.discRadius, bladeLength: r.bladeLength,
                    bladedDiscMassKg: typeof r.bladedDiscMassKg === 'number' && r.bladedDiscMassKg > 0 ? r.bladedDiscMassKg : null,
                    rpm: typeof r.rpm === 'number' && r.rpm > 0 ? r.rpm : null,
                    fanBladeFragmentMassKg: typeof r.fanBladeFragmentMassKg === 'number' && r.fanBladeFragmentMassKg > 0 ? r.fanBladeFragmentMassKg : null,
                    smallFragmentMassKg: typeof r.smallFragmentMassKg === 'number' && r.smallFragmentMassKg > 0 ? r.smallFragmentMassKg : null,
                    shieldCapacityJ: typeof r.shieldCapacityJ === 'number' && r.shieldCapacityJ > 0 ? r.shieldCapacityJ : null,
                    // engineer inputs, not from the AC: the fragment's axial width (R9), the engine this stage belongs to and
                    // the engine's total stage count (Appendix 1 6.11(d) averages over every stage of the engine) (R11)
                    fragmentAxialWidthMm: typeof r.fragmentAxialWidthMm === 'number' && r.fragmentAxialWidthMm >= 0 ? r.fragmentAxialWidthMm : null,
                    engine: _s(r.engine) || null, engineStages: typeof r.engineStages === 'number' && r.engineStages >= 1 ? Math.round(r.engineStages) : null,
                    unmodeledStagesHarmless: r.unmodeledStagesHarmless && r.unmodeledStagesHarmless.by ? _clone(r.unmodeledStagesHarmless) : null,
                    riskFactor: r.riskFactor && typeof r.riskFactor.value === 'number' ? _clone(r.riskFactor) : null,
                    stageRotationalEnergyJ: typeof r.stageRotationalEnergyJ === 'number' && r.stageRotationalEnergyJ > 0 ? r.stageRotationalEnergyJ : null,
                    confirms: r.confirms && typeof r.confirms === 'object' ? _clone(r.confirms) : {},
                    shields: _arr(r.shields).map(String).sort(_cmp),
                    spreadOverride: r.spreadOverride && typeof r.spreadOverride === 'object' ? _clone(r.spreadOverride) : {},
                    confirmedBy: _s(by), confirmedAt: opts.at || new Date().toISOString() };
        var i = arr.findIndex(function (x) { return x && x.id === id; }); if (i >= 0) arr[i] = rec; else arr.push(rec);
        _save();
        return { ok: true, rotor: _clone(rec) };
    }
    function removeRotor(id) { var a = _rotors(); for (var i = 0; i < a.length; i++) if (a[i] && a[i].id === id) { a.splice(i, 1); _save(); return { ok: true }; } return { ok: false, err: 'not found' }; }

    // ---- geometry of one fragment path --------------------------------------------------------
    function _frame(r) {
        var ua = _unit(r.axis);
        var rd = r.refDir || (Math.abs(ua[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
        var e1 = _unit(_sub(rd, [ua[0] * _dot(rd, ua), ua[1] * _dot(rd, ua), ua[2] * _dot(rd, ua)]));
        if (!e1) e1 = _unit(_cross(ua, [0, 1, 0])) || [1, 0, 0];
        return { a: ua, e1: e1, e2: _cross(ua, e1) };
    }
    function _hull(pts) {
        pts = pts.slice().sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
        if (pts.length < 3) return pts;
        var cr = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
        var lo = [], up = [];
        pts.forEach(function (p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
        for (var i = pts.length - 1; i >= 0; i--) { var p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
        lo.pop(); up.pop(); return lo.concat(up);
    }
    // clip polygon by n.p <= c
    function _clip(poly, n, c) {
        var out = [];
        for (var i = 0; i < poly.length; i++) {
            var A = poly[i], B = poly[(i + 1) % poly.length];
            var da = n[0] * A[0] + n[1] * A[1] - c, db = n[0] * B[0] + n[1] * B[1] - c;
            if (da <= 0) out.push(A);
            if ((da < 0 && db > 0) || (da > 0 && db < 0)) { var t = da / (da - db); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
        }
        return out;
    }
    // _partGeom(part, frame, center): the part's box in rotor coordinates: its in-plane hull and
    // its smallest elevation from the plane of rotation (para 6f: measured from the plane, from
    // the shaft centerline). A box that crosses the plane has elevation 0. Conservative.
    function _partGeom(p, F, c) {
        var cs = _corners(p.bbox).map(function (q) { var w = _sub(q, c); return { u: _dot(w, F.e1), v: _dot(w, F.e2), a: _dot(w, F.a) }; });
        var amin = Math.min.apply(null, cs.map(function (x) { return x.a; })), amax = Math.max.apply(null, cs.map(function (x) { return x.a; }));
        var rmax = Math.max.apply(null, cs.map(function (x) { return Math.sqrt(x.u * x.u + x.v * x.v); }));
        var absA = (amin <= 0 && amax >= 0) ? 0 : Math.min(Math.abs(amin), Math.abs(amax));
        var elev = rmax > 0 ? Math.atan2(absA, rmax) / D2R : (absA > 0 ? 90 : 0);
        // signed elevation range seen from the shaft centerline (for the Appendix 1 6.6 spread factor): the part's
        // (axial, radial) image lies in [amin, amax] x [rmin, rmax], so its elevations lie in this range (conservative)
        var hull = _hull(cs.map(function (x) { return [x.u, x.v]; })), rmin = _distToHull(hull);
        var eMax = amax >= 0 ? Math.atan2(amax, Math.max(rmin, 1e-9)) : Math.atan2(amax, rmax), eMin = amin <= 0 ? Math.atan2(amin, Math.max(rmin, 1e-9)) : Math.atan2(amin, rmax);
        return { hull: hull, elevDeg: elev, elMin: eMin / D2R, elMax: eMax / D2R, rmin: rmin };
    }
    // _partTrisGeom(pid, F, c): the part's real triangles projected on the plane of rotation (u, v) with their
    // axial offsets, its outline hull (for the hit order) and its elevation range from the shaft centerline
    function _partTrisGeom(pid, F, c) {
        var T = _triSource ? _triSource(pid) : null; if (!T || T.length < 9) return null;
        var tris = [], pts = [], amin = Infinity, amax = -Infinity, rmax = 0;
        for (var k = 0; k + 8 < T.length; k += 9) { var tr = [];
            for (var j = 0; j < 3; j++) { var w = [T[k + j * 3] - c[0], T[k + j * 3 + 1] - c[1], T[k + j * 3 + 2] - c[2]], u = _dot(w, F.e1), v = _dot(w, F.e2), a = _dot(w, F.a);
                tr.push([u, v]); pts.push([u, v]); if (a < amin) amin = a; if (a > amax) amax = a; rmax = Math.max(rmax, Math.hypot(u, v)); }
            tris.push(tr); }
        var hull = _hull(pts), rmin = Infinity; tris.forEach(function (tr) { rmin = Math.min(rmin, _distToHull(_hull(tr))); });
        var absA = (amin <= 0 && amax >= 0) ? 0 : Math.min(Math.abs(amin), Math.abs(amax)), elev = rmax > 0 ? Math.atan2(absA, rmax) / D2R : 90;
        var eMax = amax >= 0 ? Math.atan2(amax, Math.max(rmin, 1e-9)) : Math.atan2(amax, rmax), eMin = amin <= 0 ? Math.atan2(amin, Math.max(rmin, 1e-9)) : Math.atan2(amin, rmax);
        return { hull: hull, tris: tris, elevDeg: elev, elMin: eMin / D2R, elMax: eMax / D2R, rmin: rmin };
    }
    // the exact release-angle intervals in which the path meets one convex outline (events, then one test per interval)
    function _outlineIntervals(poly, rCg, hw, rot) {
        var ev = [0, 360].concat(_eventsOf(poly, rCg, hw)).map(function (x) { return Math.round(x * 1e9) / 1e9; }).sort(function (a, b) { return a - b; }), out = [];
        for (var i = 0; i + 1 < ev.length; i++) { var a = ev[i], b = ev[i + 1]; if (b - a < 1e-12) continue; if (_pathHit(poly, (a + b) / 2, rCg, hw, rot) < 0) continue;
            var L = out[out.length - 1]; if (L && Math.abs(L[1] - a) < 1e-9) L[1] = b; else out.push([a, b]); }
        return out;
    }
    function _unionIv(list) { list.sort(function (x, y) { return x[0] - y[0]; }); var out = []; list.forEach(function (iv) { var L = out[out.length - 1]; if (L && iv[0] <= L[1] + 1e-9) L[1] = Math.max(L[1], iv[1]); else out.push([iv[0], iv[1]]); }); return out; }
    // fragmentAxialWidth(rotor): engineer input (not from the AC); else proposed from the rotor part's CAD box along the axis, flagged
    // D2: a Step 1 confirmed field (name). The CAD proposal only pre-fills the input; until a value is entered and
    // confirmed the width is missing and the meets / average / multiple-fragment results are refused.
    function fragmentAxialWidth(r, C) {
        var cf = r.confirms && r.confirms.axialWidth && _s(r.confirms.axialWidth.by) ? r.confirms.axialWidth : null;
        if (typeof r.fragmentAxialWidthMm === 'number' && cf) return P(r.fragmentAxialWidthMm, 'engineer', null, 'fragment axial width (disc rim / blade axial width): not from the AC, engineer input, confirmed by ' + cf.by);
        if (typeof r.fragmentAxialWidthMm === 'number') return P(r.fragmentAxialWidthMm, 'unconfirmed', null, 'fragment axial width entered but not confirmed (Step 1): results that depend on it are refused until it is confirmed');
        return _fawProposal(r, C);
    }
    function _fawProposal(r, C) {
        try { var Cz = C || _C(), m = Cz && Cz.model(r.cadId), p = m && r.pid ? Cz.partsOf(m).filter(function (q) { return String(q.pid) === r.pid; })[0] : null;
            if (p && p.bbox) { var ua = _unit(r.axis), cs = _corners(p.bbox).map(function (q) { return _dot(_sub(q, r.center), ua); }); return P(_r6(Math.max.apply(null, cs) - Math.min.apply(null, cs)), 'proposed', null, 'fragment axial width proposed from the rotor part\'s CAD box along the axis: not from the AC, not yet confirmed by an engineer'); } } catch (_) {}
        return P(0, 'missing', null, 'fragment axial width not entered: enter and confirm it in Step 1');
    }
    function _distToHull(h) {   // smallest distance from the origin to a convex outline (0 when the origin is inside)
        if (!h.length) return 0; if (h.length < 3) return Math.min.apply(null, h.map(function (q) { return Math.hypot(q[0], q[1]); }));
        var inside = true, best = Infinity;
        for (var i = 0; i < h.length; i++) { var A = h[i], B = h[(i + 1) % h.length], ex = B[0] - A[0], ey = B[1] - A[1], L2 = ex * ex + ey * ey;
            if ((ex * (-A[1]) - ey * (-A[0])) < 0) inside = false;
            var t = L2 > 0 ? Math.max(0, Math.min(1, -(A[0] * ex + A[1] * ey) / L2)) : 0; best = Math.min(best, Math.hypot(A[0] + t * ex, A[1] + t * ey)); }
        return inside ? 0 : best;
    }
    // Does the path released at angle th (deg) cross the hull? Returns the distance along the path
    // to the nearest point of the part (mm) or -1.
    function _pathHit(hull, th, rCg, hw, rot) {
        var t = th * D2R, S = [rCg * Math.cos(t), rCg * Math.sin(t)];
        var d = [-Math.sin(t) * rot, Math.cos(t) * rot], n = [-d[1], d[0]];
        var poly = hull.map(function (q) { return [q[0] - S[0], q[1] - S[1]]; });
        poly = _clip(poly, [-d[0], -d[1]], 0);            // forward of the release point
        if (poly.length) poly = _clip(poly, n, hw);
        if (poly.length) poly = _clip(poly, [-n[0], -n[1]], hw);
        if (!poly.length) return -1;
        return Math.max(0, Math.min.apply(null, poly.map(function (q) { return q[0] * d[0] + q[1] * d[1]; })));
    }

    // ---- exact translational risk angles (Appendix 1 5.5 to 6.4) -----------------------------
    // A path released at angle th hits a part when the part's outline meets the half strip
    // { q : |q.u(th) - rCg| <= hw, rot (q.t(th)) >= 0 } (u radial, t tangential): the fragment
    // c.g. moves along the tangent to the centroid locus, sweeping a path of half-width hw.
    // The set of hitting angles changes only at closed-form events: a vertex q on a strip edge
    // (|q| cos(th - phi) = rCg +/- hw), a vertex on the release line (q.t = 0), or a strip corner
    // ((rCg +/- hw) u) on an outline edge. Between consecutive events the answer is constant, so
    // it is decided once at the midpoint with the exact clipping test (_pathHit). No sampling: a
    // target narrower than any step is not missed.
    function _norm360(x) { x = x % 360; return x < 0 ? x + 360 : x; }
    function _eventsOf(hull, rCg, hw) {
        var ev = [];
        hull.forEach(function (q) { var rq = Math.hypot(q[0], q[1]), ph = Math.atan2(q[1], q[0]) / D2R;
            if (rq > 0) [rCg - hw, rCg + hw].forEach(function (c) { var x = c / rq; if (x >= -1 && x <= 1) { var a = Math.acos(x) / D2R; ev.push(_norm360(ph + a), _norm360(ph - a)); } });
            ev.push(_norm360(ph + 90), _norm360(ph - 90)); });
        for (var i = 0; i < hull.length; i++) { var A = hull[i], B = hull[(i + 1) % hull.length], nx = B[1] - A[1], ny = A[0] - B[0], nl = Math.hypot(nx, ny); if (!(nl > 0)) continue;
            var bb = (nx * A[0] + ny * A[1]) / nl, ps = Math.atan2(ny, nx) / D2R;
            [rCg - hw, rCg + hw].forEach(function (k) { if (Math.abs(k) < 1e-12) return; var x = bb / k; if (x >= -1 && x <= 1) { var a = Math.acos(x) / D2R; ev.push(_norm360(ps + a), _norm360(ps - a)); } }); }
        return ev;
    }
    // exactIntervals(parts, rCg, hw, rot): elementary angle intervals [from, to) covering 0..360,
    // each with the parts its paths hit (constant inside the interval)
    // With triangles, a part's angle set is the union of each triangle's exact intervals (exact for the real
    // shape projected on the plane, concave parts included); without, its box outline's (convex) intervals.
    function exactIntervals(parts, rCg, hw, rot) {
        var ivOf = {}; parts.forEach(function (p) { if (p.tris) { var L = []; p.tris.forEach(function (tr) { L = L.concat(_outlineIntervals(tr, rCg, hw, rot)); }); ivOf[p.pid] = _unionIv(L); } });
        var ev = [0, 360]; parts.forEach(function (p) { if (ivOf[p.pid]) ivOf[p.pid].forEach(function (iv) { ev.push(iv[0], iv[1]); }); else ev = ev.concat(_eventsOf(p.hull, rCg, hw)); });
        ev = ev.map(function (x) { return Math.round(x * 1e9) / 1e9; }).sort(function (a, b) { return a - b; });
        var u = []; ev.forEach(function (x) { if (!u.length || x - u[u.length - 1] > 1e-9) u.push(x); });
        var out = [];
        for (var i = 0; i + 1 < u.length; i++) { var a = u[i], b = u[i + 1], mid = (a + b) / 2, hits = [];
            parts.forEach(function (p) {
                if (ivOf[p.pid]) { if (!ivOf[p.pid].some(function (iv) { return mid >= iv[0] && mid <= iv[1]; })) return; var t1 = _pathHit(p.hull, mid, rCg, hw, rot); hits.push({ pid: p.pid, t: t1 >= 0 ? t1 : 0 }); return; }
                var t = _pathHit(p.hull, mid, rCg, hw, rot); if (t >= 0) hits.push({ pid: p.pid, t: t }); });
            hits.sort(function (x, y) { return x.t - y.t || _cmp(x.pid, y.pid); });
            out.push({ from: a, to: b, width: b - a, hits: hits }); }
        return out;
    }

    // ---- the 360 degree release-angle sweep ---------------------------------------------------
    // sweep(rotorId[, {step, models, cadId, basis}]): for each fragment model and each release
    // angle (0 <= angle < 360, measured from the rotor's reference direction in the direction of
    // rotation), which parts the path hits (nearest first, stopped at a credited shield), the
    // equipment confirmed on them, the failure conditions reached and the worst severity; then
    // the Catastrophic and Hazardous release-angle ranges and the AC 20-128A hazard ratio.
    var SEV_ORDER = ['Catastrophic', 'Hazardous', 'Major', 'Minor', 'No Safety Effect'];
    function sweep(rotorId, opts) {
        opts = opts || {};
        var C = _C(), r = rotor(rotorId);
        if (!r) return { ok: false, err: 'Rotor not found or not confirmed. A rotor goes into the analysis only after the engineer confirms it.' };
        if (!C) return { ok: false, err: 'The CAD / zonal engine is not loaded; no result is given rather than a guess.' };
        if (!r.confirmedBy) return { ok: false, err: 'Rotor ' + r.id + ' is not confirmed by an engineer.' };
        var cadId = opts.cadId || r.cadId || C.latestCadId(), m = C.model(cadId);
        if (!m) return { ok: false, err: 'No CAD model to sweep.' };
        var step = (typeof opts.step === 'number' && opts.step > 0 && 360 / opts.step === Math.round(360 / opts.step)) ? opts.step : 1;
        var F = _frame(r), conf = C.confirmed(cadId), shields = {}; r.shields.forEach(function (s) { shields[s] = 1; });
        var basis = _s(opts.basis || _projBasis()).toLowerCase();
        var p23nc = _p23nc(basis), FAW = fragmentAxialWidth(r, C), fawOk = FAW.source === 'engineer';
        if (!fawOk) FAW = P(0, FAW.source === 'unconfirmed' ? 'unconfirmed' : 'missing', null, FAW.source === 'proposed' ? 'fragment axial width not entered (the CAD box proposes ' + FAW.value + ' mm: pre-fills the Step 1 input only): angles shown with no thickness; the risk results are refused until it is entered and confirmed' : FAW.note);
        var parts = C.partsOf(m).filter(function (p) { return p && p.bbox && String(p.pid) !== r.pid; }).slice().sort(function (a, b) { return _cmp(a.pid, b.pid); })
            .map(function (p) { var g = _partTrisGeom(String(p.pid), F, r.center) || _partGeom(p, F, r.center);
                // R9: the fragment has an axial width; a part is reached when any of the fragment's thickness meets it, so its
                // elevation interval grows by the angle the fragment half-width subtends at the part's nearest distance
                var ext = FAW.value > 0 ? Math.atan2(FAW.value / 2, Math.max(g.rmin || 0, 1e-9)) / D2R : 0;
                return { pid: String(p.pid), name: p.name || String(p.pid), hull: g.hull, tris: g.tris || null, elevDeg: g.elevDeg, elMin: g.elMin - ext, elMax: g.elMax + ext, axialExtDeg: ext }; });
        var outline = parts.some(function (p) { return p.tris; }) ? (parts.every(function (p) { return p.tris; }) ? 'the parts\' own triangles' : 'the parts\' own triangles where loaded, box corners otherwise') : 'the part box corners (no triangles loaded)';
        var cache = {};
        var impactOf = function (eq) { var k = eq.join('|'); if (!cache[k]) cache[k] = eq.length ? C.impactOfEquipment(eq) : { conditions: [], worst: null, functions: [], systems: [], equipment: [] }; return cache[k]; };
        var models = (opts.models || FRAGMENT_ORDER).filter(function (k) { var fm = FRAGMENT_MODELS[k]; return fm && !(fm.fanOnly && r.kind !== 'fan' && !opts.models); });   // asked for by name (Step 2), the fan blade runs on any rotor
        var results = models.map(function (k) {
            var fm = FRAGMENT_MODELS[k], g = fm.geom(r.discRadius, r.bladeLength);
            var spread = (r.spreadOverride && typeof r.spreadOverride[k] === 'number') ? P(r.spreadOverride[k], 'engineer') : fm.spread;
            var inBand = parts.filter(function (p) { return p.elMax >= -spread.value - 1e-9 && p.elMin <= spread.value + 1e-9; });
            var angles = [];
            for (var i = 0; i * step < 360; i++) {
                var th = _r6(i * step), hits = [];
                inBand.forEach(function (p) { var t = _pathHit(p.hull, th, g.rCg.value, g.halfWidth.value, r.rotation); if (t >= 0) hits.push({ pid: p.pid, t: _r6(t) }); });
                hits.sort(function (a, b) { return a.t - b.t || _cmp(a.pid, b.pid); });
                var stop = -1; for (var j = 0; j < hits.length; j++) if (shields[hits[j].pid]) { stop = j; break; }
                var stoppedBy = stop >= 0 ? hits[stop].pid : null;
                if (stop >= 0) hits = hits.slice(0, stop + 1);
                var eq = []; hits.forEach(function (h) { var s = conf[h.pid]; if (s && eq.indexOf(s) < 0) eq.push(s); }); eq.sort(_cmp);
                var im = impactOf(eq);
                angles.push({ angle: th, pids: hits.map(function (h) { return h.pid; }), stoppedBy: stoppedBy, equipment: eq,
                              conditions: im.conditions.map(function (c) { return c.fcId || c.id; }), worst: im.worst || null });
            }
            // exact: elementary angle intervals, the hit set constant in each (the sampled angles above are for display only)
            var EX = exactIntervals(inBand, g.rCg.value, g.halfWidth.value, r.rotation).map(function (iv) {
                var hits = iv.hits, stop = -1; for (var j = 0; j < hits.length; j++) if (shields[hits[j].pid]) { stop = j; break; }
                if (stop >= 0) hits = hits.slice(0, stop + 1);
                var eq = []; hits.forEach(function (h) { var s2 = conf[h.pid]; if (s2 && eq.indexOf(s2) < 0) eq.push(s2); }); eq.sort(_cmp);
                // Appendix 1 6.6 spread factor: the share of the spread (-s..+s) over which the hits make the catastrophe;
                // a part is hit at elevation psi when psi is inside its elevation range (one fragment: one psi for all parts)
                var sv = spread.value, cuts = [-sv, sv], byPid = {}; inBand.forEach(function (p) { byPid[p.pid] = p; });
                hits.forEach(function (h) { var p = byPid[h.pid]; [p.elMin, p.elMax].forEach(function (x) { if (x > -sv && x < sv) cuts.push(x); }); });
                cuts.sort(function (a2, b2) { return a2 - b2; }); var catPsi = 0, cells = [];
                for (var c2 = 0; c2 + 1 < cuts.length; c2++) { var lo = cuts[c2], hi = cuts[c2 + 1]; if (hi - lo < 1e-12) continue; var mid = (lo + hi) / 2;
                    var hp = hits.filter(function (h) { var p = byPid[h.pid]; return mid >= p.elMin && mid <= p.elMax; });
                    var st2 = -1; for (var j2 = 0; j2 < hp.length; j2++) if (shields[hp[j2].pid]) { st2 = j2; break; } if (st2 >= 0) hp = hp.slice(0, st2 + 1);
                    var eq2 = []; hp.forEach(function (h) { var s3 = conf[h.pid]; if (s3 && eq2.indexOf(s3) < 0) eq2.push(s3); }); eq2.sort(_cmp);
                    cells.push({ w: (hi - lo) / (2 * sv), eq: eq2 });
                    // Appendix 1 6.8: a case catastrophic only in some flight phases is factored by the share of failures
                    // in those phases; per failure condition (engineer input with reason), default 1.0 (every phase)
                    var im2 = impactOf(eq2); if ((im2.worst || null) === 'Catastrophic') { var ph = 0; im2.conditions.forEach(function (c) { if (c.severity === 'Catastrophic') ph = Math.max(ph, phaseFactorOf(c.fcId || c.id)); }); catPsi += (hi - lo) * ph; } }
                return { from: iv.from, to: iv.to, width: iv.width, pids: hits.map(function (h) { return h.pid; }), equipment: eq, worst: impactOf(eq).worst || null, spreadFactor: sv > 0 ? catPsi / (2 * sv) : 0, cells: cells }; });
            var ranges = _exactRanges(EX);
            var catDeg = _r6(EX.filter(function (a) { return a.worst === 'Catastrophic'; }).reduce(function (s2, a) { return s2 + a.width; }, 0));
            var crit = fm.criterion.value == null ? null : (p23nc ? fm.criterion.value * 2 : fm.criterion.value);
            // Appendix 1 6.5 to 6.9: P = sum over angle intervals of (angle / 360) x spread factor (6.6) x flight phase factor (6.8) x risk factor (6.9)
            var pf = _pc().praPhaseFactors || {}, pfk = Object.keys(pf).sort(_cmp);
            var phase = P(1, pfk.length ? 'engineer' : 'ac', pfk.length ? null : 'ac20128a-app1-6-8-1', pfk.length ? 'applied per failure condition inside the spread factor: ' + pfk.map(function (k) { return k + ' ' + pf[k].value + ' (' + pf[k].reason + ', ' + pf[k].by + ')'; }).join('; ') : 'every catastrophic case taken as catastrophic in every flight phase: the 6.8.1 distribution sums to 100%');
            var risk = (r.riskFactor && typeof r.riskFactor.value === 'number') ? P(r.riskFactor.value, 'engineer', 'ac20128a-app1-6-9', 'engineer input (Appendix 1 6.9): ' + r.riskFactor.reason + ' (' + r.riskFactor.by + ')') : P(1, 'ac', 'ac20128a-app1-6-9', 'default 1.0 (no lower risk factor substantiated)');
            var weightedDeg = EX.reduce(function (s2, a) { return s2 + a.width * a.spreadFactor; }, 0);
            var ratio = _r6(weightedDeg / 360 * phase.value * risk.value);
            // energy: only where a shield or structure is credited (the AC treats the fragment as
            // having infinite energy otherwise)
            var energy = null;
            if (r.shields.length) {
                var mass = (fm.massFraction.value != null && r.bladedDiscMassKg) ? P(_r6(fm.massFraction.value * r.bladedDiscMassKg), 'derived', fm.massFraction.ref, 'fraction of the engineer entered bladed disc mass') : P(null, 'missing', null, r.bladedDiscMassKg ? fm.massFraction.note || 'no mass fraction for this fragment' : 'bladed disc mass not entered');
                var speed = r.rpm ? P(_r6(r.rpm * 2 * Math.PI / 60 * g.rCg.value / 1000), 'derived', g.rCg.ref, 'engineer entered speed times the c.g. radius') : P(null, 'missing', null, 'rotor speed not entered');
                energy = { massKg: mass, speedMs: speed, joules: (mass.value != null && speed.value != null) ? P(_r6(0.5 * mass.value * speed.value * speed.value), 'derived', 'ac20128a-9a', '1/2 m v^2: translational energy per AC 20-128A 9a; rotational energy (about 0.65x for a uniform 120 deg sector) not included') : P(null, 'missing', null, 'mass or speed missing') };
            }
            return { model: k, label: fm.label, spreadDeg: spread, fragmentAxialWidthMm: FAW, rCgMm: g.rCg, halfWidthMm: g.halfWidth, maxDimensionMm: g.maxDimension, massFraction: fm.massFraction,
                     angles: angles, ranges: ranges, catastrophicDeg: catDeg, intervals: EX, spreadWeightedDeg: _r6(weightedDeg), phaseFactor: phase, riskFactor: risk, hazardRatio: ratio,
                     criterion: crit == null ? null : { value: crit, ref: p23nc ? 'ac20128a-10c4' : fm.criterion.ref, text: '1 in ' + Math.round(1 / crit) },
                     meets: crit == null || !fawOk ? null : ratio <= crit + 1e-12, refusedNote: fawOk ? null : 'Not assessed: the fragment axial width is not entered and confirmed in Step 1 (D2).',
                     assessmentNote: crit == null ? 'No numerical risk assessment is requested for this fragment (AC 20-128A para 10c(5)); the exposed angles are listed for the design precautions.' : null,
                     energy: energy, energyNote: r.shields.length ? null : 'No shield credited: the fragment is treated as having infinite energy (AC 20-128A appendix (a)).' };
        });
        return { ok: true, rotorId: r.id, label: r.label, cadId: cadId, step: step, basis: basis || null, criterionDoubled: p23nc,
                 method: 'Path from the fragment c.g. at release, tangential to the centroid locus in the direction of rotation (Appendix 1 4.1(a)); part outlines from ' + outline + ' projected on the plane of rotation (with triangles: the union of each triangle\'s exact angle intervals, exact for the real shape; the hit order inside an interval from the outline hull); spread from the plane at the shaft centerline (para 6f); release uniformly distributed (Appendix 1 6.5). Translational risk angles are exact: the angle intervals where the swept path meets each outline, from closed-form events (Appendix 1 5.5); the ' + step + ' degree list is for display only.',
                 models: results, nonMonotone: Object.keys(cache).some(function (k) { return cache[k].nonMonotone; }) ? 'non-monotone tree: worst case over subsets used' : null };
    }
    // setRiskFactor(rotorId, value, reason, by): Appendix 1 6.9 risk factor (probability of catastrophe given the hit), 0..1, with a reason
    function setRiskFactor(rotorId, value, reason, by, opts) {
        opts = opts || {}; var r = _rotors().filter(function (x) { return x && x.id === rotorId; })[0]; if (!r) return { ok: false, err: 'Rotor not found.' };
        if (!_s(by)) return { ok: false, err: 'A risk factor needs the name of the engineer.' };
        if (value == null) { r.riskFactor = null; _save(); return { ok: true }; }
        if (typeof value !== 'number' || !(value >= 0 && value <= 1)) return { ok: false, err: 'The risk factor is a probability between 0 and 1.' };
        if (_s(reason).length < 10) return { ok: false, err: 'Write why the probability of catastrophe is lower (at least a sentence; Appendix 1 6.9).' };
        r.riskFactor = { value: value, reason: _s(reason), by: _s(by), at: opts.at || new Date().toISOString() }; _save(); return { ok: true };
    }
    // setUnmodeledStagesHarmless(rotorId, reason, by): the engineer confirms the engine's stages that are not modeled cannot reach
    // anything (they then count as zero risk in the 6.11(d) average); null reason withdraws it
    function setUnmodeledStagesHarmless(rotorId, reason, by, opts) {
        opts = opts || {}; var r = _rotors().filter(function (x) { return x && x.id === rotorId; })[0]; if (!r) return { ok: false, err: 'Rotor not found.' };
        if (!_s(by)) return { ok: false, err: 'This confirmation needs the name of the engineer.' };
        if (reason == null) { r.unmodeledStagesHarmless = null; _save(); return { ok: true }; }
        if (_s(reason).length < 10) return { ok: false, err: 'Write why the stages not modeled cannot reach anything (at least a sentence).' };
        r.unmodeledStagesHarmless = { reason: _s(reason), by: _s(by), at: opts.at || new Date().toISOString() }; _save(); return { ok: true };
    }
    // setPhaseFactor(fcId, value, reason, by): the share of failures (6.8.1 distribution) in the flight phases where this
    // failure condition is catastrophic; null clears it. Engineer input with a reason; the 6.8.1 table is quoted in the refs.
    var PHASES_681 = [['Take-off before V1', 0.35], ['V1 to first power reduction', 0.20], ['Climb', 0.22], ['Cruise', 0.14], ['Descent', 0.03], ['Approach', 0.02], ['Landing/Reverse', 0.04]];
    function phaseFactorOf(fcId) { var f = (_pc().praPhaseFactors || {})[fcId]; return f && typeof f.value === 'number' ? f.value : 1; }
    function setPhaseFactor(fcId, value, reason, by, opts) {
        opts = opts || {}; var pc = _pc(); if (!pc.praPhaseFactors) pc.praPhaseFactors = {};
        if (!_s(by)) return { ok: false, err: 'A flight phase factor needs the name of the engineer.' };
        if (value == null) { delete pc.praPhaseFactors[fcId]; _save(); return { ok: true }; }
        if (typeof value === 'number' && Array.isArray(value) === false && !(value >= 0 && value <= 1)) return { ok: false, err: 'The factor is a share between 0 and 1.' };
        var v = value; if (Array.isArray(value)) { v = 0; value.forEach(function (n) { var q = PHASES_681.filter(function (x) { return x[0] === n; })[0]; if (q) v += q[1]; }); v = _r6(v); }
        if (_s(reason).length < 10) return { ok: false, err: 'Write why this failure condition is catastrophic only in those phases (at least a sentence).' };
        pc.praPhaseFactors[fcId] = { value: v, phases: Array.isArray(value) ? value.slice() : null, reason: _s(reason), by: _s(by), at: opts.at || new Date().toISOString() }; _save(); return { ok: true, value: v };
    }
    // ---- para 10c(3)(iii): three one-third disc fragments in three independent random directions
    // (uniform over 360 degrees, spread +/-3 degrees). Exact by enumeration: each fragment lands in an
    // (angle interval x elevation interval) cell with probability (angle width / 360) x (elevation
    // width / 6 degrees) and hits that cell's equipment set; the three are independent, so
    // P = sum over every triple of equipment sets of p(S1) p(S2) p(S3), counted when the union of
    // the three sets makes a Catastrophic failure condition. Criterion 1 in 10.
    function multipleFragments(rotorId, opts) {
        opts = opts || {}; var sw = sweep(rotorId, { models: ['oneThirdDisc'], cadId: opts.cadId, step: 10 }); if (!sw.ok) return sw;
        if (sw.models[0].fragmentAxialWidthMm.source !== 'engineer') return { ok: false, err: 'Confirm the fragment axial width in Step 1 first: the multiple-fragment risk depends on it.' };
        var C = _C(), mo = sw.models[0], dist = {}, keys = [];
        mo.intervals.forEach(function (iv) { iv.cells.forEach(function (c) { var k = c.eq.join('|'), p = iv.width / 360 * c.w; if (!(k in dist)) { dist[k] = 0; keys.push(k); } dist[k] += p; }); });
        var tot = keys.reduce(function (s2, k) { return s2 + dist[k]; }, 0); if (tot < 1) { if (!('' in dist)) { dist[''] = 0; keys.push(''); } dist[''] += 1 - tot; }   // the rest of the sphere of directions: nothing hit
        // applicability (10c(3)(iii)): only systems whose channels all have some part within the diameter of the
        // largest bladed rotor, measured from the engine centerline (here: this rotor's axis line)
        var r0 = rotor(rotorId), F0 = _frame(r0), conf0 = C.confirmed(sw.cadId), dia = 0; rotors().forEach(function (x) { if (x.id === r0.id || (r0.engine && x.engine === r0.engine)) dia = Math.max(dia, 2 * (x.discRadius + (x.bladeLength || 0))); });   // the largest bladed rotor of the same engine
        var eqDist = {}; C.partsOf(C.model(sw.cadId)).forEach(function (p) { var e = conf0[String(p.pid)]; if (!e || !p.bbox) return; var g = _partTrisGeom(String(p.pid), F0, r0.center) || _partGeom(p, F0, r0.center), d = _distToHull(g.hull); eqDist[e] = Math.min(eqDist[e] == null ? Infinity : eqDist[e], d); });
        var within = function (e) { return eqDist[e] != null && eqDist[e] <= dia + 1e-9; }, excluded = {};
        var cat = {}, P = 0, sets = keys.map(function (k) { return k ? k.split('|') : []; });
        for (var i = 0; i < keys.length; i++) for (var j = 0; j < keys.length; j++) for (var k2 = 0; k2 < keys.length; k2++) {
            var u = {}; sets[i].concat(sets[j], sets[k2]).forEach(function (e) { u[e] = 1; }); var eq = Object.keys(u).sort(_cmp), key = eq.join('|');
            // R16: a combination counts when its channels within one rotor diameter are catastrophic on their own (some minimal cut
            // set lies entirely within the distance; the fault tree is monotone); items farther out never cancel it
            if (!(key in cat)) { var inW = eq.filter(within); cat[key] = inW.length ? ((C.impactOfEquipment(inW).worst || null) === 'Catastrophic') : false;
                if (!cat[key] && eq.length && (C.impactOfEquipment(eq).worst || null) === 'Catastrophic') eq.filter(function (e) { return !within(e); }).forEach(function (e) { excluded[e] = 1; }); }
            if (cat[key]) P += dist[keys[i]] * dist[keys[j]] * dist[keys[k2]]; }
        var basis = _s(opts.basis || _projBasis()).toLowerCase(), p23nc = _p23nc(basis), crit = p23nc ? 0.2 : 0.1;
        return { ok: true, probability: _r6(P), largestRotorDiameterMm: _r6(dia), notApplicable: Object.keys(excluded).sort(_cmp).map(function (e) { return { equipment: e, distanceMm: _r6(eqDist[e]) }; }), criterion: { value: crit, ref: p23nc ? 'ac20128a-10c4' : 'ac20128a-10c3iii', text: '1 in ' + Math.round(1 / crit) }, meets: P <= crit + 1e-12,
                 method: 'Applies only to systems whose channels all have a part within the largest bladed rotor diameter of the engine centerline (combinations with a channel farther out are not counted and are listed). Exact enumeration over equipment sets: each of three independent fragments lands in an (angle x elevation) cell of the exact intervals; P = sum of p(S1) p(S2) p(S3) over triples whose union is Catastrophic (para 10c(3)(iii)).', refs: [ref('ac20128a-10c3iii')] };
    }
    // ---- para 10e and Appendix 1 6.11: averages and criteria (Table 1)
    // averageRisk({ engineOf: { rotorId: engine }, alternate: bool }): per engine the average over its stages, the
    // airplane the average over its engines; 1/3 disc 1 in 20, intermediate 1 in 40, or the alternate model alone
    // (9c replaces 9a and 9b) 1 in 20; any single stage at most twice the average criterion; non-commuter Part 23 x 2.
    function averageRisk(opts) {
        opts = opts || {}; var rs = rotors(), models = opts.alternate ? ['alternate'] : ['oneThirdDisc', 'intermediate'];
        var basis = _s(opts.basis || _projBasis()).toLowerCase(), p23nc = _p23nc(basis);
        var out = models.map(function (k) {
            var fm = FRAGMENT_MODELS[k], crit = (p23nc ? 2 : 1) * fm.criterion.value, eng = {}, stages = [];
            var nst = {}, harmless = {}, problems = [];
            rs.forEach(function (r) { var sw = sweep(r.id, { models: [k], cadId: opts.cadId, step: 10 }); if (!sw.ok) return;
                if (sw.models[0].fragmentAxialWidthMm.source !== 'engineer') { problems.push('rotor ' + (r.label || r.id) + ': fragment axial width not entered and confirmed in Step 1'); return; } var e = (opts.engineOf && opts.engineOf[r.id]) || r.engine, h = sw.models[0].hazardRatio;
                if (!e) { problems.push('rotor ' + r.label + ' has no engine entered (Step 1)'); return; }
                if (r.engineStages) nst[e] = Math.max(nst[e] || 0, r.engineStages); if (r.unmodeledStagesHarmless) harmless[e] = r.unmodeledStagesHarmless;
                (eng[e] = eng[e] || []).push(h); stages.push({ rotorId: r.id, engine: e, ratio: h, meetsSingle: h <= 2 * crit + 1e-12 }); });
            // Appendix 1 6.11(d): average over ALL stages of the engine; stages not modeled count as zero only when the
            // engineer confirmed they cannot reach anything; otherwise the average is refused (no silent guess)
            var E = Object.keys(eng).sort(_cmp).map(function (e) { var L = eng[e], n = nst[e] || null, sum = L.reduce(function (a, b) { return a + b; }, 0);
                if (!n) { problems.push('engine ' + e + ': total number of stages not entered'); return { engine: e, stages: L.length, average: null }; }
                if (n > L.length && !harmless[e]) { problems.push('engine ' + e + ': ' + (n - L.length) + ' stage(s) not modeled and not confirmed unable to reach anything'); return { engine: e, stages: n, modeled: L.length, average: null }; }
                return { engine: e, stages: n, modeled: L.length, average: _r6(sum / Math.max(n, L.length)), unmodeled: n > L.length ? harmless[e] : null }; });
            var avg = E.length && E.every(function (x) { return x.average != null; }) && !problems.length ? _r6(E.reduce(function (a, x) { return a + x.average; }, 0) / E.length) : null;
            return { model: k, label: fm.label, engines: E, stages: stages, airplaneAverage: avg, problems: problems, criterion: { value: crit, text: '1 in ' + Math.round(1 / crit), ref: p23nc ? 'ac20128a-10c4' : 'ac20128a-app1-table1' },
                     meetsAverage: avg == null ? null : avg <= crit + 1e-12, meetsEverySingle: stages.every(function (x) { return x.meetsSingle; }) };
        });
        return { ok: true, alternate: !!opts.alternate, models: out, method: 'Appendix 1 6.11 (d) and (e): stages averaged per engine, engines averaged per airplane; Table 1 criteria; any single stage at most twice the average criterion' + (opts.alternate ? '; the alternate model (para 9c) replaces 9a and 9b' : '') + '.', refs: [ref('ac20128a-app1-6-11'), ref('ac20128a-app1-table1')] };
    }
    function _exactRanges(EX) {
        var out = [];
        ['Catastrophic', 'Hazardous'].forEach(function (sev) {
            var R0 = []; EX.forEach(function (iv) { if (iv.worst !== sev) return; var L = R0[R0.length - 1]; if (L && Math.abs(L.toDeg - iv.from) < 1e-9) { L.toDeg = iv.to; L.widthDeg = L.toDeg - L.fromDeg; } else R0.push({ severity: sev, fromDeg: iv.from, toDeg: iv.to, widthDeg: iv.width }); });
            if (R0.length > 1 && R0[0].fromDeg === 0 && Math.abs(R0[R0.length - 1].toDeg - 360) < 1e-9) { var last = R0.pop(); R0[0].fromDeg = last.fromDeg; R0[0].widthDeg += last.widthDeg; }
            R0.forEach(function (x) { x.fromDeg = _r6(x.fromDeg); x.toDeg = _r6(x.toDeg); x.widthDeg = _r6(x.widthDeg); out.push(x); });
        });
        return out;
    }
    function _ranges(angles, step) {
        var out = [];
        ['Catastrophic', 'Hazardous'].forEach(function (sev) {
            var on = angles.map(function (a) { return a.worst === sev; }), n = on.length;
            if (!on.some(Boolean)) return;
            if (on.every(Boolean)) { out.push({ severity: sev, fromDeg: 0, toDeg: 360, widthDeg: 360 }); return; }
            var start = 0; while (on[start]) start = (start + 1) % n;   // begin just after a run ends
            for (var k = 0; k < n; k++) {
                var i = (start + k) % n;
                if (on[i] && !on[(i - 1 + n) % n]) {
                    var len = 0; while (on[(i + len) % n] && len < n) len++;
                    out.push({ severity: sev, fromDeg: angles[i].angle, toDeg: _r6(((angles[i].angle + len * step) % 360)), widthDeg: len * step });
                }
            }
        });
        return out.sort(function (a, b) { return SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || a.fromDeg - b.fromDeg; });
    }

    // ---- bird strike parameters by certification basis ---------------------------------------
    var LB = 0.45359237;
    var BIRD_CASES = {
        part25: [
            { id: 'windshield', label: 'Windshield panes in front of the pilots', massKg: P(4 * LB, 'rule', 'cfr-25.775b'), massLb: 4, speed: 'Vc at sea level' },
            { id: 'structure', label: 'Structure (discrete source damage tolerance)', massKg: P(4 * LB, 'rule', 'cfr-25.571e1'), massLb: 4, speed: 'Vc at sea level or 0.85 Vc at 8,000 ft, whichever is more critical' },
            { id: 'empennage', label: 'Empennage structure', massKg: P(8 * LB, 'rule', 'cfr-25.631'), massLb: 8, speed: 'Vc at sea level' }
        ],
        part23: [
            { id: 'windshield', label: 'Windshield in front of the pilot (level 4)', massKg: P(2 * LB, 'rule', 'cfr-23.2320b'), massLb: 2, speed: 'maximum approach flap speed' },
            { id: 'structure', label: 'Other structure', massKg: P(null, 'missing', null, 'not set by the Part 23 rule text; the accepted means (ASTM) is not in the knowledge base: engineer to enter with its source'), speed: 'engineer to enter' }
        ],
        part29: [ { id: 'rotorcraft', label: 'Rotorcraft (whole aircraft)', massKg: P(1.0, 'rule', 'cfr-29.631'), massLb: 2.2, speed: 'the lesser of VNE or VH at altitudes up to 8,000 ft' } ],
        part27: [ { id: 'rotorcraft', label: 'Rotorcraft', massKg: P(null, 'missing', null, 'no bird strike section found in Part 27 rule text (eCFR, 2026-09-01); engineer to enter with its source'), speed: 'engineer to enter' } ],
        'sc-vtol': [ { id: 'vtol', label: 'VTOL aircraft', massKg: P(null, 'unverified', null, 'EASA SC-VTOL text is not in the knowledge base; engineer to enter with its source'), speed: 'engineer to enter' } ]
    };
    // parseBasis(text): the part number is read only as the whole token right after "Part", "CS-", "FAR" or
    // "14 CFR Part"; amendment numbers ("Amdt 25-129", "Amendment 23") are ignored. Two different parts, or a
    // part this tool does not cover (e.g. Part 125), give no key and a question for the engineer: no silent guess.
    var BASIS_PARTS = { 23: 'part23', 25: 'part25', 27: 'part27', 29: 'part29' };
    function parseBasis(basis) {
        var t = _s(basis), b = t.toLowerCase();
        if (!t) return { key: null, parts: [], err: 'No certification basis is set: enter it (for example "14 CFR Part 25").' };
        if (/\bsc[-\s]?vtol\b/.test(b)) return { key: 'sc-vtol', parts: ['SC-VTOL'], commuter: false };
        var re = /\b(?:14\s*cfr\s+part|part|far(?:\s+part)?|cs)\s*-?\s*(\d+)(?![\d-])/g, m, found = [];
        while ((m = re.exec(b))) { var n = +m[1]; if (found.indexOf(n) < 0) found.push(n); }
        if (!found.length) return { key: null, parts: [], err: 'The certification basis "' + t + '" names no Part, CS or FAR number this tool can read: please enter it as, for example, "14 CFR Part 25".' };
        if (found.length > 1) return { key: null, parts: found, ambiguous: true, err: 'The certification basis "' + t + '" names more than one part (' + found.join(', ') + '): please say which one applies.' };
        if (!BASIS_PARTS[found[0]]) return { key: null, parts: found, err: 'The certification basis "' + t + '" is Part ' + found[0] + ', which this analysis does not cover (Parts 23, 25, 27 and 29): please check it.' };
        return { key: BASIS_PARTS[found[0]], parts: found, commuter: /\bcommuter\b/.test(b) && !/\bnon[-\s]?commuter\b/.test(b) };
    }
    function basisKey(basis) { return parseBasis(basis).key; }
    function _p23nc(basis) { var pb = parseBasis(basis); return pb.key === 'part23' && !pb.commuter; }
    // birdCases(basis, speeds): speeds { caseId: m/s } engineer entered. Energy = 1/2 m v^2.
    function birdCases(basis, speeds, opts) {
        speeds = speeds || {}; opts = opts || {};
        var k = basisKey(basis);
        if (!k) { var pb = parseBasis(basis); return { ok: false, err: pb.err + ' Bird mass and speed stay missing until then.', ambiguous: !!pb.ambiguous, basis: basis || null }; }
        // B5: the Part 23 windshield case (23.2320(b)) applies to level 4 airplanes only: offered only when level 4 is confirmed
        return { ok: true, basis: k, level4: k === 'part23' ? !!opts.level4 : null, cases: BIRD_CASES[k].filter(function (c) { return !(k === 'part23' && c.id === 'windshield' && !opts.level4); }).map(function (c) {
            var v = typeof speeds[c.id] === 'number' && speeds[c.id] > 0 ? P(speeds[c.id], 'engineer') : P(null, 'missing', null, 'enter ' + c.speed + ' (m/s)');
            var m = c.massKg.value == null ? c.massKg : P(_r6(c.massKg.value), c.massKg.source, c.massKg.ref);
            return { id: c.id, label: c.label, massKg: m, massLb: c.massLb || null, speedRule: c.speed, speedMs: v,
                     energyJ: (m.value != null && v.value != null) ? P(_r6(0.5 * m.value * v.value * v.value), 'derived', m.ref, '1/2 m v^2') : P(null, 'missing', null, 'mass or speed missing') };
        }) };
    }


    // ---- shared: parts, links, zones, impact -------------------------------------------------
    function _ctx(cadId) {
        var C = _C(); if (!C) return null;
        cadId = cadId || C.latestCadId(); var m = C.model(cadId); if (!m) return null;
        var parts = C.partsOf(m).filter(function (p) { return p && p.bbox; }).slice().sort(function (a, b) { return _cmp(a.pid, b.pid); });
        var zoneOf = {}; try { C.containment(cadId).parts.forEach(function (r) { zoneOf[r.pid] = r.zoneId; }); } catch (_) {}
        return { C: C, cadId: cadId, parts: parts, conf: C.confirmed(cadId), zoneOf: zoneOf };
    }
    function _zoneLabel(zid) { var Z = root.ZONES, z = zid && Z ? Z.get(zid) : null; return z ? ((z.code ? z.code + ' ' : '') + (z.name || '')).trim() : null; }
    function _impactFor(X, pids) {
        var eq = []; pids.forEach(function (pid) { var s = X.conf[pid]; if (s && eq.indexOf(s) < 0) eq.push(s); }); eq.sort(_cmp);
        var im = eq.length ? X.C.impactOfEquipment(eq) : { conditions: [], worst: null, functions: [], systems: [] };
        return { equipment: eq, conditions: im.conditions.map(function (c) { return { fcId: c.fcId || c.id, desc: c.desc, severity: c.severity }; }), worst: im.worst || null, nonMonotone: im.nonMonotone ? im.nonMonotone.note : null,
                 functions: _arr(im.functions).map(function (f) { return f.systemId + '/' + f.funcId; }),
                 unlinkedParts: pids.filter(function (pid) { return !X.conf[pid]; }) };
    }
    // shared exposure of redundant elements: two items of equipment hit together that sit under
    // different inputs of one AND gate (SLCadZonal.independenceFlags logic, restricted to a set)
    function _sharedExposure(eq) {
        var C = _C(); if (!C || eq.length < 2) return [];
        var want = {}; eq.forEach(function (s) { want[s] = 1; });
        var flags = [];
        try {
            var EI = C.eventIndex().byLid;
            _arr(_g('ftaPages')).filter(function (p) { return p && p.root; }).slice().sort(function (a, b) { return _cmp(a.id, b.id); }).forEach(function (pg) {
                (function walk(g, seen) {
                    if (!g || seen[g.id] || g.type !== 'gate') return; seen[g.id] = 1;
                    var kids = g.children || [];
                    if ((g.gateType === 'AND' || g.gateType === 'VOTING' || g.gateType === 'PAND') && kids.length >= 2) {
                        var sets = kids.map(function (k) { var o = {}; (function lw(n) { if (!n) return; if (n.type !== 'gate') { var r = EI[String(n.logicalId != null ? n.logicalId : n.id)]; if (r) Object.keys(r.sysIds).forEach(function (x) { if (want[x]) o[x] = 1; }); return; } (n.children || []).forEach(lw); })(k); return Object.keys(o).sort(_cmp); });
                        var hitInputs = sets.filter(function (x) { return x.length; }).length;
                        if (hitInputs >= 2) flags.push({ treeId: pg.id, treeName: pg.name || String(pg.id), gateId: g.id, gate: (g.displayId ? g.displayId + ' ' : '') + (g.name || g.id), equipment: _uniq([].concat.apply([], sets)) });
                    }
                    kids.forEach(function (c) { walk(c, seen); });
                })(pg.root, {});
            });
        } catch (_) {}
        return flags;
    }
    function _uniq(a) { var o = {}; a.forEach(function (x) { o[x] = 1; }); return Object.keys(o).sort(_cmp); }

    // ---- tire burst per EASA AMC 25.734 --------------------------------------------------------
    var TIRE_MODELS = {
        m1Large: { label: 'Model 1 large tire debris (WSG x WSG)', order: 1, theta: P(15, 'ac', 'amc25-734-m1'), gear: 'extended' },
        m1Small: { label: 'Model 1 small tire debris (1 per cent of tire mass)', order: 2, theta: P(30, 'ac', 'amc25-734-m1'), gear: 'extended' },
        m2Flange: { label: 'Model 2 wheel flange debris (60 degree arc, 100 m/s)', order: 3, theta: P(null, 'unverified', null, 'the lateral release zone is drawn in AMC 25.734 Figure 2, which is not in the text: engineer to enter the cone half angle'), gear: 'extended', lateral: true },
        m3Strip: { label: 'Model 3 flailing tire strip (2.5 WSG long)', order: 4, theta: P(30, 'ac', 'amc25-734-m3'), gear: 'extended and retracted' },
        m4Burst: { label: 'Model 4 tire burst pressure (braked wheels, gear retracted)', order: 5, theta: P(null, 'unverified', null, 'plume shape is in AMC 25.734 Figures 4a to 4e (not in the text): engineer to enter the plume reach'), gear: 'retracting or retracted', brakedOnly: true }
    };
    var TIRE_ORDER = Object.keys(TIRE_MODELS).sort(function (a, b) { return TIRE_MODELS[a].order - TIRE_MODELS[b].order; });
    var TIRE_WORDS = /\b(tire|tyre|wheel)\b/i;
    function proposeTires(cadId) {
        var X = _ctx(cadId); if (!X) return [];
        var out = [];
        X.parts.forEach(function (p) {
            var words = [p.name, p.designator].concat(_arr(p.path)).map(_s).join(' ').replace(/[_\-]/g, ' ');
            var nm = (_s(p.name) + ' ' + _s(p.designator)).replace(/[_\-]/g, ' ');
            if (!TIRE_WORDS.test(nm) || /\b(well|bay|door|steering|brake)\b/i.test(nm)) return;
            var e = [0, 1, 2].map(function (i) { return p.bbox.max[i] - p.bbox.min[i]; });
            var ax = e.indexOf(Math.min(e[0], e[1], e[2])), axis = [0, 0, 0]; axis[ax] = 1;
            var others = [0, 1, 2].filter(function (i) { return i !== ax; }).map(function (i) { return e[i]; });
            out.push({ cadId: X.cadId, pid: String(p.pid), name: p.name || String(p.pid), center: [0, 1, 2].map(function (i) { return _r6((p.bbox.min[i] + p.bbox.max[i]) / 2); }), axis: axis,
                       grownDiameter: _r6(Math.max.apply(null, others)), sectionWidth: _r6(e[ax]), why: 'name "' + _s(p.name) + '" names a tire or wheel; axle along the thinnest extent; diameter and width from the box (TRA grown values to be confirmed)', words: words });
        });
        return out;
    }
    function _tires() { var pc = _pc(); if (!Array.isArray(pc.praTires)) pc.praTires = []; return pc.praTires; }
    function tires() { return _arr(_pc().praTires).slice().sort(function (a, b) { return _cmp(a.id, b.id); }); }
    function tire(id) { return _arr(_pc().praTires).filter(function (t) { return t && t.id === id; })[0] || null; }
    function confirmTire(t, by, opts) {
        opts = opts || {};
        if (!_s(by)) return { ok: false, err: 'A tire goes into the analysis only with the name of the engineer who confirmed it.' };
        if (!t || !_n3(t.center) || !_n3(t.axis) || !_unit(t.axis)) return { ok: false, err: 'A tire needs its center and axle direction.' };
        if (!(t.grownDiameter > 0) || !(t.sectionWidth > 0)) return { ok: false, err: 'A tire needs the TRA grown diameter DG and maximum grown shoulder width WSG, in mm.' };
        var arr = _tires(), id = _s(t.id);
        if (!id) { var pc = _pc(); pc.praTireSeq = (pc.praTireSeq || 0) + 1; id = 'tire-' + pc.praTireSeq; while (tire(id)) { pc.praTireSeq++; id = 'tire-' + pc.praTireSeq; } }
        var rec = { id: id, label: _s(t.label) || id, cadId: t.cadId || null, pid: t.pid != null ? String(t.pid) : null, center: t.center.slice(), axis: _unit(t.axis),
                    grownDiameter: t.grownDiameter, sectionWidth: t.sectionWidth, braked: !!t.braked, radial: t.radial === true,
                    massKg: t.massKg > 0 ? t.massKg : null, speedRatingMs: t.speedRatingMs > 0 ? t.speedRatingMs : null, ratedPressureKpa: t.ratedPressureKpa > 0 ? t.ratedPressureKpa : null,
                    upDir: _n3(t.upDir) ? _unit(t.upDir) : [0, 0, 1], outboard: t.outboard && _n3(t.outboard.dir) && t.outboard.confirmedBy ? _clone(t.outboard) : null,
                    // later engineer confirmations survive a re-save of the Step 1 values (they were dropped before 14 Oct 2026, timebox 45)
                    reach: t.reach ? _clone(t.reach) : null, reachConfirm: t.reachConfirm ? _clone(t.reachConfirm) : null, shields: _arr(t.shields).map(_clone), stowed: t.stowed ? _clone(t.stowed) : null,
                    wheelsPerLeg: t.wheelsPerLeg && t.wheelsPerLeg.value >= 1 && t.wheelsPerLeg.by ? _clone(t.wheelsPerLeg) : null,
                    flangeRadius: t.flangeRadius && t.flangeRadius.value > 0 && t.flangeRadius.by ? _clone(t.flangeRadius) : null,
                    confirms: t.confirms && typeof t.confirms === 'object' ? _clone(t.confirms) : {},
                    gear: Array.isArray(t.gear) && t.gear.length ? t.gear.filter(function (g) { return g === 'extended' || g === 'retracted'; }) : ['extended'],
                    arcLimit: t.arcLimit && typeof t.arcLimit.fromDeg === 'number' && typeof t.arcLimit.toDeg === 'number' && _s(t.arcLimit.justification) && _s(t.arcLimit.by) ? _clone(t.arcLimit) : null,
                    flangeHalfAngleDeg: t.flangeHalfAngleDeg > 0 ? t.flangeHalfAngleDeg : null, burstReachMm: t.burstReachMm > 0 ? t.burstReachMm : null,
                    confirmedBy: _s(by), confirmedAt: opts.at || new Date().toISOString() };
        var i = arr.findIndex(function (x) { return x && x.id === id; }); if (i >= 0) arr[i] = rec; else arr.push(rec);
        _save(); return { ok: true, tire: _clone(rec) };
    }
    // _bandHit(part, center, axis, theta, reach, upDir): any corner or the box center within
    // theta of the wheel plane (either side of the tire center line), above the axle (towards
    // the aircraft) and within reach when given.
    function _samplePts(b) { return _corners(b).concat([[(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]]); }
    // _bandHit(part, center, axle, theta, reach, arc): within theta of the wheel plane, all the way
    // round the axle (AMC 25.734 sets no direction), unless the engineer limited the arc: arc =
    // {fromDeg, toDeg, ref} with angles about the axle measured from ref (the up direction).
    function _inArc(w, ax, arc) {
        if (!arc) return true;
        var e1 = _unit(_sub(arc.ref, [ax[0] * _dot(arc.ref, ax), ax[1] * _dot(arc.ref, ax), ax[2] * _dot(arc.ref, ax)])); if (!e1) return true;
        var e2 = _cross(ax, e1), az = Math.atan2(_dot(w, e2), _dot(w, e1)) / D2R; az = (az + 360) % 360;
        var f = ((arc.fromDeg % 360) + 360) % 360, t2 = ((arc.toDeg % 360) + 360) % 360;
        return f <= t2 ? (az >= f - 1e-9 && az <= t2 + 1e-9) : (az >= f - 1e-9 || az <= t2 + 1e-9);
    }
    function _bandHit(p, c, ax, theta, reach, arc) {
        return _samplePts(p.bbox).some(function (q) {
            var w = _sub(q, c), d = _len(w); if (d === 0) return true;
            if (reach != null && d > reach) return false;
            if (!_inArc(w, ax, arc)) return false;
            return Math.asin(Math.min(1, Math.abs(_dot(w, ax)) / d)) / D2R <= theta + 1e-9;
        });
    }
    // Tire debris reach: AMC 25.734 gives none, so it is an engineer input. One value feeds both the hit
    // test and the drawing. Default: the distance from the tire to the farthest point of the model, so
    // nothing is cut off silently; the engineer may reduce it, with a reason, and confirms it by name.
    function tireDefaultReach(tireId, cadId) {
        var t = tire(tireId), X = t && _ctx(cadId || t.cadId); if (!t || !X) return null; var far = 0;
        X.parts.forEach(function (p) { if (p.bbox) _corners(p.bbox).forEach(function (q) { far = Math.max(far, _len(_sub(q, t.center))); }); });
        return Math.ceil(far);
    }
    function tireReach(tireId, cadId) {
        var t = tire(tireId); if (!t) return null; var def = tireDefaultReach(tireId, cadId), R = t.reach || null, c = t.reachConfirm || null;
        var v = R && R.mm > 0 ? R.mm : def;
        var note = 'reach: engineer input, AMC 25.734 gives none; ' + (R ? 'reduced from ' + def + ' mm by ' + R.by + ': ' + R.reason : 'default is the distance from the tire to the farthest point of the model (' + def + ' mm), nothing cut off') + (c ? '; confirmed by ' + c.by : '; not yet confirmed');
        return { value: v, defaultMm: def, source: 'engineer', note: note, reduced: !!R, confirmedBy: c ? c.by : null };
    }
    function setTireReach(tireId, mm, reason, by, opts) {
        opts = opts || {}; var t = tire(tireId); if (!t) return { ok: false, err: 'Tire not found.' };
        if (!_s(by)) return { ok: false, err: 'A reach change needs the name of the engineer.' };
        if (mm == null) { t.reach = null; t.reachConfirm = null; _save(); return { ok: true }; }
        if (typeof mm !== 'number' || !(mm > 0) || !isFinite(mm)) return { ok: false, err: 'Enter the reach in mm.' };
        if (_s(reason).length < 10) return { ok: false, err: 'Write the reason for reducing the reach (at least a sentence).' };
        var def = tireDefaultReach(tireId); if (def != null && mm > def) return { ok: false, err: 'The reach can only be reduced from the default (' + def + ' mm), which already reaches the whole model.' };
        t.reach = { mm: mm, reason: _s(reason), by: _s(by), at: opts.at || new Date().toISOString() }; t.reachConfirm = null; _save(); return { ok: true };
    }
    function confirmTireReach(tireId, by, on, opts) {
        opts = opts || {}; var t = tire(tireId); if (!t) return { ok: false, err: 'Tire not found.' };
        if (on === false) { t.reachConfirm = null; _save(); return { ok: true }; }
        if (!_s(by)) return { ok: false, err: 'The reach is confirmed only with the engineer\'s name.' };
        t.reachConfirm = { by: _s(by), at: opts.at || new Date().toISOString() }; _save(); return { ok: true };
    }
    // Exact band test (|elevation from the wheel plane| <= theta, within reach, inside the engineer's arc if any) on
    // the part's own triangles, or the 12 triangles of its box when none are loaded. For a triangle that crosses the
    // wheel plane, the crossing segment has elevation 0: hit when it comes within reach. Otherwise a - k rho (k = tan
    // theta) is concave over the triangle, so its smallest value is at a vertex: test the vertices.
    function _boxTris(b) { var c = _corners(b), F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]], out = []; F.forEach(function (f) { [[f[0], f[1], f[2]], [f[0], f[2], f[3]]].forEach(function (t3) { out.push(t3.map(function (i) { return c[i]; })); }); }); return out; }
    function _trisOfPart(p) { var T = _triSource ? _triSource(String(p.pid)) : null; if (!T || T.length < 9) return { tris: _boxTris(p.bbox), real: false }; var out = []; for (var k = 0; k + 8 < T.length; k += 9) out.push([[T[k], T[k + 1], T[k + 2]], [T[k + 3], T[k + 4], T[k + 5]], [T[k + 6], T[k + 7], T[k + 8]]]); return { tris: out, real: true }; }
    function _segDist0(A, B) { var d = _sub(B, A), L2 = _dot(d, d), t = L2 > 0 ? Math.max(0, Math.min(1, -_dot(A, d) / L2)) : 0; return { d: _len([A[0] + t * d[0], A[1] + t * d[1], A[2] + t * d[2]]), q: [A[0] + t * d[0], A[1] + t * d[1], A[2] + t * d[2]] }; }
    // T2: exact test of a triangle against the band (|elevation from the wheel plane| <= theta) AND the reach sphere AND the
    // engineer's arc, together. The triangle is clipped by the arc half-planes (arcs over 180 deg split in two), then the
    // boundary of (clipped triangle inside the reach sphere) is searched for a point inside the band: on each side of the
    // wheel plane |a| - k rho is concave along a segment (minimum at the ends), a crossing of the wheel plane is inside the
    // band, and the circle where the sphere cuts the triangle's plane is solved exactly at the wheel plane and checked at
    // 360 points elsewhere. The region inside the sphere is convex, so its boundary decides (the band's outside is two convex cones).
    function _clipPoly(P, n) { var out = []; for (var i = 0; i < P.length; i++) { var A = P[i], B = P[(i + 1) % P.length], da = _dot(n, A), db = _dot(n, B); if (da >= 0) out.push(A); if ((da > 0 && db < 0) || (da < 0 && db > 0)) { var t = da / (da - db); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1]), A[2] + t * (B[2] - A[2])]); } } return out; }
    function _wedgeHitTris(tris, c, ax, thetaDeg, reach, arc) {
        var k = Math.tan(thetaDeg * D2R), R = reach == null ? Infinity : reach;
        var g = function (w) { var a = _dot(w, ax), rho = Math.sqrt(Math.max(0, _dot(w, w) - a * a)); return Math.abs(a) - k * rho; };
        var subArcs = [null];
        if (arc) { var e1 = _unit(_sub(arc.ref, [ax[0] * _dot(arc.ref, ax), ax[1] * _dot(arc.ref, ax), ax[2] * _dot(arc.ref, ax)])); if (e1) { var e2 = _cross(ax, e1), f = ((arc.fromDeg % 360) + 360) % 360, span = ((arc.toDeg - arc.fromDeg) % 360 + 360) % 360 || 360;
            var dAt = function (deg) { var r2 = deg * D2R; return [Math.cos(r2) * e1[0] + Math.sin(r2) * e2[0], Math.cos(r2) * e1[1] + Math.sin(r2) * e2[1], Math.cos(r2) * e1[2] + Math.sin(r2) * e2[2]]; };
            subArcs = []; var parts = span > 180 ? [[f, f + span / 2], [f + span / 2, f + span]] : [[f, f + span]];
            parts.forEach(function (q) { subArcs.push([dAt(q[0] + 90), dAt(q[1] - 90)]); }); } }
        for (var i = 0; i < tris.length; i++) {
            var V0 = tris[i].map(function (q) { return _sub(q, c); });
            // safe reject (speed only): the triangle lies in the ball (m, r) about its centroid; every point p of the ball has
            // |p . ax| >= |m . ax| - r and rho(p) <= rho(m) + r, so if |m . ax| - r > k (rho(m) + r) no point is in the band;
            // and if |m| - r > R no point is within the reach
            var mC = [(V0[0][0] + V0[1][0] + V0[2][0]) / 3, (V0[0][1] + V0[1][1] + V0[2][1]) / 3, (V0[0][2] + V0[1][2] + V0[2][2]) / 3], rB = Math.max(_len(_sub(V0[0], mC)), _len(_sub(V0[1], mC)), _len(_sub(V0[2], mC))) * (1 + 1e-9) + 1e-6;
            var aM = Math.abs(_dot(mC, ax)), rhoM = Math.sqrt(Math.max(0, _dot(mC, mC) - aM * aM));
            if (aM - rB > k * (rhoM + rB) + 1e-6 || _len(mC) - rB > R) continue;
            for (var s2 = 0; s2 < subArcs.length; s2++) {
                var P = V0; if (subArcs[s2]) { P = _clipPoly(P, subArcs[s2][0]); if (P.length) P = _clipPoly(P, subArcs[s2][1]); } if (P.length < 1) continue;
                for (var v = 0; v < P.length; v++) if (_len(P[v]) <= R && g(P[v]) <= 1e-9) return true;
                for (var e = 0; e < P.length; e++) { var A = P[e], B = P[(e + 1) % P.length], d = _sub(B, A), aa = _dot(d, d); if (!(aa > 0)) continue;
                    var bb = 2 * _dot(A, d), cc = _dot(A, A) - R * R, t0 = 0, t1 = 1;
                    if (isFinite(R)) { var disc = bb * bb - 4 * aa * cc; if (disc < 0) continue; var sq = Math.sqrt(disc); t0 = Math.max(0, (-bb - sq) / (2 * aa)); t1 = Math.min(1, (-bb + sq) / (2 * aa)); if (t0 > t1) continue; }
                    var pAt = function (t) { return [A[0] + t * d[0], A[1] + t * d[1], A[2] + t * d[2]]; }, a0 = _dot(pAt(t0), ax), a1 = _dot(pAt(t1), ax);
                    if ((a0 <= 0 && a1 >= 0) || (a0 >= 0 && a1 <= 0)) return true;   // crosses the wheel plane inside the reach
                    if (g(pAt(t0)) <= 1e-9 || g(pAt(t1)) <= 1e-9) return true; }
                if (isFinite(R) && P.length >= 3) {   // the circle where the reach sphere cuts the polygon's plane
                    var nP = _unit(_cross(_sub(P[1], P[0]), _sub(P[2], P[0]))); if (!nP) continue; var d0 = _dot(nP, P[0]); if (Math.abs(d0) >= R) continue;
                    var cc2 = [nP[0] * d0, nP[1] * d0, nP[2] * d0], rc = Math.sqrt(R * R - d0 * d0), u = _unit(_cross(nP, Math.abs(nP[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), w2 = _cross(nP, u);
                    var inside = function (q) { for (var m = 0; m < P.length; m++) { var A2 = P[m], B2 = P[(m + 1) % P.length]; if (_dot(_cross(_sub(B2, A2), _sub(q, A2)), nP) < -1e-9) return false; } return true; };
                    var at = function (ph) { return [cc2[0] + rc * (Math.cos(ph) * u[0] + Math.sin(ph) * w2[0]), cc2[1] + rc * (Math.cos(ph) * u[1] + Math.sin(ph) * w2[1]), cc2[2] + rc * (Math.cos(ph) * u[2] + Math.sin(ph) * w2[2])]; };
                    var A0 = _dot(cc2, ax), Au = rc * _dot(u, ax), Aw = rc * _dot(w2, ax), Am = Math.hypot(Au, Aw);   // exact: where the circle meets the wheel plane
                    if (Am > 1e-12 && Math.abs(A0) <= Am) { var base = Math.atan2(Aw, Au), dl = Math.acos(-A0 / Am); if (inside(at(base + dl)) || inside(at(base - dl))) return true; }
                    // D5, exact: on the reach sphere |q| = R, so g(q) <= 0 exactly when |q . ax| <= R sin(theta); along the circle
                    // q . ax = A0 + Au cos(ph) + Aw sin(ph). The arcs inside the polygon and the arcs with |q . ax| <= R sin(theta)
                    // overlap exactly when an end of one lies in the other (or both are the whole circle): test every end angle
                    var cS = R * Math.sin(thetaDeg * D2R), cand = [0];
                    if (Am > 1e-12) [cS, -cS].forEach(function (cv) { if (Math.abs(cv - A0) <= Am) { var bse = Math.atan2(Aw, Au), dl2 = Math.acos(Math.max(-1, Math.min(1, (cv - A0) / Am))); cand.push(bse + dl2, bse - dl2); } });
                    for (var m3 = 0; m3 < P.length; m3++) { var EA = _sub(P[m3], cc2), ED = _sub(P[(m3 + 1) % P.length], P[m3]), ea = _dot(ED, ED); if (!(ea > 0)) continue;
                        var eb = 2 * _dot(EA, ED), ec = _dot(EA, EA) - rc * rc, edisc = eb * eb - 4 * ea * ec; if (edisc < 0) continue; var esq = Math.sqrt(edisc);
                        [(-eb - esq) / (2 * ea), (-eb + esq) / (2 * ea)].forEach(function (sv) { if (sv < -1e-12 || sv > 1 + 1e-12) return; var pq = [EA[0] + sv * ED[0], EA[1] + sv * ED[1], EA[2] + sv * ED[2]]; cand.push(Math.atan2(_dot(pq, w2), _dot(pq, u))); }); }
                    for (var cN = 0; cN < cand.length; cN++) { var q2 = at(cand[cN]); if (inside(q2) && Math.abs(_dot(q2, ax)) <= cS * (1 + 1e-9) + 1e-9) return true; }
                }
            }
        }
        return false;
    }
    // T3: exact test of a triangle against the Model 2 cone (half angle theta about the outboard direction) AND the reach: the
    // larger of (|q| cos theta - q.o) and (|q| - reach) is convex, so its minimum over the triangle (nested ternary search on the
    // barycentric coordinates, to 1e-6) decides
    // point forms of the two zone tests (timebox 46, speed): the same conditions the triangle tests apply to a single point
    function _ptInWedge(q, c, ax, thetaDeg, reach, arc) { var w = _sub(q, c), a = _dot(w, ax), rho = Math.sqrt(Math.max(0, _dot(w, w) - a * a)); return (reach == null || _len(w) <= reach) && Math.abs(a) - Math.tan(thetaDeg * D2R) * rho <= 1e-9 && _inArc(w, ax, arc); }
    function _ptInCone(q, c, o, thetaDeg, reach) { var w = _sub(q, c), L = _len(w); return Math.max(L * Math.cos(thetaDeg * D2R) - _dot(w, o), reach == null ? -Infinity : L - reach) <= 1e-6 * Math.max(1, L); }
    function _coneHitTris(tris, c, o, thetaDeg, reach) {
        var ct = Math.cos(thetaDeg * D2R), R = reach == null ? Infinity : reach;
        var F = function (q) { var L = _len(q); return Math.max(L * ct - _dot(q, o), isFinite(R) ? L - R : -Infinity); };
        for (var i = 0; i < tris.length; i++) {
            var A = _sub(tris[i][0], c), B = _sub(tris[i][1], c), C3 = _sub(tris[i][2], c), d1 = _sub(B, A), d2 = _sub(C3, A);
            var mC2 = [(A[0] + B[0] + C3[0]) / 3, (A[1] + B[1] + C3[1]) / 3, (A[2] + B[2] + C3[2]) / 3], rB2 = Math.max(_len(_sub(A, mC2)), _len(_sub(B, mC2)), _len(_sub(C3, mC2))) * (1 + 1e-9) + 1e-6, lm = _len(mC2);
            // safe reject (speed only): every point p of the ball (m, r) has angle(p, o) >= angle(m, o) - asin(r / |m|) and |p| >= |m| - r
            if (lm > rB2 * 1.001 && (lm - rB2 > R || Math.acos(Math.max(-1, Math.min(1, _dot(mC2, o) / lm))) - Math.asin(rB2 / lm) > thetaDeg * D2R + 1e-6)) continue;
            if (F(A) <= 1e-6 * Math.max(1, _len(A)) || F(B) <= 1e-6 * Math.max(1, _len(A)) || F(C3) <= 1e-6 * Math.max(1, _len(A))) return true;   // a vertex inside: hit (speed only)
            var at = function (u, v) { return [A[0] + u * d1[0] + v * d2[0], A[1] + u * d1[1] + v * d2[1], A[2] + u * d1[2] + v * d2[2]]; };
            var inner = function (u) { var lo = 0, hi = 1 - u; for (var it = 0; it < 60; it++) { var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (F(at(u, m1)) <= F(at(u, m2))) hi = m2; else lo = m1; } return F(at(u, (lo + hi) / 2)); };
            var lo = 0, hi = 1; for (var it2 = 0; it2 < 60; it2++) { var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (inner(m1) <= inner(m2)) hi = m2; else lo = m1; }
            if (inner((lo + hi) / 2) <= 1e-6 * Math.max(1, _len(A))) return true;
        }
        return false;
    }
    function tireThreats(tireId, opts) {
        opts = opts || {};
        var t = tire(tireId); if (!t || !t.confirmedBy) return { ok: false, err: 'Tire not found or not confirmed by an engineer.' };
        var X = _ctx(opts.cadId || t.cadId); if (!X) return { ok: false, err: 'No CAD model or the CAD / zonal engine is not loaded.' };
        var W = t.sectionWidth, DG = t.grownDiameter;
        // retracted cases (3R, 4) use the stowed tire center and axle, engineer confirmed
        var ctr = t.center, axl = t.axis;
        if (opts.retracted) { if (!t.stowed || !t.stowed.confirmedBy) return { ok: false, err: 'Retracted cases (Models 3R and 4) need the stowed tire center and axle, entered and confirmed by an engineer (Step 1).', missing: ['stowed'] }; ctr = t.stowed.center; axl = t.stowed.axis; }
        var others = X.parts.filter(function (p) { return String(p.pid) !== t.pid; }), anyReal = false;
        var trisOf = {}, BVH = null; others.forEach(function (p) { var q = _trisOfPart(p); trisOf[p.pid] = q.tris; if (q.real) anyReal = true; });
        var models = TIRE_ORDER.map(function (k) {
            var tm = TIRE_MODELS[k], theta = tm.theta, params = {}, hits = [], note = null, TR = tireReach(tireId, opts.cadId), reach = TR ? TR.value : null;
            if (tm.brakedOnly && !t.braked) return { model: k, label: tm.label, applies: false, note: 'Model 4 applies only to tires on braked wheels (AMC 25.734 Model 4 (1)).' };
            if (k === 'm1Large') params = { sizeMm: P(_r6(W) + ' x ' + _r6(W), 'ac', 'amc25-734-m1'), speedMs: t.speedRatingMs ? P(t.speedRatingMs, 'engineer', null, 'minimum tire speed rating') : P(null, 'missing', null, 'minimum tire speed rating not entered') };
            if (k === 'm1Small') {
                var mm = t.massKg ? P(_r6(0.01 * t.massKg), 'derived', 'amc25-734-m1', '1 per cent of the engineer entered tire mass') : P(null, 'missing', null, 'tire mass not entered');
                var sp = t.speedRatingMs ? P(t.speedRatingMs, 'engineer') : P(null, 'missing', null, 'minimum tire speed rating not entered');
                params = { massKg: mm, speedMs: sp, impactAreaMm2: P(_r6(0.015 * Math.PI * DG * W), 'derived', 'amc25-734-defs', '1.5 per cent of the total tread area, which the AMC defines as pi DG WSG ("Total tread area: \u220f.DG.WSG")'),
                           energyJ: (mm.value != null && sp.value != null) ? P(_r6(0.5 * mm.value * sp.value * sp.value), 'derived', 'amc25-734-m1', '1/2 m v^2') : P(null, 'missing', null, 'mass or speed missing') };
            }
            if (k === 'm2Flange') { params = { arcDeg: P(60, 'ac', 'amc25-734-m2'), speedMs: P(100, 'ac', 'amc25-734-m2') }; if (t.flangeHalfAngleDeg) theta = P(t.flangeHalfAngleDeg, 'engineer'); }
            if (TR && k !== 'm3Strip' && k !== 'm4Burst') params.reachMm = P(TR.value, 'engineer', null, TR.note);
            if (k === 'm3Strip') { reach = DG / 2 + 2.5 * W; params = { lengthMm: P(_r6(2.5 * W), 'ac', 'amc25-734-m3'), widthMm: P(_r6(W / 2), 'ac', 'amc25-734-m3'), reachMm: P(_r6(reach), 'derived', 'amc25-734-m3', 'grown radius plus the strip length') }; }
            if (k === 'm4Burst') {
                params = { burstPressureKpaAbs: t.ratedPressureKpa ? P(_r6(1.3 * (t.ratedPressureKpa / 1.07 + 101.325)), 'derived', 'amc25-734-m4', '130 % of the maximum unloaded operational pressure (rated / 1.07) taken as absolute pressure, as in the AMC example (1 365 / 1.07 = 1 276 kPa gauge, 1 377 kPa absolute, x 1.3 = 1 790 kPa absolute); gauge equivalent ' + _r6(1.3 * (t.ratedPressureKpa / 1.07 + 101.325) - 101.325) + ' kPa') : P(null, 'missing', null, 'unloaded rated tire pressure not entered'),
                           decayConstants: P('C1 12.478, C2 1.222, C3 0.024', 'ac', 'amc25-734-m4e'), plume: P(t.radial ? 'radial: wedge (Figures 4d, 4e)' : 'bias: cone rotated ±100 degrees over the tread (Figure 4a)', 'ac', 'amc25-734-m4'),
                           decayFormula: P(null, 'unverified', null, 'the decay formula of Figure 4e is an image in the published text; the pressure at a distance is not computed') };
                reach = t.burstReachMm || null; if (reach) theta = P(90, 'engineer', null, 'whole plume reach entered by the engineer');
            }
            if (theta.value == null || (k === 'm4Burst' && !reach)) return { model: k, label: tm.label, applies: true, theta: theta, params: params, hits: [], incomplete: true, note: 'Exposure not computed: ' + cite(theta) };
            if (tm.lateral && !(t.outboard && t.outboard.confirmedBy)) return { model: k, label: tm.label, applies: true, theta: theta, params: params, hits: [], incomplete: true, note: 'Exposure not computed: Model 2 debris is released laterally; confirm the outboard direction of this wheel first (Step 1).' };
            if (tm.lateral && !(t.wheelsPerLeg && t.wheelsPerLeg.value >= 1)) return { model: k, label: tm.label, applies: true, theta: theta, params: params, hits: [], incomplete: true, note: 'Exposure not computed: confirm the number of wheels on this landing gear leg (Step 1). AMC 25.734 Model 2: "If only a single wheel is installed on a landing gear leg, then the lateral release of either flange shall be considered."' };
            if (tm.lateral && !(t.flangeRadius && t.flangeRadius.value > 0)) return { model: k, label: tm.label, applies: true, theta: theta, params: params, hits: [], incomplete: true, note: 'Exposure not computed: confirm the wheel flange rim radius (Step 1, engineer input, not from the AMC text): Model 2 rays start on the flange rim.' };
            if (tm.lateral) params.flangeRadiusMm = P(t.flangeRadius.value, 'engineer', null, 'not from the AMC text, engineer input (confirmed by ' + t.flangeRadius.by + '): the debris rays start on the flange rim at this radius on the released side');
            var coneDirs = tm.lateral ? (t.wheelsPerLeg.value === 1 ? [t.outboard.dir, t.outboard.dir.map(function (v) { return -v; })] : [t.outboard.dir]) : null;
            if (tm.lateral) params.flanges = P(t.wheelsPerLeg.value === 1 ? 'both flanges (inboard and outboard cones): single wheel on the leg' : 'outer wheel half flange only (outboard cone): ' + t.wheelsPerLeg.value + ' wheels on the leg', 'ac', 'amc25-734-m2w', 'wheels on the leg confirmed by ' + t.wheelsPerLeg.by);
            others.forEach(function (p) {
                var ok;
                if (tm.lateral) {
                    ok = coneDirs.some(function (cd) { return _coneHitTris(trisOf[p.pid], ctr, cd, theta.value, reach); });
                } else ok = _wedgeHitTris(trisOf[p.pid], ctr, _unit(axl), theta.value, reach, t.arcLimit ? { fromDeg: t.arcLimit.fromDeg, toDeg: t.arcLimit.toDeg, ref: t.upDir || [0, 0, 1] } : null);
                if (ok) hits.push(String(p.pid));
            });
            // first hit along each debris direction (T5, 14 Oct 2026): rays start on the tread (radius DG/2, across the
            // tread width WSG; Model 2 from the flange face, WSG/2 along the cone axis), not at the tire center, and go to
            // every in-zone sample point of the part (vertices plus a budgeted adaptive grid on each triangle; the count is
            // stated). A part is directly exposed when any ray reaches it first; it is shielded only when every ray to it is
            // blocked by a part the engineer credited as a shield (with a reason); otherwise it is behind the first parts met.
            var exposure = {}, shielded = [], sh = {}, rayCount = {}, RAY_BUDGET = 256; (t.shields || []).forEach(function (x) { sh[x.pid] = x; });
            var aU = _unit(axl), arcZ = t.arcLimit ? { fromDeg: t.arcLimit.fromDeg, toDeg: t.arcLimit.toDeg, ref: t.upDir || [0, 0, 1] } : null;
            var inZone = function (q) { return tm.lateral ? coneDirs.some(function (cd) { return _ptInCone(q, ctr, cd, theta.value, reach); }) : _ptInWedge(q, ctr, aU, theta.value, reach, arcZ); };
            var originFor = function (q) {
                var w = _sub(q, ctr), sa = _dot(w, aU);
                if (tm.lateral) { var cd = coneDirs.filter(function (d) { return _dot(w, d) >= 0; })[0] || coneDirs[0], wa = _dot(w, cd), rq = [w[0] - cd[0] * wa, w[1] - cd[1] * wa, w[2] - cd[2] * wa], rqL = _len(rq), RF = t.flangeRadius.value;
                    // on the flange rim (radius RF about the cone axis) on the released side (WSG/2 along it), in the plane through q
                    if (!(rqL > 1e-9)) { var pe = _unit(_cross(cd, Math.abs(cd[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])); rq = pe; rqL = 1; }
                    return [0, 1, 2].map(function (i) { return ctr[i] + cd[i] * W / 2 + rq[i] / rqL * RF; }); }
                var rv = [w[0] - aU[0] * sa, w[1] - aU[1] * sa, w[2] - aU[2] * sa], rl = _len(rv); if (!(rl > 1e-9)) return null;
                var sc = Math.max(-W / 2, Math.min(W / 2, sa)); return [0, 1, 2].map(function (i) { return ctr[i] + rv[i] / rl * DG / 2 + aU[i] * sc; });
            };
            if (!BVH) { var bItems = []; others.forEach(function (p2) { trisOf[p2.pid].forEach(function (tr) { bItems.push({ tri: tr, pid: String(p2.pid) }); }); }); BVH = _bvh(bItems); }
            var blockersOn = function (o, q, skip) { var d = _sub(q, o), L = _len(d); if (!(L > 0)) return []; var u = [d[0] / L, d[1] / L, d[2] / L];
                var best = _bvhSegment(BVH, o, u, L, skip);
                return Object.keys(best).map(function (k3) { return { pid: k3, t: best[k3] }; }).sort(function (x, y) { return x.t - y.t || _cmp(x.pid, y.pid); }); };
            var samplesOf = function (pid) {
                var tr = trisOf[pid], area = 0; tr.forEach(function (x) { area += _len(_cross(_sub(x[1], x[0]), _sub(x[2], x[0]))) / 2; });
                var h = Math.max(1, Math.sqrt(area / RAY_BUDGET)), pts = [], seen = {};
                var push = function (q) { var k = q.map(function (v) { return Math.round(v * 1000); }).join(','); if (seen[k]) return; seen[k] = 1; if (inZone(q)) pts.push(q); };
                tr.forEach(function (x) { x.forEach(push); var n = Math.max(1, Math.min(64, Math.ceil(Math.max(_len(_sub(x[1], x[0])), _len(_sub(x[2], x[1])), _len(_sub(x[0], x[2]))) / h)));
                    for (var i = 0; i < n; i++) for (var j = 0; j < n - i; j++) { var u1 = (i + 1 / 3) / n, v1 = (j + 1 / 3) / n; push([0, 1, 2].map(function (c) { return x[0][c] + u1 * (x[1][c] - x[0][c]) + v1 * (x[2][c] - x[0][c]); })); } });
                if (pts.length > RAY_BUDGET) { var st2 = pts.length / RAY_BUDGET, sel = []; for (var k2 = 0; k2 < RAY_BUDGET; k2++) sel.push(pts[Math.floor(k2 * st2)]); pts = sel; }
                return pts;
            };
            hits.slice().forEach(function (pid) {
                var P0 = others.filter(function (p2) { return String(p2.pid) === pid; })[0], pts = samplesOf(pid);
                if (!pts.length) pts = [_corners(P0.bbox).reduce(function (a2, b2) { return _len(_sub(a2, ctr)) < _len(_sub(b2, ctr)) ? a2 : b2; })];
                var first = {}, direct = false, allShielded = true, nr = 0, shBy = {};
                pts.forEach(function (q) { var o = originFor(q); if (!o) return; nr++; var bl = blockersOn(o, q, pid);
                    if (!bl.length) { direct = true; allShielded = false; return; }
                    first[bl[0].pid] = 1; var cr = bl.filter(function (x) { return sh[x.pid]; }); if (!cr.length) allShielded = false; else shBy[cr[0].pid] = 1; });
                rayCount[pid] = nr;
                var bl = Object.keys(first).sort(_cmp), byS = Object.keys(shBy).sort(_cmp);
                if (direct) exposure[pid] = 'directly exposed';
                // D4: sampled rays cannot prove blocking (a gap between samples can let debris through), so a credited
                // shield never removes a hit here: the part stays a hit, marked as behind a credited shield, not proven blocked
                else if (nr && allShielded) { exposure[pid] = 'behind a credited shield (not proven blocked)'; shielded.push({ pid: pid, by: byS, rays: nr, provenBlocked: false, note: byS.map(function (b3) { return b3 + ' (credited: ' + sh[b3].reason + ', ' + sh[b3].by + ')'; }).join('; ') + '; every sampled ray met it, but sampling does not prove blocking: kept as a hit' }); }
                else exposure[pid] = 'behind ' + bl.join(', ');
            });
            // (D4) no hit is removed on sampling
            var im = _impactFor(X, hits);
            return { model: k, label: tm.label, applies: true, gear: tm.gear, theta: theta, params: params, hits: hits, exposure: exposure, shielded: shielded, rayCount: rayCount, rayNote: 'first-hit rays from the tread to every in-zone sample point of each hit part, at most ' + RAY_BUDGET + ' per part (adaptive spacing about the square root of part area / ' + RAY_BUDGET + '); counts per part in rayCount',
                     zones: hits.map(function (pid) { return { pid: pid, zoneId: X.zoneOf[pid] || null, zone: _zoneLabel(X.zoneOf[pid]) }; }),
                     wheelWellHits: hits.filter(function (pid) { var zl = _zoneLabel(X.zoneOf[pid]) || ''; return /wheel\s*well|gear\s*bay|landing\s*gear/i.test(zl); }),
                     equipment: im.equipment, conditions: im.conditions, worst: im.worst, functions: im.functions, unlinkedParts: im.unlinkedParts, shared: _sharedExposure(im.equipment),
                     note: k === 'm1Large' ? 'Companion tire: both tires releasing large debris inside 15 degrees (AMC 25.734 Model 1 (3)).' : null };
        });
        return { ok: true, tireId: t.id, label: t.label, cadId: X.cadId, models: models, method: (anyReal ? 'The parts\' own triangles' : 'The 12 triangles of each part box (no triangles loaded)') + ' tested exactly against each model zone from the tire center (a part crossing the wheel plane within reach is caught); zones are measured either side of the tire center line, all the way round the axle unless the engineer limited the arc.' };
    }

    // ---- bird strike exposure ----------------------------------------------------------------
    // birdExposure(cadId, {direction, cell, basis, speeds}): parts first met by a bird travelling
    // along `direction` (the flight direction reversed: the bird moves towards the aircraft) on
    // a grid of `cell` mm, the elements behind each exposed part (deeper in the same cells), the
    // case that applies (windshield, empennage, structure) and its cited mass and energy.
    function birdExposure(cadId, opts) {
        opts = opts || {};
        var X = _ctx(cadId); if (!X) return { ok: false, err: 'No CAD model or the CAD / zonal engine is not loaded.' };
        var dir = _n3(opts.direction) && _unit(opts.direction) ? _unit(opts.direction) : [1, 0, 0];   // bird moving +x: hits the nose first when x grows aft
        var cell = opts.cell > 0 ? opts.cell : 100;
        var e1 = _unit(_cross(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0])), e2 = _cross(dir, e1);
        var grid = {};
        X.parts.forEach(function (p) {
            var cs = _corners(p.bbox), u = cs.map(function (q) { return _dot(q, e1); }), v = cs.map(function (q) { return _dot(q, e2); }), dpt = cs.map(function (q) { return _dot(q, dir); });
            var u0 = Math.floor(Math.min.apply(null, u) / cell), u1 = Math.floor(Math.max.apply(null, u) / cell), v0 = Math.floor(Math.min.apply(null, v) / cell), v1 = Math.floor(Math.max.apply(null, v) / cell);
            var front = Math.min.apply(null, dpt);
            for (var a = u0; a <= u1; a++) for (var b = v0; b <= v1; b++) { var k = a + ',' + b; (grid[k] = grid[k] || []).push({ pid: String(p.pid), front: front }); }
        });
        var exposed = {}, behind = {};
        Object.keys(grid).sort(_cmp).forEach(function (k) {
            var L = grid[k].sort(function (x, y) { return x.front - y.front || _cmp(x.pid, y.pid); });
            var f = L[0]; exposed[f.pid] = (exposed[f.pid] || 0) + 1;
            var b = behind[f.pid] || (behind[f.pid] = {});
            L.slice(1).forEach(function (x) { if (!b[x.pid] || b[x.pid] > x.front - f.front) b[x.pid] = _r6(x.front - f.front); });
        });
        var bc = birdCases(_s(opts.basis) || _projBasis(), opts.speeds);
        var nameOf = {}; X.parts.forEach(function (p) { nameOf[String(p.pid)] = p.name || String(p.pid); });
        var zones = Object.keys(exposed).sort(_cmp).map(function (pid) {
            var nm = String(nameOf[pid]).replace(/[_\-]/g, ' '), cid = /windshield|windscreen/i.test(nm) ? 'windshield' : (/\b(fin|stabili[sz]er|empennage|tail|elevator|rudder)\b/i.test(nm) ? 'empennage' : 'structure');
            var cs = bc.ok ? (bc.cases.filter(function (c) { return c.id === cid; })[0] || bc.cases.filter(function (c) { return c.id === 'structure' || c.id === 'rotorcraft' || c.id === 'vtol'; })[0] || null) : null;
            var beh = Object.keys(behind[pid] || {}).sort(function (a, b) { return behind[pid][a] - behind[pid][b] || _cmp(a, b); });
            var im = _impactFor(X, [pid].concat(beh));
            return { pid: pid, name: nameOf[pid], cells: exposed[pid], areaMm2: exposed[pid] * cell * cell, caseId: cs ? cs.id : null, massKg: cs ? cs.massKg : P(null, 'missing', null, bc.err || 'no case'), energyJ: cs ? cs.energyJ : P(null, 'missing', null, bc.err || 'no case'),
                     behind: beh.map(function (b) { return { pid: b, name: nameOf[b], depthMm: behind[pid][b], equipment: X.conf[b] || null }; }),
                     equipment: im.equipment, conditions: im.conditions, worst: im.worst, functions: im.functions, shared: _sharedExposure(im.equipment) };
        });
        return { ok: true, cadId: X.cadId, direction: dir, cellMm: cell, basis: bc.ok ? bc.basis : null, basisIssue: bc.ok ? null : bc.err, zones: zones,
                 method: 'Part boxes projected along the bird direction on a ' + cell + ' mm grid; the first box met in a cell is exposed; boxes further along in the same cells are behind it. Box level, conservative.' };
    }

    // ---- lightning zones, proposed for engineer confirmation ----------------------------------
    var LIGHTNING_ZONES = ['1A', '1B', '1C', '2A', '2B', '3'];
    var LIGHTNING_REF = P(null, 'unverified', null, 'SAE ARP5414 is not in the knowledge base: zones are proposed from the aircraft geometry by the rule below and must be confirmed by the engineer');
    var LIGHTNING_EFFECTS = {
        direct: ['burn-through and hot spots at attachment points', 'arcing and sparking at joints and fasteners', 'structural damage and blast at attachment', 'fuel vapor ignition in or near fuel tanks', 'damage to externally mounted equipment (antennas, lights, probes)'],
        indirect: ['induced voltage and current transients on wiring in the zone', 'effects on equipment connected to that wiring (upset or damage)'],
        refs: ['SAE ARP5412 (aircraft lightning environment and waveforms): not in the knowledge base, unverified', 'SAE ARP5413 (indirect effects certification): not in the knowledge base, unverified', '14 CFR 25.581, 25.954, 25.1316']
    };
    // proposeLightningZones(cadId, {forward, band}): forward = the direction the aircraft flies
    // (default -x, nose at the lowest x). An extremity is the outermost part along +-forward,
    // +-span and up. Rule (engineer to confirm): forward-facing extremities (nose, wing tips'
    // leading edge, nacelle inlets) within `band` mm are 1A; aft extremities (tail cone, tips'
    // trailing parts, fin tip) within `band` are 1B; parts aft of a 1A part inside its swept
    // band are 2A; aft of 1B within band 2B; the band edge between 1A and 2A is 1C; everything
    // else 3. A proposal writes nothing.
    function proposeLightningZones(cadId, opts) {
        opts = opts || {};
        var X = _ctx(cadId); if (!X || !X.parts.length) return { ok: false, err: 'No CAD model.' };
        var fwd = _n3(opts.forward) && _unit(opts.forward) ? _unit(opts.forward) : [-1, 0, 0];
        var band = opts.band > 0 ? P(opts.band, 'engineer') : P(500, 'unverified', null, 'default 500 mm band around an extremity; ARP5414 text not available, engineer to set');
        var up = [0, 0, 1], span = _unit(_cross(up, fwd)) || [0, 1, 0];
        var info = X.parts.map(function (p) { var c = [0, 1, 2].map(function (i) { return (p.bbox.min[i] + p.bbox.max[i]) / 2; }); var cs = _corners(p.bbox);
            return { pid: String(p.pid), name: p.name, f: Math.max.apply(null, cs.map(function (q) { return _dot(q, fwd); })), a: Math.max.apply(null, cs.map(function (q) { return -_dot(q, fwd); })),
                     s: Math.max.apply(null, cs.map(function (q) { return Math.abs(_dot(q, span)); })), u: Math.max.apply(null, cs.map(function (q) { return _dot(q, up); })), lat: _dot(c, span), vert: _dot(c, up), cf: _dot(c, fwd) }; });
        var mf = Math.max.apply(null, info.map(function (x) { return x.f; })), ma = Math.max.apply(null, info.map(function (x) { return x.a; }));
        var ms = Math.max.apply(null, info.map(function (x) { return x.s; })), mu = Math.max.apply(null, info.map(function (x) { return x.u; }));
        var bw = band.value, out = {};
        info.forEach(function (x) {
            if (x.f >= mf - bw) out[x.pid] = { zone: '1A', why: 'forward extremity (within ' + bw + ' mm of the most forward point)' };
            else if (x.s >= ms - bw && x.cf >= x.f - bw - (x.f - x.cf)) out[x.pid] = { zone: x.cf > (info.filter(function (y) { return y.s >= ms - bw; }).reduce(function (s2, y) { return s2 + y.cf; }, 0) / Math.max(1, info.filter(function (y) { return y.s >= ms - bw; }).length)) ? '1A' : '1B', why: 'span extremity (wing or stabilizer tip)' };
            else if (x.a >= ma - bw || x.u >= mu - bw) out[x.pid] = { zone: '1B', why: x.a >= ma - bw ? 'aft extremity' : 'upper extremity (fin tip)' };
        });
        var oneA = info.filter(function (x) { return out[x.pid] && out[x.pid].zone === '1A'; }), oneB = info.filter(function (x) { return out[x.pid] && out[x.pid].zone === '1B'; });
        info.forEach(function (x) {
            if (out[x.pid]) return;
            var swept = function (src) { return src.some(function (y) { return x.cf < y.cf && Math.abs(x.lat - y.lat) <= bw && Math.abs(x.vert - y.vert) <= bw; }); };
            var nearA = oneA.some(function (y) { return x.cf < y.cf && y.cf - x.cf <= bw && Math.abs(x.lat - y.lat) <= bw && Math.abs(x.vert - y.vert) <= bw; });
            if (nearA) out[x.pid] = { zone: '1C', why: 'transition just aft of a 1A extremity (within ' + bw + ' mm)' };
            else if (swept(oneA)) out[x.pid] = { zone: '2A', why: 'swept stroke aft of a 1A region' };
            else if (swept(oneB)) out[x.pid] = { zone: '2B', why: 'swept stroke aft of a 1B region' };
            else out[x.pid] = { zone: '3', why: 'not an extremity or in a swept channel' };
        });
        var parts = Object.keys(out).sort(_cmp).map(function (pid) { return { pid: pid, zone: out[pid].zone, why: out[pid].why, status: 'proposed' }; });
        var zones = LIGHTNING_ZONES.map(function (z) {
            var pids = parts.filter(function (p) { return p.zone === z; }).map(function (p) { return p.pid; });
            var im = _impactFor(X, pids);
            return { zone: z, pids: pids, equipment: im.equipment, conditions: im.conditions, worst: im.worst, functions: im.functions, shared: _sharedExposure(im.equipment) };
        });
        return { ok: true, cadId: X.cadId, band: band, source: LIGHTNING_REF, parts: parts, zones: zones, effects: LIGHTNING_EFFECTS };
    }
    function confirmLightningZones(cadId, assignments, by, opts) {
        opts = opts || {};
        if (!_s(by)) return { ok: false, err: 'Lightning zones go into the analysis only with the name of the engineer who confirmed them.' };
        var rows = _arr(assignments).filter(function (a) { return a && a.pid != null && LIGHTNING_ZONES.indexOf(a.zone) >= 0; }).map(function (a) { return { pid: String(a.pid), zone: a.zone }; }).sort(function (a, b) { return _cmp(a.pid, b.pid); });
        if (!rows.length) return { ok: false, err: 'No valid zone assignments (1A, 1B, 1C, 2A, 2B or 3).' };
        var pc = _pc(); if (!pc.praLightning || typeof pc.praLightning !== 'object') pc.praLightning = {};
        pc.praLightning[cadId] = { parts: rows, confirmedBy: _s(by), confirmedAt: opts.at || new Date().toISOString(), basis: 'proposed by geometry rule, ARP5414 not in the knowledge base' };
        _save(); return { ok: true, count: rows.length };
    }
    function lightningZones(cadId) { var r = (_pc().praLightning || {})[cadId]; return r ? _clone(r) : null; }

    // ---- generic configurable volumes: fire, fluid leak, ice shedding ------------------------
    var GENERIC_KINDS = { fire: 'Fire zone', fluidLeak: 'Fluid leak', iceShedding: 'Ice shedding' };


    // pathSegments(rotorId, modelKey, angles[, length]): 3D line segments for the viewer: the
    // center line of each release angle's path and its two edges (half width), from the c.g. at
    // release along the tangent in the direction of rotation, `length` mm long (default 20 m).
    function pathSegments(rotorId, modelKey, angles, length) {
        var r = rotor(rotorId), fm = FRAGMENT_MODELS[modelKey]; if (!r || !fm) return [];
        var F = _frame(r), g = fm.geom(r.discRadius, r.bladeLength), L = length > 0 ? length : 20000, out = [];
        _arr(angles).forEach(function (th) {
            var t = th * D2R, cs = Math.cos(t), sn = Math.sin(t);
            var S = [0, 1, 2].map(function (i) { return r.center[i] + g.rCg.value * (cs * F.e1[i] + sn * F.e2[i]); });
            var d = [0, 1, 2].map(function (i) { return r.rotation * (-sn * F.e1[i] + cs * F.e2[i]); });
            var n = [0, 1, 2].map(function (i) { return cs * F.e1[i] + sn * F.e2[i]; });
            [-1, 0, 1].forEach(function (k) {
                var o = [0, 1, 2].map(function (i) { return S[i] + k * g.halfWidth.value * n[i]; });
                out.push({ angle: th, edge: k, a: o.map(_r6), b: o.map(function (v, i) { return _r6(v + L * d[i]); }) });
            });
        });
        return out;
    }
    // addGenericVolume(kind, label, box, by): fire zone, fluid leak or ice shedding volume as a
    // box the engineer enters (or takes from selected parts); stored through SLCadZonal.
    function addGenericVolume(kind, label, box, by) {
        var C = _C(); if (!C) return { ok: false, err: 'The CAD / zonal engine is not loaded.' };
        if (!GENERIC_KINDS[kind]) return { ok: false, err: 'Unknown kind: ' + kind + ' (fire, fluidLeak or iceShedding).' };
        if (!_s(by)) return { ok: false, err: 'A risk volume goes into the analysis only with the name of the engineer who entered it.' };
        return C.addRiskVolume({ kind: kind, label: _s(label) || GENERIC_KINDS[kind], source: 'engineer entered by ' + _s(by), shape: { kind: 'box', min: box && box.min, max: box && box.max } });
    }


    // ---- per-function risk view --------------------------------------------------------------
    // functionRiskView(cadId[, {birdOpts, sweepStep}]): for each function (systemsData
    // functions, joined by funcId), the equipment that performs it, their zones and CAD parts,
    // every particular risk and zonal hazard they are exposed to, the worst failure condition
    // and the independence findings. Each line carries `src`: the record it comes from.
    function functionRiskView(cadId, opts) {
        opts = opts || {};
        var X = _ctx(cadId); if (!X) return { ok: false, err: 'No CAD model or the CAD / zonal engine is not loaded.' };
        var C = X.C, Z = root.ZONES, sys = _arr(_g('systemsData')).filter(function (s) { return s && s.id != null; });
        var eqParts = C.equipmentParts(X.cadId);
        var fns = {};
        sys.slice().sort(function (a, b) { return _cmp(a.id, b.id); }).forEach(function (s) {
            _arr(s.functions).forEach(function (f) { if (!f) return; var id = String(f.funcId || f.id || f.funcName || ''); if (!id) return;
                var r = fns[id] || (fns[id] = { funcId: id, name: f.funcName || f.name || id, elements: [] }); if (r.elements.indexOf(String(s.id)) < 0) r.elements.push(String(s.id)); });
        });
        // exposures per equipment, each with its source record
        var exp = {}; function add(sid, e) { (exp[sid] = exp[sid] || []).push(e); }
        var volTo = {};
        C.riskVolumes().forEach(function (v) {
            var hit = {}; C.partsInVolume(v.id, X.cadId).forEach(function (p) { var sid = X.conf[p.pid]; if (sid) (hit[sid] = hit[sid] || []).push(p.pid); });
            var im = Object.keys(hit).length ? C.riskImpact(v.id, { cadId: X.cadId }) : null;
            Object.keys(hit).sort(_cmp).forEach(function (sid) { add(sid, { kind: 'volume', risk: v.kind, label: v.label, worst: im ? im.worst : null, pids: hit[sid], src: 'praVolumes/' + v.id }); });
        });
        rotors().forEach(function (r) {
            var sw = sweep(r.id, { cadId: X.cadId, step: opts.sweepStep || 1 }); if (!sw.ok) return;
            sw.models.forEach(function (m) {
                var per = {};
                m.angles.forEach(function (a) { a.equipment.forEach(function (sid) { var q = per[sid] || (per[sid] = { n: 0, worst: null }); q.n++; if (a.worst && (q.worst == null || SEV_ORDER.indexOf(a.worst) < SEV_ORDER.indexOf(q.worst))) q.worst = a.worst; }); });
                Object.keys(per).sort(_cmp).forEach(function (sid) { add(sid, { kind: 'rotorBurst', risk: 'rotorBurst', label: r.label + ': ' + m.label + ' (' + per[sid].n * sw.step + ' degrees of release)', worst: per[sid].worst, src: 'praRotors/' + r.id + '#' + m.model }); });
            });
        });
        tires().forEach(function (t) {
            var tt = tireCaseResults(t.id, { cadId: X.cadId }); if (!tt.ok) return;
            tt.models.forEach(function (m) { _arr(m.equipment).forEach(function (sid) { add(sid, { kind: 'tireBurst', risk: 'tireBurst', label: t.label + ': ' + m.label + ' (gear ' + m.gear + ')', worst: m.worst, src: 'praTires/' + t.id + '#' + m.caseKey }); }); });
        });
        if (opts.bird !== false) {
            var be = birdExposure(X.cadId, opts.birdOpts || {});
            if (be.ok) be.zones.forEach(function (z) { z.equipment.forEach(function (sid) { add(sid, { kind: 'birdStrike', risk: 'birdStrike', label: 'Bird strike on ' + z.name, worst: z.worst, src: 'bird/' + z.pid }); }); });
        }
        var lz = lightningZones(X.cadId);
        if (lz) lz.parts.forEach(function (p) { var sid = X.conf[p.pid]; if (sid) add(sid, { kind: 'lightning', risk: 'lightning', label: 'Lightning zone ' + p.zone + ' (confirmed by ' + lz.confirmedBy + ')', worst: null, src: 'praLightning/' + X.cadId + '#' + p.pid }); });
        var zsa = _arr(_g('zsaData'));
        var flags = []; try { flags = C.independenceFlags({ cadId: X.cadId }); } catch (_) {}
        var rows = Object.keys(fns).sort(_cmp).map(function (fid) {
            var f = fns[fid]; f.elements.sort(_cmp);
            var lines = [], worst = null;
            var els = f.elements.map(function (sid) {
                var z = Z && Z.zoneOf ? Z.zoneOf(sid) : null;
                var e = _arr(exp[sid]).slice().sort(function (a, b) { return _cmp(a.kind, b.kind) || _cmp(a.src, b.src); });
                e.forEach(function (x) { lines.push(Object.assign({ sysId: sid }, x)); if (x.worst && (worst == null || SEV_ORDER.indexOf(x.worst) < SEV_ORDER.indexOf(worst))) worst = x.worst; });
                if (z) {
                    var zi = C.zoneImpact(z.id); if (zi && zi.worst && (worst == null || SEV_ORDER.indexOf(zi.worst) < SEV_ORDER.indexOf(worst))) worst = zi.worst;
                    lines.push({ sysId: sid, kind: 'zone', risk: 'zonal', label: 'Zone ' + _zoneLabel(z.id) + ' compromised', worst: zi ? zi.worst : null, src: 'zones/' + z.id });
                    zsa.filter(function (r) { var t = _s(r && r.zoneId).toLowerCase(); return t && (t === String(z.id).toLowerCase() || (z.code && t === _s(z.code).toLowerCase()) || (z.name && t === _s(z.name).toLowerCase())); })
                       .forEach(function (r) { lines.push({ sysId: sid, kind: 'zsa', risk: 'zonal', label: 'Zonal safety row ' + (r.hazard || r.desc || ('#' + r.internalId)), worst: r.severity || null, src: 'zsaData/' + r.internalId }); });
                }
                return { sysId: sid, name: (sys.filter(function (s) { return String(s.id) === sid; })[0] || {}).name || sid, zoneId: z ? z.id : null, zone: z ? _zoneLabel(z.id) : null, parts: _arr(eqParts[sid]), linked: _arr(eqParts[sid]).length > 0 };
            });
            var indep = flags.filter(function (fl) { return fl.equipment.filter(function (s) { return f.elements.indexOf(s) >= 0; }).length >= 1 && fl.equipment.length >= 2; })
                .map(function (fl) { return { severity: fl.severity, kind: fl.kind, text: fl.text, src: 'independence/' + fl.id }; });
            var missing = els.filter(function (e) { return !e.linked; }).map(function (e) { return e.sysId; });
            return { funcId: fid, name: f.name, elements: els, exposures: lines, worst: worst, independence: indep,
                     missing: missing.length ? 'No confirmed CAD part for: ' + missing.join(', ') + ' (exposure to CAD-based risks is not known for these)' : null };
        });
        return { ok: true, cadId: X.cadId, functions: rows };
    }


    // ---- rotor burst in three steps (14 Oct 2026, guided flow) -------------------------------
    // Step 1: location, disc diameter, disc mass and redline speed, each ticked by the engineer.
    // Step 2 (fragment types) unlocks only when all four are ticked. Step 3: one report per type.
    var STEP1_FIELDS = ['location', 'diameter', 'mass', 'rpm'];
    var DEFAULT_TYPES = ['oneThirdDisc', 'intermediate', 'small'];       // 9a, 9b, 9d on; 9c and 9e optional
    function confirmRotorField(rotorId, field, by, on, opts) {
        opts = opts || {};
        var r = rotor(rotorId); if (!r) return { ok: false, err: 'Rotor not found.' };
        if (STEP1_FIELDS.indexOf(field) < 0 && field !== 'axialWidth') return { ok: false, err: 'Unknown field: ' + field };
        if (on !== false && !_s(by)) return { ok: false, err: 'A value is confirmed only with the engineer\'s name.' };
        var have = field === 'axialWidth' ? (typeof r.fragmentAxialWidthMm === 'number' && r.fragmentAxialWidthMm >= 0) : field === 'location' ? (_n3(r.center) && _n3(r.axis)) : field === 'diameter' ? r.discRadius > 0 : field === 'mass' ? r.bladedDiscMassKg > 0 : r.rpm > 0;
        if (on !== false && !have) return { ok: false, err: 'Enter the value before confirming it.' };
        r.confirms = r.confirms || {};
        if (on === false) delete r.confirms[field]; else r.confirms[field] = { by: _s(by), at: opts.at || new Date().toISOString() };
        _save(); return { ok: true };
    }
    function step1Status(rotorId) {
        var r = rotor(rotorId); if (!r) return { ok: false, unlocked: false, missing: STEP1_FIELDS.slice() };
        var c = r.confirms || {}, missing = STEP1_FIELDS.filter(function (f) { return !c[f]; });
        return { ok: true, unlocked: missing.length === 0, missing: missing, confirms: _clone(c) };
    }
    // fragmentEnergy(rotor, model): translational kinetic energy at the redline speed, 1/2 m v^2,
    // v = omega x the c.g. radius of that fragment model. Mass per the AC where it gives one;
    // otherwise the engineer's entry, labeled as not from the AC; otherwise missing.
    function fragmentEnergy(r, k) {
        var fm = FRAGMENT_MODELS[k]; if (!r || !fm) return null;
        var g = fm.geom(r.discRadius, r.bladeLength || 0);
        var mass;
        if (fm.massFraction.value != null) mass = r.bladedDiscMassKg ? P(_r6(fm.massFraction.value * r.bladedDiscMassKg), 'derived', fm.massFraction.ref, 'fraction of the confirmed disc mass') : P(null, 'missing', null, 'disc mass not entered');
        else if (k === 'small' && r.smallFragmentMassKg) mass = P(r.smallFragmentMassKg, 'engineer', null, 'not from the AC, engineer input');
        else if (k === 'fanBlade' && r.fanBladeFragmentMassKg) mass = P(r.fanBladeFragmentMassKg, 'engineer', 'ac20128a-fig5', '1/3 of the airfoil mass (Figure 5); the mass value is not from the AC, engineer input');
        else mass = P(null, 'missing', null, 'not from the AC: engineer input needed (' + (fm.massFraction.note || 'no mass in the AC') + ')');
        var omega = r.rpm ? r.rpm * 2 * Math.PI / 60 : null;
        var vNote = { oneThirdDisc: 'redline speed x c.g. radius; c.g. at the sector centroid per Appendix 1 4.1(a)', alternate: 'redline speed x c.g. radius; c.g. at the sector centroid per Appendix 1 4.1(a)', intermediate: 'rim speed: redline speed x disc radius (Figure 4: c.g. on the disc rim)', small: 'redline speed x the middle of the tip half of the blade', fanBlade: 'redline speed x the c.g. radius (Figure 5: c.g. at the centerline of the 1/3 fragment)' }[k];
        var v = omega != null ? P(_r6(omega * g.rCg.value / 1000), 'derived', k === 'intermediate' ? 'ac20128a-fig4' : k === 'fanBlade' ? 'ac20128a-fig5' : g.rCg.ref, vNote) : P(null, 'missing', null, 'redline speed not entered');
        var eNote = { oneThirdDisc: '1/2 m v^2: translational energy per AC 20-128A 9a; rotational energy (about 0.65x for a uniform 120 deg sector) not included. c.g. at the sector centroid per Appendix 1 4.1(a); AC Figure 3 places it on the maximum dimension (chord), which gives lower energy; the centroid is used as the conservative reading',
                      intermediate: '1/2 m v^2 at rim speed (para 9b, Figure 4), rotational energy neglected', fanBlade: '1/2 m v^2 at the speed of the Figure 5 c.g. (para 9e), rotational energy neglected', small: '1/2 m v^2' }[k === 'alternate' ? 'oneThirdDisc' : k];
        var e = (mass.value != null && v.value != null) ? P(_r6(0.5 * mass.value * v.value * v.value), 'derived', fm.spread.ref, eNote) : P(null, 'missing', null, 'mass or speed missing');
        // the chord reading of Figure 3 (c.g. on the maximum dimension, r cos 60 = r/2 from the axis), shown beside the centroid value
        var eChord = null; if ((k === 'oneThirdDisc' || k === 'alternate') && mass.value != null && omega != null) { var rCh = (r.discRadius + (r.bladeLength || 0) / 3) / 2, vCh = omega * rCh / 1000; eChord = P(_r6(0.5 * mass.value * vCh * vCh), 'derived', 'ac20128a-9a', 'Figure 3 chord reading: c.g. on the maximum dimension at (R + b/3)/2 = ' + (Math.round(rCh * 10) / 10) + ' mm, speed ' + (Math.round(vCh * 10) / 10) + ' m/s (lower; not used)'); }
        // para 9d, APUs: small fragment energy = 1 % of the total rotational energy of the original rotor stage (engineer input)
        if (k === 'small' && r.kind === 'apu') e = r.stageRotationalEnergyJ ? P(_r6(0.01 * r.stageRotationalEnergyJ), 'derived', 'ac20128a-9d-apu', 'one percent of the total rotational energy of the original rotor stage (para 9d, APUs); the stage energy is an engineer input') : P(null, 'missing', null, 'APU small fragment energy is 1 % of the stage\'s total rotational energy (para 9d): enter the stage rotational energy');
        // D6: a sanity bound on the entered APU stage energy from the confirmed mass, tip radius and speed: a uniform disc,
        // E = 1/4 m R^2 w^2 (not from the AC; labeled). A difference of more than 2x either way is flagged.
        var stageCheck = null;
        if (r.kind === 'apu' && r.bladedDiscMassKg > 0 && r.discRadius > 0 && omega != null) { var Rt = (r.discRadius + (r.bladeLength || 0)) / 1000, eU = 0.25 * r.bladedDiscMassKg * Rt * Rt * omega * omega;
            var ratio2 = r.stageRotationalEnergyJ ? r.stageRotationalEnergyJ / eU : null;
            stageCheck = { estimateJ: P(_r6(eU), 'derived', null, 'sanity bound, not from the AC: uniform disc of the confirmed mass ' + r.bladedDiscMassKg + ' kg and tip radius ' + _r6(Rt * 1000) + ' mm at the confirmed speed, 1/4 m R^2 w^2'), enteredJ: r.stageRotationalEnergyJ ? P(r.stageRotationalEnergyJ, 'engineer') : null, ratio: ratio2 == null ? null : _r6(ratio2),
                warning: ratio2 != null && (ratio2 > 2 || ratio2 < 0.5) ? 'The entered stage rotational energy (' + r.stageRotationalEnergyJ + ' J) differs from the uniform disc estimate (' + _r6(eU) + ' J) by more than 2x (ratio ' + _r6(ratio2) + '): check it.' : null }; }
        var shield = r.shieldCapacityJ ? { capacityJ: P(r.shieldCapacityJ, 'engineer', null, 'not from the AC, engineer input'), holds: e.value != null ? e.value <= r.shieldCapacityJ : null } : null;
        return { massKg: mass, rCgMm: g.rCg, speedMs: v, energyJ: e, energyChordJ: eChord, shield: shield, stageEnergyCheck: k === 'small' ? stageCheck : null };
    }
    // spreadVolume(rotorId, model[, reach]): the drawn shape: a flared disc swept 360 degrees about
    // the rotor axis between -spread and +spread, from the bladed rim out to `reach`, plus the
    // fragment width. spreadMeshPoints(spec[, seg]) gives its vertices (the viewer draws exactly
    // these, and a test reads them back).
    function spreadVolume(rotorId, k, reach) {
        var r = rotor(rotorId), fm = FRAGMENT_MODELS[k]; if (!r || !fm) return null;
        var g = fm.geom(r.discRadius, r.bladeLength || 0), F = _frame(r);
        var spread = (r.spreadOverride && typeof r.spreadOverride[k] === 'number') ? r.spreadOverride[k] : fm.spread.value;
        return { model: k, origin: r.center.slice(), axis: F.a.slice(), e1: F.e1.slice(), e2: F.e2.slice(), halfAngleDeg: spread,
                 // drawn = tested: the spread is an angle from the plane of rotation at the shaft centerline (para 6f) and the
                 // path width lies in that plane, so the region has no extra axial width; it starts where a path can first
                 // reach (the c.g. radius less the half-width, not below 0)
                 innerRadius: _r6(Math.max(0, g.rCg.value - g.halfWidth.value)), outerRadius: _r6(reach > 0 ? reach : 20000), widthMm: (fragmentAxialWidth(r).source === 'engineer' ? fragmentAxialWidth(r).value : 0) || 0, pathHalfWidthMm: g.halfWidth.value };   // R9: the fragment's axial width is drawn as it is tested
    }
    // modelReach(rotorId, cadId): how far the drawn spread goes: 5 percent beyond the farthest
    // part of the model, measured from the rotor axis (display only; the analysis is unbounded).
    function modelReach(rotorId, cadId) {
        var r = rotor(rotorId), X = _ctx(cadId || (r && r.cadId)); if (!r || !X) return 20000;
        var F = _frame(r), far = 0;
        X.parts.forEach(function (p) { _corners(p.bbox).forEach(function (q) { var w = _sub(q, r.center), a = _dot(w, F.a); far = Math.max(far, Math.sqrt(Math.max(0, _dot(w, w) - a * a))); }); });
        return _r6(Math.max(far * 1.05, (r.discRadius + (r.bladeLength || 0)) * 1.5));
    }
    function spreadMeshPoints(sp, seg) {
        seg = sp.outerRadii ? sp.outerRadii.length : (seg || 72);
        var pos = [], idx = [], t = Math.tan(sp.halfAngleDeg * D2R), w = sp.widthMm / 2;
        // per azimuth: 4 points (inner -, inner +, outer +, outer -); the inner edge is widened by
        // the fragment width so even a zero spread shows the path the fragment sweeps
        var arc = (sp.arcDeg > 0 && sp.arcDeg < 360 ? sp.arcDeg : 360) * D2R, a0 = (sp.arcDeg > 0 && sp.arcDeg < 360) ? (sp.arcStartDeg || 0) * D2R : 0;   // a partial sweep from arcStartDeg (an engineer limitation), else a full turn
        for (var i = 0; i <= seg; i++) {
            var az = a0 + arc * i / seg, c = Math.cos(az), s = Math.sin(az);
            var oR = sp.outerRadii ? Math.max(sp.outerRadii[Math.max(0, i - 1)], sp.outerRadii[Math.min(sp.outerRadii.length - 1, i)]) : sp.outerRadius;   // clipped per direction (both segments meeting at this azimuth)
            [[sp.innerRadius, -1], [sp.innerRadius, 1], [oR, 1], [oR, -1]].forEach(function (q) {
                var rho = q[0], h = q[1] * (rho * t + w);
                for (var j = 0; j < 3; j++) pos.push(sp.origin[j] + rho * (c * sp.e1[j] + s * sp.e2[j]) + h * sp.axis[j]);
            });
            if (i < seg) { var b = i * 4, n = b + 4; [[0, 1], [1, 2], [2, 3], [3, 0]].forEach(function (e) { idx.push(b + e[0], b + e[1], n + e[1], b + e[0], n + e[1], n + e[0]); }); }
        }
        return { positions: pos, index: idx };
    }
    // readBackSpread(positions, origin, axis): from drawn vertices, the half angle (largest
    // elevation of an outer vertex less its width term is not separable, so measured at the outer
    // radius, where the width is small next to the flare), origin offset, radii.
    function readBackSpread(pos, sp) {
        var maxRho = 0, minRho = Infinity, maxEl = 0, ax = sp.axis;
        for (var i = 0; i < pos.length; i += 3) {
            var w = [pos[i] - sp.origin[0], pos[i + 1] - sp.origin[1], pos[i + 2] - sp.origin[2]], a = _dot(w, ax);
            var rho = Math.sqrt(Math.max(0, _dot(w, w) - a * a)); maxRho = Math.max(maxRho, rho); minRho = Math.min(minRho, rho);
        }
        for (var j = 0; j < pos.length; j += 3) {
            var w2 = [pos[j] - sp.origin[0], pos[j + 1] - sp.origin[1], pos[j + 2] - sp.origin[2]], a2 = _dot(w2, ax), r2 = Math.sqrt(Math.max(0, _dot(w2, w2) - a2 * a2));
            if (Math.abs(r2 - maxRho) < 1e-6 * Math.max(1, maxRho)) maxEl = Math.max(maxEl, Math.abs(a2) - sp.widthMm / 2);
        }
        return { halfAngleDeg: _r6(Math.atan2(maxEl, maxRho) / D2R), innerRadius: _r6(minRho), outerRadius: _r6(maxRho) };
    }
    // rotorReport(rotorId, model[, {cadId}]): everything one fragment type's report shows.
    function rotorReport(rotorId, k, opts) {
        opts = opts || {};
        var st1 = step1Status(rotorId); if (!st1.unlocked) return { ok: false, err: 'Confirm the rotor location, disc diameter, disc mass and redline speed first (Step 1).', missing: st1.missing };
        var r = rotor(rotorId), fm = FRAGMENT_MODELS[k]; if (!fm) return { ok: false, err: 'Unknown fragment type: ' + k };
        var sw = sweep(rotorId, { cadId: opts.cadId, models: [k], step: opts.step }); if (!sw.ok) return sw;
        var m = sw.models[0]; if (!m) return { ok: false, err: 'This fragment type does not apply to this rotor.' };
        var hitPids = [], eq = [], conds = {};
        m.angles.forEach(function (a) { a.pids.forEach(function (p) { if (hitPids.indexOf(p) < 0) hitPids.push(p); }); a.equipment.forEach(function (e) { if (eq.indexOf(e) < 0) eq.push(e); }); });
        var X = _ctx(sw.cadId), im = X ? _impactFor(X, hitPids.slice().sort(_cmp)) : { conditions: [] };
        // the airplane average (Appendix 1 6.11, Table 1) for this fragment type and, for the one-third disc, the multiple fragment case
        var AV = null; try { var av = averageRisk({ cadId: sw.cadId, alternate: k === 'alternate' }); AV = av.models.filter(function (x) { return x.model === k; })[0] || null; } catch (_) { AV = null; }
        var MF = null; if (k === 'oneThirdDisc') { try { MF = multipleFragments(rotorId, { cadId: sw.cadId }); } catch (_) { MF = null; } }
        var refs = [fm.spread.ref, fm.massFraction.ref, fm.criterion.ref, 'ac20128a-6f', 'ac20128a-app1-4-1a', 'ac20128a-app1-5-5', 'ac20128a-app1-6-5', 'ac20128a-app1-6-6', 'ac20128a-app1-6-8-1', 'ac20128a-app1-6-9', 'ac20128a-app1-6-11', 'ac20128a-app1-table1'].concat(MF ? ['ac20128a-10c3iii'] : []).filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; }).map(ref).filter(Boolean);
        return { ok: true, rotorId: r.id, rotor: r.label, model: k, label: fm.label, optional: !!(fm.optional || fm.fanOnly), spreadDeg: m.spreadDeg, maxDimensionMm: m.maxDimensionMm, rCgMm: m.rCgMm,
                 partsHit: hitPids.sort(_cmp), equipment: eq.sort(_cmp), conditions: im.conditions, worst: im.worst || null,
                 ranges: m.ranges, catastrophicDeg: m.catastrophicDeg, hazardRatio: m.hazardRatio, criterion: m.criterion, meets: m.meets, refusedNote: m.refusedNote || null, assessmentNote: m.assessmentNote,
                 energy: fragmentEnergy(r, k), redlineRpm: P(r.rpm, 'engineer', null, 'confirmed by ' + ((r.confirms.rpm || {}).by || '')), discMassKg: P(r.bladedDiscMassKg, 'engineer', null, 'confirmed by ' + ((r.confirms.mass || {}).by || '')),
                 spreadWeightedDeg: m.spreadWeightedDeg, phaseFactor: m.phaseFactor, riskFactor: m.riskFactor, average: AV, multiple: MF,
                 volume: spreadVolume(rotorId, k, opts.reach), method: sw.method, refs: refs, angles: m.angles };
    }


    // ---- guided flows shared by every particular risk (14 Oct 2026) ---------------------------
    // Each record keeps `confirms` {field: {by, at}}; Step 2 unlocks when every Step 1 field of that
    // risk is ticked with a name. Rotor burst uses STEP1_FIELDS above; tire and bird below.
    var STEP1 = { rotor: STEP1_FIELDS, tire: ['location', 'size', 'pressure', 'speed'] };
    var TIRE_DEFAULT_CASES = ['m1Large', 'm1Small', 'm3Strip'];   // 2 and 4 opt in: their zones are figures in the AMC (unverified) and Model 4 needs a braked wheel
    function _haveField(kind, r, f) {
        if (kind === 'tire') return f === 'location' ? (_n3(r.center) && _n3(r.axis)) : f === 'size' ? (r.grownDiameter > 0 && r.sectionWidth > 0) : f === 'pressure' ? r.ratedPressureKpa > 0 : r.speedRatingMs > 0;
        return false;
    }
    function confirmField(kind, id, field, by, on, opts) {
        if (kind === 'rotor') return confirmRotorField(id, field, by, on, opts);
        opts = opts || {};
        var r = kind === 'tire' ? tire(id) : null; if (!r) return { ok: false, err: 'Record not found.' };
        if ((STEP1[kind] || []).indexOf(field) < 0) return { ok: false, err: 'Unknown field: ' + field };
        if (on !== false && !_s(by)) return { ok: false, err: 'A value is confirmed only with the engineer\'s name.' };
        if (on !== false && !_haveField(kind, r, field)) return { ok: false, err: 'Enter the value before confirming it.' };
        r.confirms = r.confirms || {};
        if (on === false) delete r.confirms[field]; else r.confirms[field] = { by: _s(by), at: opts.at || new Date().toISOString() };
        _save(); return { ok: true };
    }
    function stepStatus(kind, id) {
        if (kind === 'rotor') return step1Status(id);
        var r = kind === 'tire' ? tire(id) : null, F = STEP1[kind] || [];
        if (!r) return { ok: false, unlocked: false, missing: F.slice() };
        var c = r.confirms || {}, missing = F.filter(function (f) { return !c[f]; });
        return { ok: true, unlocked: missing.length === 0, missing: missing, confirms: _clone(c) };
    }
    // tireVolume(tireId, model, reach): the zone drawn for a tire model: the band within theta of the
    // wheel plane, a full turn about the axle (or the engineer's limited arc, from the up direction), from the tread out
    // to the model reach (Model 3: the strip; otherwise the model extent). Null when the zone is not
    // set (Models 2 and 4 until the engineer enters it).
    function tireVolume(tireId, k, reach, gear) {
        var t = tire(tireId), tm = TIRE_MODELS[k]; if (!t || !tm) return null;
        var th = k === 'm2Flange' ? (t.flangeHalfAngleDeg || null) : tm.theta.value; if (th == null) return null;
        // retracted cases (3R, 4) are drawn about the stowed tire center and axle, as they are tested; none until it is confirmed
        var rt = gear === 'retracted'; if (rt && !(t.stowed && t.stowed.confirmedBy)) return null;
        var C0 = rt ? t.stowed.center : t.center, ax = _unit(rt ? t.stowed.axis : t.axis), up = t.upDir || [0, 0, 1], e1 = _unit(_sub(up, [ax[0] * _dot(up, ax), ax[1] * _dot(up, ax), ax[2] * _dot(up, ax)])) || [0, 0, 1];
        var TR = tireReach(tireId), out = k === 'm3Strip' ? t.grownDiameter / 2 + 2.5 * t.sectionWidth : (TR && TR.value > 0 ? TR.value : (reach > 0 ? reach : 10000));   // the same reach as the hit test
        var L = t.arcLimit, span = L ? (((L.toDeg - L.fromDeg) % 360) + 360) % 360 || 360 : 360;
        var spec = { model: k, origin: C0.slice(), axis: ax, e1: e1, e2: _cross(ax, e1), halfAngleDeg: th, innerRadius: 0 /* T10: from the tire center, so hits inside DG/2 are inside the drawing too */, outerRadius: _r6(out), widthMm: 0, arcDeg: span, arcStartDeg: L ? L.fromDeg : 0, seg: 72 };
        // drawn only out to where the zone meets the aircraft: per direction, the farthest point (in-plane radius) of any
        // part triangle that reaches into the zone, capped by the reach; empty air beyond the airframe is not drawn
        var X = _ctx(t.cadId); if (X) {
            var seg = spec.seg, a0 = span < 360 ? (spec.arcStartDeg || 0) * D2R : 0, arc = span * D2R, rad = []; for (var i = 0; i < seg; i++) rad.push(spec.innerRadius);
            X.parts.forEach(function (p) { if (String(p.pid) === t.pid || !p.bbox) return; _trisOfPart(p).tris.forEach(function (tr) {
                if (!_wedgeHitTris([tr], C0, ax, th, out, null)) return;
                var az = [], rr = 0; tr.forEach(function (q) { var w = _sub(q, C0), u = _dot(w, e1), v = _dot(w, spec.e2); rr = Math.max(rr, Math.hypot(u, v)); az.push(Math.atan2(v, u)); });
                rr = Math.min(rr, out);
                // the azimuth span of the triangle (the shorter way round; a triangle around the axle covers every direction)
                var srt = az.map(function (x) { return (x - a0 + 4 * Math.PI) % (2 * Math.PI); }).sort(function (x, y) { return x - y; }), gaps = [srt[1] - srt[0], srt[2] - srt[1], 2 * Math.PI - srt[2] + srt[0]], gi = gaps.indexOf(Math.max.apply(null, gaps));
                var from = srt[(gi + 1) % 3], len = 2 * Math.PI - gaps[gi]; if (gaps[gi] < Math.PI / 2 && len > 1.5 * Math.PI) { from = 0; len = 2 * Math.PI; }
                for (var i2 = 0; i2 < seg; i2++) { var s0 = arc * i2 / seg, s1 = arc * (i2 + 1) / seg, rel0 = ((s0 - from) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), rel1 = rel0 + (s1 - s0);
                    if (rel0 <= len + 1e-12 || rel1 >= 2 * Math.PI) rad[i2] = Math.max(rad[i2], rr); }
            }); });
            spec.outerRadii = rad.map(function (x) { return _r6(x); });
        }
        return spec;
    }
    // setTireArcLimit(tireId, {fromDeg, toDeg, justification} | null, by): the engineer may limit the
    // directions considered, with a written justification; it shows in every report as an engineer
    // limitation. Clearing it needs a name too.
    function setTireArcLimit(tireId, lim, by, opts) {
        opts = opts || {}; var t = tire(tireId); if (!t) return { ok: false, err: 'Tire not found.' };
        if (!_s(by)) return { ok: false, err: 'An arc limitation needs the name of the engineer.' };
        if (lim == null) { t.arcLimit = null; _save(); return { ok: true }; }
        if (typeof lim.fromDeg !== 'number' || typeof lim.toDeg !== 'number' || !isFinite(lim.fromDeg) || !isFinite(lim.toDeg)) return { ok: false, err: 'Enter the start and end angles (degrees from up, about the axle).' };
        if (_s(lim.justification).length < 10) return { ok: false, err: 'Write the justification for limiting the arc (at least a sentence).' };
        t.arcLimit = { fromDeg: lim.fromDeg, toDeg: lim.toDeg, justification: _s(lim.justification), by: _s(by), at: opts.at || new Date().toISOString() }; _save(); return { ok: true };
    }
    // creditTireShield(tireId, pid, reason, by): the engineer credits a part (structure) as a shield, with a reason; null reason removes it
    function creditTireShield(tireId, pid, reason, by, opts) {
        opts = opts || {}; var t = tire(tireId); if (!t) return { ok: false, err: 'Tire not found.' }; if (!_s(by)) return { ok: false, err: 'A shield is credited only with the engineer\'s name.' };
        t.shields = _arr(t.shields).filter(function (x) { return x.pid !== String(pid); }); if (reason == null) { _save(); return { ok: true }; }
        if (_s(reason).length < 10) return { ok: false, err: 'Write why this part stops the debris (at least a sentence).' };
        t.shields.push({ pid: String(pid), reason: _s(reason), by: _s(by), at: opts.at || new Date().toISOString() }); _save(); return { ok: true };
    }
    // setTireOutboard(tireId, dir, by): the wheel's outboard direction (Model 2 lateral release), engineer confirmed
    function setTireOutboard(tireId, dir, by, opts) {
        opts = opts || {}; var t = tire(tireId); if (!t) return { ok: false, err: 'Tire not found.' }; if (!_s(by)) return { ok: false, err: 'The outboard direction is confirmed only with the engineer\'s name.' };
        if (!_n3(dir) || !_unit(dir)) return { ok: false, err: 'Enter the outboard direction (three numbers).' };
        t.outboard = { dir: _unit(dir), confirmedBy: _s(by), at: opts.at || new Date().toISOString() }; _save(); return { ok: true };
    }
    // setTireWheelsPerLeg(tireId, n, by): the number of wheels on this landing gear leg, an engineer
    // confirmed input (T4). AMC 25.734 Model 2: with several wheels only the outer wheel half flange is
    // released laterally (outboard); with a single wheel either flange (inboard and outboard cones).
    function setTireWheelsPerLeg(tireId, n, by, opts) {
        opts = opts || {}; var t = tire(tireId); if (!t) return { ok: false, err: 'Tire not found.' }; if (!_s(by)) return { ok: false, err: 'The number of wheels on the leg is confirmed only with the engineer\'s name.' };
        n = Number(n); if (!(n >= 1) || Math.floor(n) !== n) return { ok: false, err: 'Enter the number of wheels on this landing gear leg (1, 2, 4, ...).' };
        t.wheelsPerLeg = { value: n, by: _s(by), at: opts.at || new Date().toISOString() }; _save(); return { ok: true };
    }
    // setTireFlangeRadius(tireId, mm, by): the wheel flange rim radius (timebox 46): not from the AMC text, engineer input.
    // Model 2 rays start on the flange rim at this radius on the released side; without it Model 2 is refused.
    function setTireFlangeRadius(tireId, mm, by, opts) {
        opts = opts || {}; var t = tire(tireId); if (!t) return { ok: false, err: 'Tire not found.' }; if (!_s(by)) return { ok: false, err: 'The flange radius is confirmed only with the engineer\'s name.' };
        mm = Number(mm); if (!(mm > 0)) return { ok: false, err: 'Enter the wheel flange rim radius in mm.' };
        t.flangeRadius = { value: mm, by: _s(by), at: opts.at || new Date().toISOString() }; _save(); return { ok: true };
    }
    // tireConeMesh(tireId): Model 2 drawn exactly as tested: the cone of half angle theta about the outboard
    // direction from the tire center, out to the reach
    function tireConeMesh(tireId, seg, inboard) {
        var t = tire(tireId); if (!t || !t.outboard || !t.flangeHalfAngleDeg) return null; seg = seg || 48;
        var a = inboard ? t.outboard.dir.map(function (v) { return -v; }) : t.outboard.dir, e1 = _unit(_cross(a, Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = _cross(a, e1), TR = tireReach(tireId), L = TR ? TR.value : 10000, th = t.flangeHalfAngleDeg * D2R;
        var pos = t.center.slice(), idx = [], h = L * Math.cos(th), rr = L * Math.sin(th);
        for (var i = 0; i < seg; i++) { var ang = 2 * Math.PI * i / seg; for (var j = 0; j < 3; j++) pos.push(t.center[j] + a[j] * h + rr * (Math.cos(ang) * e1[j] + Math.sin(ang) * e2[j])); }
        for (var i2 = 0; i2 < seg; i2++) idx.push(0, 1 + i2, 1 + (i2 + 1) % seg);
        return { positions: pos, index: idx, halfAngleDeg: t.flangeHalfAngleDeg, lengthMm: L, axis: a.slice(), apex: t.center.slice() };
    }
    function setTireStowed(tireId, v, by, opts) {
        opts = opts || {}; var t = tire(tireId); if (!t) return { ok: false, err: 'Tire not found.' }; if (!_s(by)) return { ok: false, err: 'The stowed position is confirmed only with the engineer\'s name.' };
        if (!v || !_n3(v.center) || !_n3(v.axis) || !_unit(v.axis)) return { ok: false, err: 'Enter the stowed tire center and axle direction.' };
        t.stowed = { center: v.center.slice(), axis: _unit(v.axis), confirmedBy: _s(by), at: opts.at || new Date().toISOString() }; _save(); return { ok: true };
    }
    function setTireGear(tireId, gear, by) { var t = tire(tireId); if (!t) return { ok: false, err: 'Tire not found.' }; if (!_s(by)) return { ok: false, err: 'Name needed.' }; var g = _arr(gear).filter(function (x) { return x === 'extended' || x === 'retracted'; }); if (!g.length) return { ok: false, err: 'Choose gear extended, retracted in the well, or both.' }; t.gear = g; _save(); return { ok: true }; }
    // cases: AMC 25.734 3.1: extended: Models 1, 2, 3E; retracting or retracted: Models 3R, 4
    var GEAR_MODELS = { extended: ['m1Large', 'm1Small', 'm2Flange', 'm3Strip'], retracted: ['m3Strip', 'm4Burst'] };
    // T9: one place that runs every tire case at its gear position (AMC 25.734 3.1): Models 1, 2 and 3E with the gear extended,
    // 3R and 4 about the stowed tire (only once the stowed position is confirmed; listed as not computed otherwise). Model 4 is
    // never run at the extended position. Used by the function view, the panel and the AI context.
    function tireCaseResults(tireId, opts) {
        opts = opts || {}; var t = tire(tireId); if (!t) return { ok: false, err: 'Tire not found.' };
        var ext = tireThreats(tireId, { cadId: opts.cadId }); if (!ext.ok) return ext;
        var models = ext.models.filter(function (m) { return GEAR_MODELS.extended.indexOf(m.model) >= 0; }).map(function (m) { return Object.assign({}, m, { gear: 'extended', caseKey: 'extended|' + m.model }); });
        var ret = tireThreats(tireId, { cadId: opts.cadId, retracted: true });
        GEAR_MODELS.retracted.forEach(function (k) {
            if (!ret.ok) { models.push({ model: k, gear: 'retracted', caseKey: 'retracted|' + k, label: TIRE_MODELS[k].label, applies: true, incomplete: true, hits: [], equipment: [], conditions: [], worst: null, note: ret.err }); return; }
            var m = ret.models.filter(function (x) { return x.model === k; })[0]; if (m) models.push(Object.assign({}, m, { gear: 'retracted', caseKey: 'retracted|' + k }));
        });
        return { ok: true, tireId: t.id, label: t.label, cadId: ext.cadId, models: models, method: ext.method };
    }
    var GEAR_DEFAULTS = { extended: ['m1Large', 'm1Small', 'm3Strip'], retracted: ['m3Strip', 'm4Burst'] };
    function tireCases(tireId) { var t = tire(tireId); if (!t) return []; var out = []; (t.gear || ['extended']).forEach(function (g) { GEAR_MODELS[g].forEach(function (k) { out.push({ key: g + '|' + k, gear: g, model: k, isDefault: GEAR_DEFAULTS[g].indexOf(k) >= 0 }); }); }); return out; }
    // tireReport(tireId, model): one AMC 25.734 model as a report, from tireThreats.
    function tireReport(tireId, k, opts) {
        opts = opts || {};
        var s1 = stepStatus('tire', tireId); if (!s1.unlocked) return { ok: false, err: 'Confirm the tire location, size, pressure and speed rating first (Step 1).', missing: s1.missing };
        var gear = 'extended'; if (String(k).indexOf('|') > 0) { gear = k.split('|')[0]; k = k.split('|')[1]; }
        var t = tire(tireId), tm = TIRE_MODELS[k]; if (!tm) return { ok: false, err: 'Unknown tire model: ' + k };
        if ((GEAR_MODELS[gear] || []).indexOf(k) < 0) return { ok: false, err: 'Model ' + k + ' does not apply with the gear ' + gear + ' (AMC 25.734 3.1).' };
        var all = tireThreats(tireId, { cadId: opts.cadId, retracted: gear === 'retracted' }); if (!all.ok) return all;
        var m = all.models.filter(function (x) { return x.model === k; })[0];
        var refIds = { m1Large: ['amc25-734-m1', 'amc25-734-m1c'], m1Small: ['amc25-734-m1'], m2Flange: ['amc25-734-m2', 'amc25-734-m2w'], m3Strip: ['amc25-734-m3'], m4Burst: ['amc25-734-m4', 'amc25-734-m4e'] }[k];
        return { ok: true, kind: 'tire', tireId: t.id, tire: t.label, model: k, gear: gear, caseKey: gear + '|' + k, label: tm.label + (k === 'm3Strip' ? (gear === 'retracted' ? ' (3R, retracted)' : ' (3E, extended)') : '') + ', gear ' + (gear === 'retracted' ? 'retracted in the well' : 'extended'), optional: GEAR_DEFAULTS[gear].indexOf(k) < 0,
                 limitation: t.arcLimit ? 'engineer limitation: directions ' + t.arcLimit.fromDeg + ' to ' + t.arcLimit.toDeg + ' degrees about the axle from up only. ' + t.arcLimit.justification + ' (' + t.arcLimit.by + ')' : null, applies: m.applies !== false, incomplete: !!m.incomplete, note: m.note || null,
                 theta: m.theta || tm.theta, params: m.params || {}, partsHit: (m.hits || []).slice().sort(_cmp), exposure: m.exposure || {}, shielded: m.shielded || [], rayCount: m.rayCount || {}, rayNote: m.rayNote || null, wheelWellHits: m.wheelWellHits || [], equipment: m.equipment || [], conditions: m.conditions || [], worst: m.worst || null, shared: m.shared || [],
                 refs: ['cs25-734'].concat(refIds).map(ref).filter(Boolean), method: all.method };
    }


    // ---- bird strike, guided (14 Oct 2026) -----------------------------------------------------
    // Step 1: certification basis (drives the cited rule), impact speed (an engineer input in m/s,
    // with the speed the rule names shown beside it; never computed), depth behind the surface
    // (an engineer input), each ticked with a name. Step 2: exposed parts proposed from the CAD
    // (first met along the flight direction), each with the rule case it falls under; the engineer
    // confirms the zones. Step 3: one report per zone.
    STEP1.bird = ['basis', 'speed', 'depth'];
    function _birds() { var pc = _pc(); if (!Array.isArray(pc.praBirds)) pc.praBirds = []; return pc.praBirds; }
    function birds() { return _arr(_pc().praBirds).slice().sort(function (a, b) { return _cmp(a.id, b.id); }); }
    function bird(id) { return _arr(_pc().praBirds).filter(function (b) { return b && b.id === id; })[0] || null; }
    function saveBird(b, by, opts) {
        opts = opts || {}; if (!_s(by)) return { ok: false, err: 'Bird strike values go into the analysis only with the engineer\'s name.' };
        var arr = _birds(), id = _s(b && b.id); if (!id) { var pc = _pc(); pc.praBirdSeq = (pc.praBirdSeq || 0) + 1; id = 'bird-' + pc.praBirdSeq; }
        var old = bird(id) || {}, has = function (k) { return b && Object.prototype.hasOwnProperty.call(b, k) && b[k] !== undefined; };
        // a partial save changes only the fields it gives (sixth audit); a confirmation is dropped only for a field whose value changed
        var basis = has('basis') ? (basisKey(b.basis) || null) : (old.basis || null), basisText = has('basis') ? _s(b.basis) : (old.basisText || '');
        var speedMs = has('speedMs') ? (b.speedMs > 0 ? b.speedMs : null) : (old.speedMs || null), depthMm = has('depthMm') ? (b.depthMm > 0 ? b.depthMm : null) : (old.depthMm || null);
        var confirms = has('confirms') && typeof b.confirms === 'object' ? _clone(b.confirms) : _clone(old.confirms || {});
        if (!has('confirms')) { if (basis !== (old.basis || null)) delete confirms.basis; if (speedMs !== (old.speedMs || null)) delete confirms.speed; if (depthMm !== (old.depthMm || null)) delete confirms.depth; }
        var rec = { id: id, label: _s(b.label) || old.label || 'Bird strike', cadId: b.cadId || old.cadId || null, basis: basis, basisText: basisText,
                    speedMs: speedMs, depthMm: depthMm, direction: _n3(b.direction) && _unit(b.direction) ? _unit(b.direction) : (old.direction || [1, 0, 0]),
                    confirms: confirms, zones: Array.isArray(b.zones) ? _clone(b.zones) : (old.zones || []),
                    // later confirmations survive a re-save (timebox 45): credited shields, bird diameter, Part 23 level 4
                    shields: _arr(old.shields).map(_clone), diameter: old.diameter ? _clone(old.diameter) : null, level4: old.level4 ? _clone(old.level4) : null, proposal: old.proposal ? _clone(old.proposal) : null };
        var i = arr.findIndex(function (x) { return x && x.id === id; }); if (i >= 0) arr[i] = rec; else arr.push(rec);
        _save(); return { ok: true, bird: _clone(rec) };
    }
    var _haveField0 = _haveField;
    _haveField = function (kind, r, f) { if (kind === 'bird') return f === 'basis' ? !!r.basis : f === 'speed' ? r.speedMs > 0 : r.depthMm > 0; return _haveField0(kind, r, f); };
    var _confirmField0 = confirmField, _stepStatus0 = stepStatus;
    confirmField = function (kind, id, field, by, on, opts) {
        if (kind !== 'bird') return _confirmField0(kind, id, field, by, on, opts);
        opts = opts || {}; var r = bird(id); if (!r) return { ok: false, err: 'Record not found.' };
        if (STEP1.bird.indexOf(field) < 0) return { ok: false, err: 'Unknown field: ' + field };
        if (on !== false && !_s(by)) return { ok: false, err: 'A value is confirmed only with the engineer\'s name.' };
        if (on !== false && !_haveField('bird', r, field)) return { ok: false, err: 'Enter the value before confirming it.' };
        r.confirms = r.confirms || {}; if (on === false) delete r.confirms[field]; else r.confirms[field] = { by: _s(by), at: opts.at || new Date().toISOString() };
        _save(); return { ok: true };
    };
    stepStatus = function (kind, id) {
        if (kind !== 'bird') return _stepStatus0(kind, id);
        var r = bird(id), F = STEP1.bird; if (!r) return { ok: false, unlocked: false, missing: F.slice() };
        var c = r.confirms || {}, missing = F.filter(function (f) { return !c[f]; }); return { ok: true, unlocked: missing.length === 0, missing: missing, confirms: _clone(c) };
    };
    // the speed each case's rule names (shown, never computed)
    function birdSpeedRule(basis) { var k = basisKey(basis) || basis; return (BIRD_CASES[k] || []).map(function (c) { return { id: c.id, speedRule: c.speed, ref: c.massKg.ref }; }); }
    // setBirdDiameter(birdId, mm, by): the bird diameter that sets the ray spacing (B4). Not from the rule text: an
    // engineer input, labeled as such, confirmed with a name.
    function setBirdDiameter(birdId, mm, by, opts) {
        opts = opts || {}; var b = bird(birdId); if (!b) return { ok: false, err: 'Bird case not found.' }; if (!_s(by)) return { ok: false, err: 'The bird diameter is confirmed only with the engineer\'s name.' };
        mm = Number(mm); if (!(mm > 0)) return { ok: false, err: 'Enter the bird diameter in mm.' };
        b.diameter = { value: mm, by: _s(by), at: opts.at || new Date().toISOString() }; _save(); return { ok: true };
    }
    // setBirdLevel4(birdId, on, by): Part 23 airplane certification level 4 confirmed (B5): only then the 23.2320(b) windshield case
    function setBirdLevel4(birdId, on, by, opts) {
        opts = opts || {}; var b = bird(birdId); if (!b) return { ok: false, err: 'Bird case not found.' }; if (!_s(by)) return { ok: false, err: 'The certification level is confirmed only with the engineer\'s name.' };
        b.level4 = on ? { by: _s(by), at: opts.at || new Date().toISOString() } : null; _save(); return { ok: true };
    }
    function _birdDiam(b) { return b && b.diameter && b.diameter.value > 0 && b.diameter.by ? P(b.diameter.value, 'engineer', null, 'not from the rule text, engineer input (confirmed by ' + b.diameter.by + '): sets the ray spacing') : null; }
    var BIRD_RAY_BUDGET = 120000, BIRD_RES = 2, BIRD_REFINE_BUDGET = 400000;
    // _birdCaseFor(name, basisKey, level4): the rule case a part falls under (proposal; the engineer confirms)
    function _birdCaseFor(name, k, level4) {
        var nm = String(name).replace(/[_\-]/g, ' ');
        if (/windshield|windscreen/i.test(nm) && !(k === 'part23' && !level4)) return 'windshield';
        if (k === 'part25' && /\b(fin|stabili[sz]er|empennage|tail|elevator|rudder)\b/i.test(nm)) return 'empennage';
        return (BIRD_CASES[k] || []).some(function (c) { return c.id === 'structure'; }) ? 'structure' : ((BIRD_CASES[k] || [])[0] || {}).id || 'structure';
    }
    // birdZoneProposal(birdId) (B3): rays from ahead along the flight direction over the whole aircraft frontal area at
    // the confirmed bird diameter spacing; each ray's first surface hit is a proposed zone (so a windshield nested in the
    // fuselage box is proposed, with the windshield case). Without part triangles: the box method, said so.
    // timebox 52: no memo. The proposal is computed on an explicit action (computeBirdZones) and stored with a content hash
    // of every input that matters; the panel shows the stored result and flags it stale when the current inputs hash
    // differently. _birdInputHash: FNV-1a (two 32-bit lanes) over the model version, the bird values, the case rules, the
    // CAD model id / file hash / revision, every part id, name and box, and every triangle buffer's contents.
    function _birdInputHash(birdId) {
        var b = bird(birdId), X = b && _ctx(b.cadId); if (!b || !X) return null;
        var h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995, f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
        var mix = function (w) { h1 = Math.imul(h1 ^ (w & 0xff), 16777619) >>> 0; h1 = Math.imul(h1 ^ ((w >>> 8) & 0xff), 16777619) >>> 0; h1 = Math.imul(h1 ^ ((w >>> 16) & 0xff), 16777619) >>> 0; h1 = Math.imul(h1 ^ (w >>> 24), 16777619) >>> 0; h2 = Math.imul(h2 ^ w, 0x5bd1e995) >>> 0; h2 = (h2 ^ (h2 >>> 13)) >>> 0; };
        var str = function (t) { t = String(t); for (var i = 0; i < t.length; i++) mix(t.charCodeAt(i)); mix(0xffff); };
        var C = _C(), mdl = C && C.model ? C.model(X.cadId) : null;
        str(JSON.stringify([VERSION, BIRD_RAY_BUDGET, BIRD_RES, BIRD_REFINE_BUDGET, BIRD_CASES, b.direction, b.diameter && b.diameter.value, b.basis, !!b.level4, X.cadId, mdl && mdl.sha256, mdl && mdl.revision]));
        X.parts.forEach(function (p) { str(JSON.stringify([String(p.pid), p.name, p.bbox])); var t = _triSource ? _triSource(String(p.pid)) : null; mix(t ? t.length : 0); if (t) for (var i = 0; i < t.length; i++) { f32[0] = t[i]; mix(u32[0]); } });
        return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
    }
    function computeBirdZones(birdId, by, opts) {
        opts = opts || {}; var b = bird(birdId); if (!b) return { ok: false, err: 'Bird case not found.' };
        var hash = _birdInputHash(birdId), res = birdZoneProposal(birdId);
        b.proposal = { hash: hash, at: opts.at || new Date().toISOString(), by: _s(by) || null, result: _clone(res) }; _save(); return res;
    }
    function birdProposalState(birdId) {
        var b = bird(birdId); if (!b) return null; var cur = _birdInputHash(birdId), st = b.proposal || null;
        return { stored: st ? _clone(st) : null, hash: cur, stale: !!(st && st.hash !== cur), computed: !!st };
    }
    function birdZoneProposal(birdId) { return _birdZoneProposal(birdId); }
    function _birdZoneProposal(birdId) {
        var b = bird(birdId); if (!b) return { ok: false, err: 'Bird case not found.', zones: [] };
        var X = _ctx(b.cadId); if (!X) return { ok: false, err: 'No CAD model loaded.', zones: [] };
        var nameOf = {}; X.parts.forEach(function (p) { nameOf[String(p.pid)] = p.name || String(p.pid); });
        var tris = {}; if (_triSource) X.parts.forEach(function (p) { var t = _triSource(String(p.pid)); if (t && t.length >= 9) tris[String(p.pid)] = t; });
        if (!Object.keys(tris).length) {
            var ex = birdExposure(b.cadId, { direction: b.direction, basis: b.basis ? ({ part25: 'Part 25', part23: 'Part 23', part29: 'Part 29' })[b.basis] : '', speeds: {} }); if (!ex.ok) return { ok: false, err: ex.err, zones: [] };
            return { ok: true, method: 'box', note: 'No part triangles loaded: proposed from part boxes (a part nested inside another part\'s box is not proposed).', zones: ex.zones.map(function (z) { return { pid: z.pid, name: z.name, caseId: _birdCaseFor(z.name, b.basis, !!b.level4), areaMm2: z.areaMm2 }; }) };
        }
        var D = _birdDiam(b); if (!D) return { ok: false, err: 'Confirm the bird diameter (Step 1, engineer input): it sets the ray spacing.', zones: [] };
        var S = _birdScene(b, X, tris, null); if (!S) return { ok: false, err: 'No part triangles.', zones: [] };
        if (S.refused) return { ok: false, refused: true, notEvaluated: S.refused.replace(/^Not evaluated: /, ''), err: S.refused, zones: [] };
        var first = {}, sets = {}, setAt = function (a, c) { var k = a + ',' + c; if (k in sets) return sets[k]; return (sets[k] = S.kept[k] ? Object.keys(_birdRay(S, S.at(S.cu + (a + 0.5) * S.h, S.cv + (c + 0.5) * S.h)).reach).sort(_cmp).join('|') : ''); };
        S.cells.forEach(function (ac) { setAt(ac[0], ac[1]).split('|').filter(Boolean).forEach(function (q) { first[q] = (first[q] || 0) + 1; }); });
        // F3: adaptive refinement. Each square between four neighboring positions whose reached-part sets differ is split
        // into four, down to BIRD_RES mm; every point evaluated adds its parts. The guarantee: wherever neighboring
        // positions reach different parts, the boundary is resolved to BIRD_RES; a part reached only from inside a square
        // whose four corners (at every level) reach the same parts is not guaranteed to be found.
        var refined = {}, evals = 0, ptMemo = {}, setUV = function (u, v) { var k = Math.round(u * 1000) + ',' + Math.round(v * 1000); if (k in ptMemo) return ptMemo[k]; evals++; return (ptMemo[k] = Object.keys(_birdRay(S, S.at(u, v)).reach).sort(_cmp).join('|')); };
        // a square needs refining only if some part not found yet could be reached from inside it: every such part lies
        // within D/2 + side / sqrt 2 of the path through the square's center (any depth), so that wider cylinder is a
        // safe superset; when it holds no unfound part, refining cannot add one
        // timebox 52, a safe depth cap per square for the proposal: if the triangle the center line meets first covers the
        // whole square (its projection contains the four corners), every center line in the square meets that triangle, so
        // no path in the square goes deeper than the triangle's plane at the deepest corner; a part can be reached only
        // before its path's center line hits something, hence only at or before that depth
        var coverCap = function (u, v, side) { var o = S.at(u + side / 2, v + side / 2), best = Infinity, bi = null, st = S.B.root ? [S.B.root] : [];
            while (st.length) { var nd = st.pop(); if (!_slab(o, S.d, nd, isFinite(best) ? best : 1e12)) continue; if (nd.l) { st.push(nd.l, nd.r); continue; }
                for (var k = nd.lo; k < nd.hi; k++) { var it = S.B.items[S.B.idx[k]], t = _rayTri(o, S.d, it.tri[0], it.tri[1], it.tri[2]); if (t > 1e-6 && t < best) { best = t; bi = it; } } }
            if (!bi) return Infinity;
            var T2 = bi.tri.map(function (q) { return [_dot(q, S.e1), _dot(q, S.e2)]; }), C4 = [[u, v], [u + side, v], [u, v + side], [u + side, v + side]];
            if (!C4.every(function (c) { return _d2PtTri(c, T2[0], T2[1], T2[2]) === 0; })) return Infinity;
            var n = _cross(_sub(bi.tri[1], bi.tri[0]), _sub(bi.tri[2], bi.tri[0])), nd2 = _dot(n, S.d); if (!(Math.abs(nd2) > 1e-12)) return Infinity;
            return Math.max.apply(null, C4.map(function (c) { var oc = S.at(c[0], c[1]); return _dot(n, _sub(bi.tri[0], oc)) / nd2; })); };
        var unfoundNear = function (u, v, side) { var o = S.at(u + side / 2, v + side / 2), rad = S.r + side / Math.SQRT2, stack = S.B.root ? [S.B.root] : [], cap = coverCap(u, v, side);
            while (stack.length) { var nd = stack.pop(); if (!_slab(o, S.d, { min: nd.min.map(function (x) { return x - rad; }), max: nd.max.map(function (x) { return x + rad; }) }, isFinite(cap) ? cap + rad : 1e12)) continue;
                if (nd.l) { stack.push(nd.l, nd.r); continue; }
                for (var k = nd.lo; k < nd.hi; k++) { var it = S.B.items[S.B.idx[k]]; if (first[it.pid] || refined[it.pid]) continue; var tw = _cylT(it.tri, o, S.d, S.e1, S.e2, rad); if (isFinite(tw) && tw <= cap + 1e-9) return true; } }
            return false; };
        // fifth audit: the superset test comes first and alone decides: a square from which a part not yet found could be
        // reached is split down to BIRD_RES even when its four corners reach the same parts (equal corners prove nothing)
        var refine = function (u, v, side, cs) { if (!unfoundNear(u, v, side)) return; if (side / 2 < BIRD_RES - 1e-9 || evals > BIRD_REFINE_BUDGET) return;
            var hs = side / 2, m = [setUV(u + hs, v), setUV(u, v + hs), setUV(u + side, v + hs), setUV(u + hs, v + side), setUV(u + hs, v + hs)];
            m.forEach(function (st2) { st2.split('|').filter(Boolean).forEach(function (q) { if (!first[q]) refined[q] = (refined[q] || 0) + 1; }); });
            refine(u, v, hs, [cs[0], m[0], m[1], m[4]]); refine(u + hs, v, hs, [m[0], cs[1], m[4], m[2]]); refine(u, v + hs, hs, [m[1], m[4], cs[2], m[3]]); refine(u + hs, v + hs, hs, [m[4], m[2], m[3], cs[3]]); };
        var sq = Object.assign({}, S.seedSq); S.cells.forEach(function (ac) { [[-1, -1], [-1, 0], [0, -1], [0, 0]].forEach(function (o2) { sq[(ac[0] + o2[0]) + ',' + (ac[1] + o2[1])] = 1; }); });
        Object.keys(sq).sort().forEach(function (k) { var ac = k.split(',').map(Number), a = ac[0], c = ac[1];
            refine(S.cu + (a + 0.5) * S.h, S.cv + (c + 0.5) * S.h, S.h, [setAt(a, c), setAt(a + 1, c), setAt(a, c + 1), setAt(a + 1, c + 1)]); });
        var cut = evals > BIRD_REFINE_BUDGET;
        if (cut) return { ok: false, refused: true, notEvaluated: 'too many refinement points (more than ' + BIRD_REFINE_BUDGET + ') to resolve the reached-part boundaries to ' + BIRD_RES + ' mm', err: 'Not evaluated: too many refinement points (more than ' + BIRD_REFINE_BUDGET + ') to resolve the reached-part boundaries to ' + BIRD_RES + ' mm', zones: [] };
        var zones = Object.keys(first).concat(Object.keys(refined)).sort(_cmp).map(function (pid) { return { pid: pid, name: nameOf[pid], caseId: _birdCaseFor(nameOf[pid], b.basis, !!b.level4), rays: first[pid] || 0, refinedPoints: refined[pid] || 0, areaMm2: _r6((first[pid] || 0) * S.h * S.h) }; });
        return { ok: true, method: 'cylinder', spacingMm: _r6(S.h), resolutionMm: BIRD_RES, finalSquareMm: _r6(_finalSide(S.h)), refinementPoints: evals, diameter: D, rays: S.rays.length, zones: zones,
                 note: 'The bird swept as a cylinder of the confirmed diameter ' + D.value + ' mm along the flight direction: ' + S.rays.length + ' bird positions at ' + _r6(S.h) + ' mm spacing (D / sqrt 2, never widened; only where the bird can reach geometry: within D/2 of the parts projected along the flight direction), refined to ' + BIRD_RES + ' mm (' + evals + ' refinement points). A part is reached when it comes within D/2 of a bird path (exact triangle against cylinder) before the path\'s center line hits anything. Guarantee: every square between neighboring positions from which a part not yet found could be reached (a part within D/2 plus half the square diagonal of the path through the square center, at any depth: a safe superset) is split again until its side is ' + _r6(_finalSide(S.h)) + ' mm (' + _r6(S.h) + ' mm halved while the half stays at least ' + BIRD_RES + ' mm; points are evaluated at every corner of those squares); so every part reachable under this rule from a set of bird positions that contains a disc of diameter ' + _r6(_finalSide(S.h) * Math.SQRT2) + ' mm is found. A part reachable only from a smaller set of positions can be missed.' + (b.basis === 'part23' && !b.level4 ? ' Part 23: the windshield case (23.2320(b)) is not offered until level 4 is confirmed.' : '') };
    }
    // D3: the bird swept as a cylinder of radius D/2. _cylT(tri, frame): the smallest axial position (along the flight
    // direction) of the part of a triangle inside the infinite cylinder of radius r about the path's center line, or
    // Infinity. The minimum of a linear function over the convex set triangle n cylinder is at a triangle vertex inside
    // the cylinder, where an edge crosses the cylinder, or at the minimum of the ellipse where the triangle's plane cuts
    // the cylinder (if that point is in the triangle): all three are evaluated exactly.
    function _cylT(T, o, d, e1, e2, r) {
        var P = T.map(function (q) { var w = _sub(q, o); return [_dot(w, e1), _dot(w, e2), _dot(w, d)]; }), best = Infinity, r2 = r * r;
        P.forEach(function (q) { if (q[0] * q[0] + q[1] * q[1] <= r2 * (1 + 1e-12) && q[2] < best) best = q[2]; });
        for (var i = 0; i < 3; i++) { var A = P[i], B = P[(i + 1) % 3], du = B[0] - A[0], dv = B[1] - A[1], aa = du * du + dv * dv; if (!(aa > 0)) continue;
            var bb = 2 * (A[0] * du + A[1] * dv), cc = A[0] * A[0] + A[1] * A[1] - r2, disc = bb * bb - 4 * aa * cc; if (disc < 0) continue; var sq = Math.sqrt(disc);
            [(-bb - sq) / (2 * aa), (-bb + sq) / (2 * aa)].forEach(function (t) { if (t >= 0 && t <= 1) { var w = A[2] + t * (B[2] - A[2]); if (w < best) best = w; } }); }
        var m00 = P[1][0] - P[0][0], m01 = P[2][0] - P[0][0], m10 = P[1][1] - P[0][1], m11 = P[2][1] - P[0][1], det = m00 * m11 - m01 * m10;
        if (Math.abs(det) > 1e-12 * Math.max(1, Math.abs(m00 * m11) + Math.abs(m01 * m10))) {
            // alpha, beta on the circle u = r cos t, v = r sin t; w = P0w + alpha (P1w - P0w) + beta (P2w - P0w) = k0 + k1 cos t + k2 sin t
            var i00 = m11 / det, i01 = -m01 / det, i10 = -m10 / det, i11 = m00 / det, wa = P[1][2] - P[0][2], wb = P[2][2] - P[0][2];
            var a0 = -(i00 * P[0][0] + i01 * P[0][1]), b0 = -(i10 * P[0][0] + i11 * P[0][1]);
            var k0 = P[0][2] + a0 * wa + b0 * wb, k1 = r * (i00 * wa + i10 * wb), k2 = r * (i01 * wa + i11 * wb), K = Math.hypot(k1, k2);
            // K = 0: w is the same all round the ellipse (the plane is square to the path): any ellipse point in the triangle
            { var ct = K > 0 ? -k1 / K : 1, st = K > 0 ? -k2 / K : 0, al = a0 + r * (i00 * ct + i01 * st), be = b0 + r * (i10 * ct + i11 * st);
                if (al >= -1e-12 && be >= -1e-12 && al + be <= 1 + 1e-12 && k0 - K < best) best = k0 - K; }
        }
        return best;
    }
    // _birdScene(b, X, tris, pid): the triangles in a BVH, the frame along the flight direction and the bird positions
    // (spacing D / sqrt 2 so the discs of diameter D cover the area with no gap) over the frontal area of the whole
    // aircraft (pid null) or of one part grown by D/2 (the bird can reach it from beside its outline)
    // _d2PtTri(p, A, B, C): distance in the plane from p to the triangle ABC (0 inside); degenerate triangles are segments
    function _d2PtTri(p, A, B, C) {
        var cr = function (o, a, b2) { return (a[0] - o[0]) * (b2[1] - o[1]) - (a[1] - o[1]) * (b2[0] - o[0]); };
        var d1 = cr(A, B, p), d2 = cr(B, C, p), d3 = cr(C, A, p), ar = cr(A, B, C);
        if (Math.abs(ar) > 1e-12 && ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0))) return 0;
        var seg = function (a, b2) { var dx = b2[0] - a[0], dy = b2[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
        return Math.min(seg(A, B), seg(B, C), seg(C, A));
    }
    // _finalSide(h): the side of the smallest squares the refinement reaches: h halved while the half is at least BIRD_RES
    function _finalSide(h) { var sd = h; while (sd / 2 >= BIRD_RES - 1e-9) sd /= 2; return sd; }
    function _birdScene(b, X, tris, pid) {
        var D = _birdDiam(b); if (!D) return null; var r = D.value / 2, items = [], boxes = {};
        X.parts.forEach(function (p) { var q = String(p.pid), T = tris[q]; if (!T) return; boxes[q] = p.bbox; for (var k = 0; k < T.length; k += 9) items.push({ tri: [[T[k], T[k + 1], T[k + 2]], [T[k + 3], T[k + 4], T[k + 5]], [T[k + 6], T[k + 7], T[k + 8]]], pid: q, k: k }); });
        if (!items.length) return null;
        var d = _unit(b.direction), e1 = _unit(_cross(d, Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0])), e2 = _cross(d, e1);
        var u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, start = Infinity;
        Object.keys(boxes).forEach(function (q) { _corners(boxes[q]).forEach(function (c) { start = Math.min(start, _dot(c, d) - 1000 - r); if (pid != null && q !== pid) return; var u = _dot(c, e1), v = _dot(c, e2); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }); });
        if (pid != null) { u0 -= r; u1 += r; v0 -= r; v1 += r; }
        // F2: the spacing is always D / sqrt 2 (never widened). Positions are placed only where the bird can reach
        // geometry: grid cells whose center is within D/2 of a triangle projected along the flight direction (exact 2D
        // point to triangle distance). Over the budget: no result (refused), never a wider spacing.
        var h = D.value / Math.SQRT2, nu = Math.max(1, Math.ceil((u1 - u0) / h)), nv = Math.max(1, Math.ceil((v1 - v0) / h)), raised = false;
        var cu = (u0 + u1) / 2 - nu * h / 2, cv = (v0 + v1) / 2 - nv * h / 2, kept = {}, nk = 0, over = false;
        items.forEach(function (it) { if (over || (pid != null && it.pid !== pid)) return;
            var P2 = it.tri.map(function (q) { return [_dot(q, e1), _dot(q, e2)]; });
            var mnu = Math.min(P2[0][0], P2[1][0], P2[2][0]) - r, mxu = Math.max(P2[0][0], P2[1][0], P2[2][0]) + r, mnv = Math.min(P2[0][1], P2[1][1], P2[2][1]) - r, mxv = Math.max(P2[0][1], P2[1][1], P2[2][1]) + r;
            var a0 = Math.max(0, Math.ceil((mnu - cu) / h - 0.5)), a1 = Math.min(nu - 1, Math.floor((mxu - cu) / h - 0.5)), c0 = Math.max(0, Math.ceil((mnv - cv) / h - 0.5)), c1 = Math.min(nv - 1, Math.floor((mxv - cv) / h - 0.5));
            for (var a = a0; a <= a1 && !over; a++) for (var c = c0; c <= c1; c++) { var key = a + ',' + c; if (kept[key]) continue;
                if (_d2PtTri([cu + (a + 0.5) * h, cv + (c + 0.5) * h], P2[0], P2[1], P2[2]) <= r + 1e-9) { kept[key] = 1; if (++nk > BIRD_RAY_BUDGET) { over = true; break; } } } });
        if (over) return { refused: 'Not evaluated: bird sweep needs more than ' + BIRD_RAY_BUDGET + ' positions at the D / sqrt 2 spacing of ' + _r6(h) + ' mm over the geometry the bird can reach (the budget); the spacing is never widened', h: h, D: D };
        // sixth audit: refinement starts from every lattice square whose center is within D/2 + half its diagonal of a
        // projected triangle, not only from squares next to a kept position (a small part can sit up to sqrt 2 x D/2 from
        // every grid point around it)
        var seedSq = {}, rs = r + h / Math.SQRT2;
        items.forEach(function (it) { if (pid != null && it.pid !== pid) return; var P2 = it.tri.map(function (q) { return [_dot(q, e1), _dot(q, e2)]; });
            var mnu = Math.min(P2[0][0], P2[1][0], P2[2][0]) - rs, mxu = Math.max(P2[0][0], P2[1][0], P2[2][0]) + rs, mnv = Math.min(P2[0][1], P2[1][1], P2[2][1]) - rs, mxv = Math.max(P2[0][1], P2[1][1], P2[2][1]) + rs;
            // square (a, c) spans the centers of cells a..a+1, c..c+1: its center is at cu + (a + 1) h, cv + (c + 1) h
            // not clipped to the grid: positions beyond the frontal box can still reach a part at its edge
            var a0 = Math.ceil((mnu - cu) / h - 1), a1 = Math.floor((mxu - cu) / h - 1), c0 = Math.ceil((mnv - cv) / h - 1), c1 = Math.floor((mxv - cv) / h - 1);
            for (var a = a0; a <= a1; a++) for (var c = c0; c <= c1; c++) { var key = a + ',' + c; if (seedSq[key]) continue; if (_d2PtTri([cu + (a + 1) * h, cv + (c + 1) * h], P2[0], P2[1], P2[2]) <= rs + 1e-9) seedSq[key] = 1; } });
        var rays = [], cells = [];
        Object.keys(kept).map(function (k) { return k.split(',').map(Number); }).sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; }).forEach(function (ac) { var u = cu + (ac[0] + 0.5) * h, v = cv + (ac[1] + 0.5) * h; cells.push(ac); rays.push([0, 1, 2].map(function (i) { return u * e1[i] + v * e2[i] + start * d[i]; })); });
        var at = function (u, v) { return [0, 1, 2].map(function (i) { return u * e1[i] + v * e2[i] + start * d[i]; }); };
        return { B: _bvh(items), d: d, e1: e1, e2: e2, r: r, h: h, nu: nu, nv: nv, raised: raised, rays: rays, cells: cells, kept: kept, seedSq: seedSq, cu: cu, cv: cv, at: at, D: D };
    }
    // _birdRay(S, o, tmaxExtra): center line first hit tc, then every part within D/2 of the path up to tc (or up to
    // tmax when given): { tc, reach: { pid: { t, k } } } with t the part's first axial contact and k its triangle
    function _birdRay(S, o, tmax) {
        var cl = _bvhSegment(S.B, o, S.d, 1e12, null), tc = Infinity; Object.keys(cl).forEach(function (q) { if (cl[q] < tc) tc = cl[q]; });
        var lim = tmax != null ? tmax : tc, reach = {}, stack = S.B.root ? [S.B.root] : [], r = S.r;
        while (stack.length) { var nd = stack.pop(); var gb = { min: nd.min.map(function (v) { return v - r; }), max: nd.max.map(function (v) { return v + r; }) };
            if (!_slab(o, S.d, gb, isFinite(lim) ? lim + r : 1e12)) continue;
            if (nd.l) { stack.push(nd.l, nd.r); continue; }
            for (var k = nd.lo; k < nd.hi; k++) { var it = S.B.items[S.B.idx[k]], t = _cylT(it.tri, o, S.d, S.e1, S.e2, r); if (isFinite(t) && t <= lim + 1e-9 && (!reach[it.pid] || t < reach[it.pid].t)) reach[it.pid] = { t: t, k: it.k }; } }
        return { tc: tc, reach: reach, cl: cl };
    }
    // proposeBirdZones(birdId): the proposed zones (see birdZoneProposal)
    function proposeBirdZones(birdId) { return birdZoneProposal(birdId).zones || []; }
    function confirmBirdZones(birdId, zones, by, opts) {
        opts = opts || {}; var b = bird(birdId); if (!b) return { ok: false, err: 'Not found.' }; if (!_s(by)) return { ok: false, err: 'Zones are confirmed only with the engineer\'s name.' };
        var bad = _arr(zones).filter(function (z) { return z && z.proposedCaseId && z.caseId && z.caseId !== z.proposedCaseId && _s(z.reason).length < 10; });
        if (bad.length) return { ok: false, err: 'Changing the rule case needs a written reason (zone ' + (bad[0].name || bad[0].pid) + ').' };
        if (b.proposal && b.proposal.hash !== _birdInputHash(birdId)) return { ok: false, err: 'The stored proposal is stale (its inputs changed): recompute it before confirming zones.' };
        if (b.basis === 'part23' && !b.level4 && _arr(zones).some(function (z) { return z && z.caseId === 'windshield'; })) return { ok: false, err: 'The Part 23 windshield case (23.2320(b)) applies to level 4 airplanes only: confirm level 4 first.' };
        b.zones = _arr(zones).filter(function (z) { return z && z.pid != null && z.caseId; }).map(function (z) { var r = { pid: String(z.pid), name: _s(z.name) || String(z.pid), caseId: z.caseId, by: _s(by), at: opts.at || new Date().toISOString() };
            if (z.proposedCaseId && z.caseId !== z.proposedCaseId) r.override = { from: z.proposedCaseId, to: z.caseId, reason: _s(z.reason), by: _s(by) }; return r; }).sort(function (a, c) { return _cmp(a.pid, c.pid); });
        _save(); return { ok: true, count: b.zones.length };
    }
    // Bird by rays (when the part triangles are available): a grid of rays along the flight direction
    // over the struck part's frontal area; the footprint is the struck part's triangles hit first; a
    // part is behind the impact when a ray from a footprint point meets its triangles within the depth.
    function _rayBox(o, d, bx) { var t0 = -Infinity, t1 = Infinity; for (var i = 0; i < 3; i++) { if (Math.abs(d[i]) < 1e-12) { if (o[i] < bx.min[i] || o[i] > bx.max[i]) return false; continue; } var ta = (bx.min[i] - o[i]) / d[i], tb = (bx.max[i] - o[i]) / d[i]; t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb)); } return t1 >= Math.max(t0, 0); }
    function birdRays(birdId, pid) {
        var b = bird(birdId), X = b && _ctx(b.cadId); if (!X || !_triSource) return null; pid = String(pid);
        var tris = {}; X.parts.forEach(function (p) { var t = _triSource(String(p.pid)); if (t && t.length >= 9) tris[String(p.pid)] = t; }); if (!tris[pid]) return null;
        var S = _birdScene(b, X, tris, pid); if (!S) return null; if (S.refused) return { refused: S.refused };
        var L = b.depthMm || 0, foot = {}, behind = {}, via = {}, footRays = 0, bsh = {}, shieldOnly = {}; _arr(b.shields).forEach(function (x) { bsh[x.pid] = x; });
        // proc(o, coarse): one bird position; returns its signature (the parts behind the impact it reaches, '' when it does
        // not reach the struck part) for the boundary refinement (timebox 50, the same rule as the proposal)
        var proc = function (o, coarse) {
            var R0 = _birdRay(S, o); if (!R0.reach[pid]) return '';   // the struck part is reached by this bird position
            var t0 = R0.reach[pid].t, R = _birdRay(S, o, t0 + L);
            // the drawn footprint: the struck part's triangles its center line meets first (the disc edge reaches up to D/2 beyond, stated)
            if (coarse) footRays++;
            if (coarse && R0.cl[pid] != null && R0.cl[pid] === R0.tc) { var T1 = tris[pid], bk = -1, bt = Infinity; for (var k1 = 0; k1 < T1.length; k1 += 9) { var tt1 = _rayTri(o, S.d, [T1[k1], T1[k1 + 1], T1[k1 + 2]], [T1[k1 + 3], T1[k1 + 4], T1[k1 + 5]], [T1[k1 + 6], T1[k1 + 7], T1[k1 + 8]]); if (tt1 > 1e-6 && tt1 < bt - 1e-9) { bt = tt1; bk = k1; } } if (bk >= 0) foot[bk] = 1; }
            var L2 = Object.keys(R.reach).filter(function (q) { return q !== pid; }).map(function (q) { return { pid: q, t: R.reach[q].t }; }).sort(function (x, y) { return x.t - y.t || _cmp(x.pid, y.pid); });
            var prev = null, shielded = false;
            L2.forEach(function (h2) { var dd = Math.max(0, h2.t - t0); if (behind[h2.pid] == null || dd < behind[h2.pid]) { behind[h2.pid] = dd; via[h2.pid] = prev; }
                // a credited shield never removes a part (sampling does not prove blocking, D4): it is marked only
                if (shieldOnly[h2.pid] == null) shieldOnly[h2.pid] = true; if (!shielded) shieldOnly[h2.pid] = false;
                if (bsh[h2.pid]) shielded = true; prev = h2.pid; });
            return L2.map(function (h2) { return h2.pid; }).sort(_cmp).join('|') || '-';
        };
        var sig = {}, sigAt = function (a, c) { var k = a + ',' + c; if (k in sig) return sig[k]; return (sig[k] = S.kept[k] ? proc(S.at(S.cu + (a + 0.5) * S.h, S.cv + (c + 0.5) * S.h), true) : ''); };
        S.cells.forEach(function (ac) { sigAt(ac[0], ac[1]); });
        // boundary refinement down to BIRD_RES where neighboring positions see different parts behind the impact and a part
        // not yet found behind it could lie within D/2 + half the square diagonal of the path through the square
        var evals = 0, memo = {}, sigUV = function (u, v) { var k = Math.round(u * 1000) + ',' + Math.round(v * 1000); if (k in memo) return memo[k]; evals++; return (memo[k] = proc(S.at(u, v), false)); };
        // depth bound of the superset: a part behind the impact has its contact within t0 + depth, and t0 is at most the
        // deepest point of the struck part (axial positions measured from the start plane shared by every position)
        var o00 = S.at(0, 0), tStruck = -Infinity, TP = tris[pid]; for (var kq = 0; kq < TP.length; kq += 3) tStruck = Math.max(tStruck, (TP[kq] - o00[0]) * S.d[0] + (TP[kq + 1] - o00[1]) * S.d[1] + (TP[kq + 2] - o00[2]) * S.d[2]);
        var tCap = tStruck + L;
        // a tighter, still safe, cap per square: a struck-part point within D/2 - side / sqrt 2 of the center path is within D/2
        // of every path in the square, so no position in the square has its first contact deeper than that point
        var innerT = function (o, rIn) { if (!(rIn > 0)) return Infinity; var best = Infinity, st = S.B.root ? [S.B.root] : [];
            while (st.length) { var nd = st.pop(); if (!_slab(o, S.d, { min: nd.min.map(function (x) { return x - rIn; }), max: nd.max.map(function (x) { return x + rIn; }) }, isFinite(best) ? best + rIn : 1e12)) continue;
                if (nd.l) { st.push(nd.l, nd.r); continue; }
                for (var k = nd.lo; k < nd.hi; k++) { var it = S.B.items[S.B.idx[k]]; if (it.pid !== pid) continue; var t = _cylT(it.tri, o, S.d, S.e1, S.e2, rIn); if (t < best) best = t; } }
            return best; };
        var unfound = function (u, v, side) { var o = S.at(u + side / 2, v + side / 2), rad = S.r + side / Math.SQRT2, stack = S.B.root ? [S.B.root] : [];
            var tCapSq = Math.min(tCap, innerT(o, S.r - side / Math.SQRT2) + L);
            while (stack.length) { var nd = stack.pop(); if (!_slab(o, S.d, { min: nd.min.map(function (x) { return x - rad; }), max: nd.max.map(function (x) { return x + rad; }) }, tCapSq + rad)) continue;
                if (nd.l) { stack.push(nd.l, nd.r); continue; }
                for (var k = nd.lo; k < nd.hi; k++) { var it = S.B.items[S.B.idx[k]]; if (it.pid === pid || behind[it.pid] != null) continue; var tw = _cylT(it.tri, o, S.d, S.e1, S.e2, rad); if (isFinite(tw) && tw <= tCapSq + 1e-9) return true; } }
            return false; };
        var refine = function (u, v, side, cs) { if (!unfound(u, v, side)) return; if (side / 2 < BIRD_RES - 1e-9 || evals > BIRD_REFINE_BUDGET) return;
            var hs = side / 2, m = [sigUV(u + hs, v), sigUV(u, v + hs), sigUV(u + side, v + hs), sigUV(u + hs, v + side), sigUV(u + hs, v + hs)];
            refine(u, v, hs, [cs[0], m[0], m[1], m[4]]); refine(u + hs, v, hs, [m[0], cs[1], m[4], m[2]]); refine(u, v + hs, hs, [m[1], m[4], cs[2], m[3]]); refine(u + hs, v + hs, hs, [m[4], m[2], m[3], cs[3]]); };
        var sq = Object.assign({}, S.seedSq); S.cells.forEach(function (ac) { [[-1, -1], [-1, 0], [0, -1], [0, 0]].forEach(function (o2) { sq[(ac[0] + o2[0]) + ',' + (ac[1] + o2[1])] = 1; }); });
        Object.keys(sq).sort().forEach(function (k) { var ac = k.split(',').map(Number), a = ac[0], c = ac[1]; refine(S.cu + (a + 0.5) * S.h, S.cv + (c + 0.5) * S.h, S.h, [sigAt(a, c), sigAt(a + 1, c), sigAt(a, c + 1), sigAt(a + 1, c + 1)]); });
        if (evals > BIRD_REFINE_BUDGET) return { refused: 'Not evaluated: too many refinement points (more than ' + BIRD_REFINE_BUDGET + ') to resolve the parts behind the impact to ' + BIRD_RES + ' mm' };
        var T0 = tris[pid], fp = []; Object.keys(foot).map(Number).sort(function (x, y) { return x - y; }).forEach(function (k) { for (var i = 0; i < 9; i++) fp.push(T0[k + i]); });
        return { footprint: fp, footTriangles: fp.length / 9, rays: S.rays.length, footRays: footRays, spacingMm: _r6(S.h), diameter: S.D, resolutionMm: BIRD_RES, finalSquareMm: _r6(_finalSide(S.h)), refinementPoints: evals,
                 behind: Object.keys(behind).sort(function (x, y) { return behind[x] - behind[y] || _cmp(x, y); }).map(function (q) { return { pid: q, depthMm: _r6(behind[q]), exposure: shieldOnly[q] ? 'behind a credited shield (not proven blocked)' : (via[q] ? 'behind ' + via[q] : 'directly behind the struck surface') }; }),
                 method: 'the bird swept as a cylinder of diameter ' + S.D.value + ' mm along the flight direction: ' + S.rays.length + ' positions at ' + _r6(S.h) + ' mm spacing (D / sqrt 2, never widened; only where the bird can reach the struck part), refined in every square from which a part not yet found behind the impact could be reached (D/2 plus half the square diagonal of the center path, any depth: a safe superset) down to squares of ' + _r6(_finalSide(S.h)) + ' mm, so every part behind the impact reachable from a set of positions that contains a disc of diameter ' + _r6(_finalSide(S.h) * Math.SQRT2) + ' mm is found (' + evals + ' refinement points); the struck part is reached by (' + footRays + ' of ' + S.rays.length + ' positions; the drawn footprint is its triangles met first by the path center lines, the disc edge reaching up to D/2 beyond the drawn outline); a part is behind the impact when it comes within D/2 of the path within the depth, measured from the footprint (exact triangle against cylinder)' };
    }
    // creditBirdShield(birdId, pid, reason, by): structure the engineer credits as stopping the bird (with a reason); parts beyond it along a ray are not counted
    function creditBirdShield(birdId, pid, reason, by, opts) {
        opts = opts || {}; var b = bird(birdId); if (!b) return { ok: false, err: 'Bird case not found.' }; if (!_s(by)) return { ok: false, err: 'A shield is credited only with the engineer\'s name.' };
        b.shields = _arr(b.shields).filter(function (x) { return x.pid !== String(pid); }); if (reason == null) { _save(); return { ok: true }; }
        if (_s(reason).length < 10) return { ok: false, err: 'Write why this part stops the bird (at least a sentence).' };
        b.shields.push({ pid: String(pid), reason: _s(reason), by: _s(by), at: opts.at || new Date().toISOString() }); _save(); return { ok: true };
    }
    function birdReport(birdId, pid) {
        var s1 = stepStatus('bird', birdId); if (!s1.unlocked) return { ok: false, err: 'Confirm the certification basis, impact speed and depth first (Step 1).', missing: s1.missing };
        var b = bird(birdId), z = (b.zones || []).filter(function (x) { return x.pid === String(pid); })[0]; if (!z) return { ok: false, err: 'That zone is not confirmed.' };
        var bc = birdCases(({ part25: 'Part 25', part23: 'Part 23', part29: 'Part 29', part27: 'Part 27', 'sc-vtol': 'SC-VTOL' })[b.basis] || '', {}, { level4: !!b.level4 }); if (!bc.ok) return { ok: false, err: bc.err };
        var cs = bc.cases.filter(function (c) { return c.id === z.caseId; })[0]; if (!cs) return { ok: false, err: 'No case ' + z.caseId + ' under this basis' + (b.basis === 'part23' && z.caseId === 'windshield' ? ' until level 4 is confirmed (23.2320(b)).' : '.') };
        var ex = birdExposure(b.cadId, { direction: b.direction, basis: '', speeds: {} }), zz = ex.ok ? ex.zones.filter(function (x) { return x.pid === z.pid; })[0] : null;
        // depth is counted from the back of the struck part (its extent along the flight direction)
        var Xp = _ctx(b.cadId), sp0 = Xp ? Xp.parts.filter(function (q) { return String(q.pid) === z.pid; })[0] : null, thick = 0;
        if (sp0) { var cs8 = _corners(sp0.bbox).map(function (q) { return _dot(q, b.direction); }); thick = Math.max.apply(null, cs8) - Math.min.apply(null, cs8); }
        var behind = zz ? zz.behind.filter(function (x) { return x.depthMm - thick <= b.depthMm; }).map(function (x) { return { pid: x.pid, name: x.name, depthMm: _r6(Math.max(0, x.depthMm - thick)), equipment: x.equipment }; }) : [];
        var BR = birdRays(birdId, z.pid), method = ex.method; if (BR && BR.refused) return { ok: false, refused: true, notEvaluated: BR.refused.replace(/^Not evaluated: /, ''), err: BR.refused }; if (!BR && !_birdDiam(b)) method = 'Bird diameter not confirmed (engineer input that sets the ray spacing): rays not run. ' + method;
        if (BR) { var nm = {}; (Xp ? Xp.parts : []).forEach(function (q) { nm[String(q.pid)] = q.name; }); behind = BR.behind.map(function (x) { return { pid: x.pid, name: nm[x.pid] || x.pid, depthMm: x.depthMm, exposure: x.exposure }; }); method = BR.method; }
        var X = _ctx(b.cadId), im = X ? _impactFor(X, [z.pid].concat(behind.map(function (x) { return x.pid; }))) : { conditions: [] };
        var speed = P(b.speedMs, 'engineer', null, 'engineer input; the rule names: ' + cs.speedRule);
        var energy = cs.massKg.value != null ? P(_r6(0.5 * cs.massKg.value * b.speedMs * b.speedMs), 'derived', cs.massKg.ref, '1/2 m v^2') : P(null, 'missing', null, 'bird mass not set by the rule text');
        return { ok: true, kind: 'bird', birdId: b.id, zonePid: z.pid, zone: z.name, caseId: cs.id, override: z.override ? 'case changed by the engineer from ' + z.override.from + ' to ' + z.override.to + ': ' + z.override.reason + ' (' + z.override.by + ')' : null, label: cs.label + ': ' + z.name, massKg: cs.massKg, massLb: cs.massLb, speedMs: speed, speedRule: cs.speedRule, energyJ: energy,
                 depthMm: P(b.depthMm, 'engineer', null, 'engineer input: how deep behind the struck surface parts count as exposed'),
                 behind: behind, equipment: im.equipment, conditions: im.conditions, worst: im.worst, shared: _sharedExposure(im.equipment || []),
                 refs: [cs.massKg.ref].filter(Boolean).map(ref).filter(Boolean), method: method, footprintTriangles: BR ? BR.footTriangles : null };
    }
    // birdVolume(birdId, pid): the struck surface's box carried back along the flight direction by
    // the depth: the region whose parts count as behind the impact (drawn in 3D)
    function birdVolume(birdId, pid) {
        var b = bird(birdId), X = b && _ctx(b.cadId); if (!X) return null; var p = X.parts.filter(function (q) { return String(q.pid) === String(pid); })[0]; if (!p) return null;
        var BR = birdRays(birdId, pid);
        if (BR && BR.refused) return null;
        if (BR && BR.footprint.length) {   // the footprint triangles swept back along the flight direction by the depth
            var dd = _unit(b.direction), LL = b.depthMm || 0, F0 = BR.footprint, pos = [], ix = [], bmn = [Infinity, Infinity, Infinity], bmx = [-Infinity, -Infinity, -Infinity];
            for (var k = 0; k < F0.length; k += 9) { var o = pos.length / 3; for (var s2 = 0; s2 < 2; s2++) for (var vtx = 0; vtx < 3; vtx++) for (var a2 = 0; a2 < 3; a2++) { var val = F0[k + vtx * 3 + a2] + s2 * LL * dd[a2]; pos.push(val); bmn[a2] = Math.min(bmn[a2], val); bmx[a2] = Math.max(bmx[a2], val); }
                ix.push(o, o + 1, o + 2, o + 3, o + 5, o + 4); [[0, 1], [1, 2], [2, 0]].forEach(function (e) { ix.push(o + e[0], o + e[1], o + 3 + e[1], o + e[0], o + 3 + e[1], o + 3 + e[0]); }); }
            return { positions: pos, index: ix, box: { min: bmn, max: bmx }, depthMm: LL, method: 'footprint' };
        }
        var d = b.direction, L = b.depthMm || 0, mn = p.bbox.min.slice(), mx = p.bbox.max.slice();
        for (var i = 0; i < 3; i++) { if (d[i] > 0) mx[i] += d[i] * L; else mn[i] += d[i] * L; }
        var C8 = []; for (var k = 0; k < 8; k++) C8.push(k & 1 ? mx[0] : mn[0], k & 2 ? mx[1] : mn[1], k & 4 ? mx[2] : mn[2]);
        var F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]], idx = [];
        F.forEach(function (f) { idx.push(f[0], f[1], f[2], f[0], f[2], f[3]); });
        return { positions: C8, index: idx, box: { min: mn, max: mx }, depthMm: L };
    }


    // ---- lightning, guided (14 Oct 2026) ---------------------------------------------------------
    // Step 1: extremities and band proposed from the CAD (forward, aft, span, upper), engineer ticks
    // both. Step 2: zone per part proposed by the geometry rule (unverified: SAE ARP5414 is not in the
    // knowledge base), confirmed by the engineer. Step 3: one report per zone. A test waveform or level
    // is shown only as the engineer entered it (no ARP5412 values are in the knowledge base).
    STEP1.lightning = ['extremities', 'band'];
    function _lf() { var pc = _pc(); if (!pc.praLightningFlow || typeof pc.praLightningFlow !== 'object') pc.praLightningFlow = {}; return pc.praLightningFlow; }
    function lightningFlow(cadId) { var r = (_pc().praLightningFlow || {})[cadId]; return r ? _clone(r) : null; }
    function lightningStep1(cadId, opts) {
        opts = opts || {}; var X = _ctx(cadId); if (!X) return { ok: false, err: 'No CAD model.' };
        var pz = proposeLightningZones(X.cadId, { forward: opts.forward, band: opts.band }); if (!pz.ok) return pz;
        var ex = pz.parts.filter(function (p) { return /extremity/.test(p.why) && !/not an extremity/.test(p.why); }).map(function (p) { return { pid: p.pid, why: p.why }; });
        return { ok: true, cadId: X.cadId, extremities: ex, band: pz.band, forward: _n3(opts.forward) ? opts.forward : [-1, 0, 0] };
    }
    function saveLightningFlow(cadId, v, by, opts) {
        opts = opts || {}; if (!_s(by)) return { ok: false, err: 'Lightning values go into the analysis only with the engineer\'s name.' };
        var F = _lf(), old = F[cadId] || {};
        F[cadId] = { cadId: cadId, band: v.band > 0 ? v.band : (old.band || null), forward: _n3(v.forward) ? v.forward : (old.forward || [-1, 0, 0]), confirms: v.confirms ? _clone(v.confirms) : (old.confirms || {}), waveforms: v.waveforms ? _clone(v.waveforms) : (old.waveforms || {}) };
        _save(); return { ok: true };
    }
    function _lightConfirm(cadId, field, by, on, opts) {
        opts = opts || {}; var r = _lf()[cadId]; if (!r) return { ok: false, err: 'Start the lightning assessment first.' };
        if (STEP1.lightning.indexOf(field) < 0) return { ok: false, err: 'Unknown field: ' + field };
        if (on !== false && !_s(by)) return { ok: false, err: 'A value is confirmed only with the engineer\'s name.' };
        if (on !== false && field === 'band' && !(r.band > 0)) return { ok: false, err: 'Enter the band before confirming it.' };
        r.confirms = r.confirms || {}; if (on === false) delete r.confirms[field]; else r.confirms[field] = { by: _s(by), at: opts.at || new Date().toISOString() }; _save(); return { ok: true };
    }
    var _cf1 = confirmField, _ss1 = stepStatus;
    confirmField = function (kind, id, field, by, on, opts) { return kind === 'lightning' ? _lightConfirm(id, field, by, on, opts) : _cf1(kind, id, field, by, on, opts); };
    stepStatus = function (kind, id) { if (kind !== 'lightning') return _ss1(kind, id); var r = (_pc().praLightningFlow || {})[id], c = (r && r.confirms) || {}, missing = STEP1.lightning.filter(function (f) { return !c[f]; }); return { ok: !!r, unlocked: !!r && missing.length === 0, missing: missing }; };
    function setLightningWaveform(cadId, zone, text, by) { var r = _lf()[cadId]; if (!r) return { ok: false, err: 'Start the lightning assessment first.' }; if (!_s(by)) return { ok: false, err: 'Name needed.' }; r.waveforms = r.waveforms || {}; if (!_s(text)) delete r.waveforms[zone]; else r.waveforms[zone] = { text: _s(text), by: _s(by) }; _save(); return { ok: true }; }
    function lightningReport(cadId, zone) {
        var s1 = stepStatus('lightning', cadId); if (!s1.unlocked) return { ok: false, err: 'Confirm the extremities and the band first (Step 1).', missing: s1.missing };
        var conf = lightningZones(cadId); if (!conf) return { ok: false, err: 'Confirm the zone assignment first (Step 2).' };
        if (LIGHTNING_ZONES.indexOf(zone) < 0) return { ok: false, err: 'Unknown zone ' + zone };
        var X = _ctx(cadId), pids = conf.parts.filter(function (p) { return p.zone === zone; }).map(function (p) { return p.pid; });
        var im = _impactFor(X, pids), r = _lf()[cadId], wf = (r.waveforms || {})[zone];
        return { ok: true, kind: 'lightning', zone: zone, label: 'Lightning zone ' + zone, parts: pids, equipment: im.equipment, conditions: im.conditions, worst: im.worst, shared: _sharedExposure(im.equipment),
                 definition: P(null, 'unverified', null, 'SAE ARP5414 zone definitions are not in the knowledge base; the zone was proposed by a geometry rule and confirmed by ' + conf.confirmedBy),
                 waveform: wf ? P(wf.text, 'engineer', null, 'not from a cited standard, engineer input (' + wf.by + ')') : P(null, 'missing', null, 'no test waveform or level entered; SAE ARP5412 values are not in the knowledge base'),
                 effects: LIGHTNING_EFFECTS, refs: ['cfr-25.581'].map(ref).filter(Boolean) };
    }

    // ---- fire, fluid leak, ice shedding, guided --------------------------------------------------
    // Step 1: source parts and the type, margin (engineer input); Step 2: one case per source;
    // Step 3: one report per case. No rule is cited unless its text is in pra_refs_data.js.
    var SOURCE_TYPES = { fire: 'Fire', flammableFluid: 'Flammable fluid leak', otherFluid: 'Other fluid leak', iceShed: 'Ice shedding' };
    function _gf() { var pc = _pc(); if (!Array.isArray(pc.praSources)) pc.praSources = []; return pc.praSources; }
    function sources() { return _arr(_pc().praSources).slice().sort(function (a, b) { return _cmp(a.id, b.id); }); }
    function saveSource(v, by, opts) {
        opts = opts || {}; if (!_s(by)) return { ok: false, err: 'A source goes into the analysis only with the engineer\'s name.' };
        if (!SOURCE_TYPES[v.type]) return { ok: false, err: 'Choose the type: fire, flammable fluid, other fluid or ice shedding.' };
        if (!_arr(v.pids).length) return { ok: false, err: 'Choose the source part(s).' };
        if (!(v.marginMm >= 0)) return { ok: false, err: 'Enter the margin around the source (mm, engineer input).' };
        var arr = _gf(), id = _s(v.id); if (!id) { var pc = _pc(); pc.praSourceSeq = (pc.praSourceSeq || 0) + 1; id = 'src-' + pc.praSourceSeq; }
        var rec = { id: id, cadId: v.cadId, type: v.type, pids: _arr(v.pids).map(String).sort(_cmp), marginMm: v.marginMm, label: _s(v.label) || SOURCE_TYPES[v.type], confirmedBy: _s(by), at: opts.at || new Date().toISOString() };
        var i = arr.findIndex(function (x) { return x && x.id === id; }); if (i >= 0) arr[i] = rec; else arr.push(rec); _save(); return { ok: true, source: _clone(rec) };
    }
    function sourceBox(id) { var r = _arr(_pc().praSources).filter(function (x) { return x.id === id; })[0], X = r && _ctx(r.cadId); if (!X) return null; var B = null; X.parts.forEach(function (p) { if (r.pids.indexOf(String(p.pid)) < 0) return; if (!B) B = { min: p.bbox.min.slice(), max: p.bbox.max.slice() }; else for (var i = 0; i < 3; i++) { B.min[i] = Math.min(B.min[i], p.bbox.min[i]); B.max[i] = Math.max(B.max[i], p.bbox.max[i]); } }); if (!B) return null; for (var j = 0; j < 3; j++) { B.min[j] -= r.marginMm; B.max[j] += r.marginMm; } return B; }
    function sourceReport(id) {
        var r = _arr(_pc().praSources).filter(function (x) { return x.id === id; })[0]; if (!r) return { ok: false, err: 'Source not found.' };
        var X = _ctx(r.cadId), B = sourceBox(id); if (!X || !B) return { ok: false, err: 'No CAD model or source parts.' };
        var inside = X.parts.filter(function (p) { return r.pids.indexOf(String(p.pid)) < 0 && _boxesOverlapB(p.bbox, B); }).map(function (p) { return String(p.pid); });
        var im = _impactFor(X, inside);
        return { ok: true, kind: 'source', id: r.id, type: r.type, typeLabel: SOURCE_TYPES[r.type], label: r.label, sources: r.pids, margin: P(r.marginMm, 'engineer', null, 'engineer input: the size of the region around the source'),
                 box: B, partsInside: inside, equipment: im.equipment, conditions: im.conditions, worst: im.worst, shared: _sharedExposure(im.equipment), refs: [], ruleNote: 'No rule text for this case is in the knowledge base; none is cited.' };
    }
    function _boxesOverlapB(a, b) { for (var i = 0; i < 3; i++) if (a.max[i] < b.min[i] || b.max[i] < a.min[i]) return false; return true; }

    // whyNotReached(equipment): for every fault tree that names this equipment but is not reached,
    // its failure condition and the other basic events that would also have to fail
    function whyNotReached(eq) {
        var C = _C(); if (!C || !_arr(eq).length) return [];
        var ev = C.evaluate(eq), idx = ev.index || {}, out = [], sysName = {}; _arr(_g('systemsData')).forEach(function (x) { if (x) sysName[String(x.id)] = x.name || x.id; });
        ev.trees.filter(function (t) { return !t.reached && !t.alreadyTrue; }).forEach(function (t) {
            var pg = _arr(_g('ftaPages')).filter(function (p) { return p && p.id === t.pageId; })[0], leaves = [];
            (function walk(n) { if (!n) return; if (n.type !== 'gate') { var lid = String(n.logicalId != null ? n.logicalId : n.id); if (t.events.indexOf(lid) < 0) { var r = idx[lid], who2 = r ? Object.keys(r.sysIds).map(function (s2) { return sysName[s2] || s2; }).join('/') : ''; leaves.push(who2 || n.name || n.displayId || lid); } return; } (n.children || []).forEach(walk); })(pg && pg.root);
            var hitNames = _arr(eq).map(function (s2) { return sysName[s2] || s2; }).join(', ');
            out.push((t.topId || t.name) + ' (' + t.name + ') needs ' + (t.additional != null ? t.additional + ' more failure' + (t.additional === 1 ? '' : 's') : 'more failures') + ' besides ' + hitNames + (leaves.length ? ': also ' + _uniq(leaves).slice(0, 4).join(', ') : ''));
        });
        return out.sort(_cmp);
    }


    // ---- skin by rays against the real triangles (14 Oct 2026) ----------------------------------
    // A triangle source (the open viewer registers one) gives each part's world-space triangles.
    // Rays come from outside on a grid from 14 directions (6 axes, 8 diagonals); a part is skin when it
    // is the first hit for at least SKIN_MIN_RAYS rays. Without triangles the box-level method is the
    // fallback. The method used is reported.
    var _triSource = null, SKIN_MIN_RAYS = 3, SKIN_GRID = 48;
    function setTriangleSource(fn) { _triSource = typeof fn === 'function' ? fn : null; }
    // _bvh(items): bounding volume hierarchy over triangles (timebox 46, speed only): items [{ tri: [a, b, c], pid }].
    // _bvhSegment(B, o, u, L, skip): for each part other than skip, the nearest t in (1e-6, L - 1e-6) where the ray
    // o + t u meets one of its triangles, by the same Moller-Trumbore test as the brute force (same answers, fewer tests).
    function _bvh(items) {
        var n = items.length, idx = new Array(n), cen = new Array(n), bmin = [], bmax = [], nodes = [];
        for (var i = 0; i < n; i++) { idx[i] = i; var t = items[i].tri; cen[i] = [0, 1, 2].map(function (c) { return (t[0][c] + t[1][c] + t[2][c]) / 3; }); }
        function build(lo, hi) {
            var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], cmn = [Infinity, Infinity, Infinity], cmx = [-Infinity, -Infinity, -Infinity];
            for (var k = lo; k < hi; k++) { var t = items[idx[k]].tri; for (var v = 0; v < 3; v++) for (var c = 0; c < 3; c++) { if (t[v][c] < mn[c]) mn[c] = t[v][c]; if (t[v][c] > mx[c]) mx[c] = t[v][c]; }
                for (var c2 = 0; c2 < 3; c2++) { if (cen[idx[k]][c2] < cmn[c2]) cmn[c2] = cen[idx[k]][c2]; if (cen[idx[k]][c2] > cmx[c2]) cmx[c2] = cen[idx[k]][c2]; } }
            var node = { min: mn, max: mx, lo: lo, hi: hi, l: null, r: null }; nodes.push(node);
            if (hi - lo <= 8) return node;
            var ax = 0; for (var c3 = 1; c3 < 3; c3++) if (cmx[c3] - cmn[c3] > cmx[ax] - cmn[ax]) ax = c3;
            if (!(cmx[ax] > cmn[ax])) return node;
            var sub = idx.slice(lo, hi).sort(function (a, b) { return cen[a][ax] - cen[b][ax] || a - b; }); for (var k2 = lo; k2 < hi; k2++) idx[k2] = sub[k2 - lo];
            var mid = (lo + hi) >> 1; node.l = build(lo, mid); node.r = build(mid, hi); return node;
        }
        var root = n ? build(0, n) : null; return { root: root, idx: idx, items: items };
    }
    function _slab(o, u, b, L) { var t0 = 0, t1 = L; for (var i = 0; i < 3; i++) { if (Math.abs(u[i]) < 1e-12) { if (o[i] < b.min[i] || o[i] > b.max[i]) return false; continue; } var ta = (b.min[i] - o[i]) / u[i], tb = (b.max[i] - o[i]) / u[i]; if (ta > tb) { var x = ta; ta = tb; tb = x; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1 + 1e-9) return false; } return true; }
    function _bvhSegment(B, o, u, L, skip) {
        var best = {}; if (!B.root) return best; var stack = [B.root];
        while (stack.length) { var nd = stack.pop(); if (!_slab(o, u, nd, L)) continue;
            if (nd.l) { stack.push(nd.l, nd.r); continue; }
            for (var k = nd.lo; k < nd.hi; k++) { var it = B.items[B.idx[k]]; if (it.pid === skip) continue; var tr = it.tri, tt = _rayTri(o, u, tr[0], tr[1], tr[2]); if (tt > 1e-6 && tt < L - 1e-6 && !(best[it.pid] <= tt)) best[it.pid] = tt; } }
        return best;
    }
    function _rayTri(o, d, a, b, c) {   // Moller-Trumbore; returns t or -1
        var e1 = _sub(b, a), e2 = _sub(c, a), pv = _cross(d, e2), det = _dot(e1, pv); if (Math.abs(det) < 1e-12) return -1;
        var inv = 1 / det, tv = _sub(o, a), u = _dot(tv, pv) * inv; if (u < 0 || u > 1) return -1;
        var qv = _cross(tv, e1), v = _dot(d, qv) * inv; if (v < 0 || u + v > 1) return -1;
        var t = _dot(e2, qv) * inv; return t > 1e-9 ? t : -1;
    }
    function skinByRays(cadId) {
        var X = _ctx(cadId); if (!X || !_triSource) return null;
        var tris = {}, any = false; X.parts.forEach(function (p) { var t = _triSource(String(p.pid)); if (t && t.length >= 9) { tris[String(p.pid)] = t; any = true; } }); if (!any) return null;
        var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; X.parts.forEach(function (p) { for (var i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p.bbox.min[i]); mx[i] = Math.max(mx[i], p.bbox.max[i]); } });
        var ctr = [0, 1, 2].map(function (i) { return (mn[i] + mx[i]) / 2; }), R = _len(_sub(mx, mn)) / 2 + 1, hits = {};
        var dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; [-1, 1].forEach(function (x) { [-1, 1].forEach(function (y) { [-1, 1].forEach(function (z) { dirs.push(_unit([x, y, z])); }); }); });
        var pids = Object.keys(tris).sort(_cmp), boxes = {}; X.parts.forEach(function (p) { boxes[String(p.pid)] = p.bbox; });
        dirs.forEach(function (d) {
            var e1 = _unit(_cross(d, Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0])), e2 = _cross(d, e1);
            for (var a = 0; a < SKIN_GRID; a++) for (var b = 0; b < SKIN_GRID; b++) {
                var u = -R + 2 * R * (a + 0.5) / SKIN_GRID, v = -R + 2 * R * (b + 0.5) / SKIN_GRID;
                var o = [0, 1, 2].map(function (i) { return ctr[i] - d[i] * R * 1.5 + u * e1[i] + v * e2[i]; });
                var best = Infinity, who = null;
                pids.forEach(function (pid) {
                    var bx = boxes[pid]; // slab test against the part box first
                    var t0 = -Infinity, t1 = Infinity; for (var i = 0; i < 3; i++) { if (Math.abs(d[i]) < 1e-12) { if (o[i] < bx.min[i] || o[i] > bx.max[i]) return; continue; } var ta = (bx.min[i] - o[i]) / d[i], tb = (bx.max[i] - o[i]) / d[i]; t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb)); } if (t0 > t1 || t1 < 0 || t0 > best) return;
                    var T = tris[pid]; for (var k = 0; k < T.length; k += 9) { var t = _rayTri(o, d, [T[k], T[k + 1], T[k + 2]], [T[k + 3], T[k + 4], T[k + 5]], [T[k + 6], T[k + 7], T[k + 8]]); if (t > 0 && t < best) { best = t; who = pid; } }
                });
                if (who) hits[who] = (hits[who] || 0) + 1;
            }
        });
        return { method: 'rays against the part triangles: ' + dirs.length + ' directions (6 axes, 8 diagonals), ' + SKIN_GRID + ' x ' + SKIN_GRID + ' rays each; skin = first hit for at least ' + SKIN_MIN_RAYS + ' rays', parts: Object.keys(hits).filter(function (pid) { return hits[pid] >= SKIN_MIN_RAYS; }).sort(_cmp), hits: hits };
    }
    function proposeSkin(cadId) {
        var X = _ctx(cadId); if (!X) return { ok: false, err: 'No CAD model.' };
        var r = skinByRays(X.cadId), parts, method;
        if (r) { parts = r.parts; method = r.method; } else { parts = externalParts(X.cadId); method = 'box level (no part triangles available): parts met first from any of the 6 axis directions'; }
        var linked = parts.filter(function (pid) { return X.conf[pid]; });
        return { ok: true, cadId: X.cadId, parts: parts, method: method, warning: linked.length ? 'linked equipment proposed as skin: check the model is closed (' + linked.join(', ') + ')' : null, linkedAsSkin: linked };
    }
    function _skinList() { var pc = _pc(); if (!pc.praSkinParts || typeof pc.praSkinParts !== 'object') pc.praSkinParts = {}; return pc.praSkinParts; }
    function skinParts(cadId) { var r = (_pc().praSkinParts || {})[cadId]; return r ? _clone(r) : null; }
    function confirmSkinParts(cadId, pids, method, by, opts) { opts = opts || {}; if (!_s(by)) return { ok: false, err: 'The skin parts list is confirmed only with the engineer\'s name.' }; if (!_arr(pids).length) return { ok: false, err: 'No skin parts.' }; _skinList()[cadId] = { pids: _arr(pids).map(String).sort(_cmp), method: _s(method), confirmedBy: _s(by), at: opts.at || new Date().toISOString(), edits: ((_pc().praSkinParts || {})[cadId] || {}).edits || [] }; _save(); return { ok: true }; }
    function editSkinParts(cadId, pid, isSkin, reason, by, opts) {
        opts = opts || {}; var S = _skinList()[cadId]; if (!S) return { ok: false, err: 'Confirm the skin parts first.' }; if (!_s(by)) return { ok: false, err: 'Name needed.' }; if (_s(reason).length < 10) return { ok: false, err: 'Write the reason.' };
        var i = S.pids.indexOf(String(pid)); if (isSkin && i < 0) S.pids.push(String(pid)); else if (!isSkin && i >= 0) S.pids.splice(i, 1); else return { ok: false, err: 'No change.' };
        S.pids.sort(_cmp); S.edits.push({ pid: String(pid), skin: !!isSkin, reason: _s(reason), by: _s(by), at: opts.at || new Date().toISOString() }); _save(); return { ok: true };
    }
    // ---- lightning zones on the external skin (14 Oct 2026 rebuild) -----------------------------
    // Zones are regions of the external skin, not volumes around equipment, and do not reuse the
    // zonal safety zones. External parts are those met first from any of the six axis directions
    // (box level). The zone of each external part is proposed by the stated geometry rule from the
    // extremities (proposeLightningZones restricted to the skin) and stays unverified (SAE ARP5414 is
    // not in the knowledge base) until the engineer confirms; the engineer may move a part to another
    // zone with a name and a reason.
    var SKIN_RULE = 'Geometry rule (stated, not ARP5414): the skin within the band of the most forward point is 1A, and so are engine nacelle and inlet fronts; the skin within the band of the most aft point, the span tips and the highest point, and the tailcone, is 1B; a long part is split, its band portion in 1A or 1B and the rest in 2A (swept aft of a 1A region) or 3; the band is an engineer input.';
    function externalParts(cadId) {
        var X = _ctx(cadId); if (!X) return [];
        var ext = {};
        [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach(function (d) { var ex = birdExposure(X.cadId, { direction: d, cell: 100, basis: '' }); if (ex.ok) ex.zones.forEach(function (z) { ext[z.pid] = 1; }); });
        return Object.keys(ext).sort(_cmp);
    }
    // proposeSkinZones: the band portion of a skin part at an extreme (forward, aft, span tips, top)
    // is its own patch in 1A / 1B; the rest of the same part goes to 2A / 2B / 3. A long part is listed
    // in both zones with the portion stated ("FUSELAGE_TOP (aft 500 mm)"). Axis-aligned: x fore-aft,
    // y span, z up (forward = -x by default).
    function proposeSkinZones(cadId, opts) {
        opts = opts || {}; var X = _ctx(cadId); if (!X) return { ok: false, err: 'No CAD model.' };
        var sl = skinParts(X.cadId), ps = sl ? null : proposeSkin(X.cadId), ext = sl ? sl.pids : ps.parts;
        var band = opts.band > 0 ? P(opts.band, 'engineer') : P(500, 'unverified', null, 'default 500 mm band around an extremity; ARP5414 text not available, engineer to set');
        var bw = band.value, fwdSign = (_n3(opts.forward) && opts.forward[0] > 0) ? 1 : -1;   // forward along -x unless told otherwise
        var box = {}; X.parts.forEach(function (p) { box[String(p.pid)] = p.bbox; });
        var nm = {}; X.parts.forEach(function (p) { nm[String(p.pid)] = String(p.name || '').replace(/[_\-]/g, ' '); });
        var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; ext.forEach(function (pid) { var b = box[pid]; if (!b) return; for (var i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b.min[i]); mx[i] = Math.max(mx[i], b.max[i]); } });
        var front = fwdSign < 0 ? mn[0] : mx[0], aft = fwdSign < 0 ? mx[0] : mn[0];
        var bands = [   // [zone, axis, lo, hi, text, why]
            ['1A', 0, Math.min(front, front - fwdSign * bw), Math.max(front, front - fwdSign * bw), 'forward ' + bw + ' mm', 'within ' + bw + ' mm of the most forward point'],
            ['1B', 0, Math.min(aft, aft + fwdSign * bw), Math.max(aft, aft + fwdSign * bw), 'aft ' + bw + ' mm', 'within ' + bw + ' mm of the most aft point'],
            ['1B', 1, mx[1] - bw, mx[1], 'right tip ' + bw + ' mm', 'within ' + bw + ' mm of the right span extreme'],
            ['1B', 1, mn[1], mn[1] + bw, 'left tip ' + bw + ' mm', 'within ' + bw + ' mm of the left span extreme'],
            ['1B', 2, mx[2] - bw, mx[2], 'top ' + bw + ' mm', 'within ' + bw + ' mm of the highest point']];
        var portions = [];
        ext.forEach(function (pid) {
            var b = box[pid]; if (!b) return; var used = [];
            if (/\b(nacelle|inlet|intake|cowl)\b/i.test(nm[pid])) { portions.push({ pid: pid, zone: '1A', portion: 'whole part', box: _clone(b), why: 'engine nacelle or inlet front' }); return; }
            if (/\btail ?cone\b/i.test(nm[pid])) { portions.push({ pid: pid, zone: '1B', portion: 'whole part', box: _clone(b), why: 'tailcone (aft extremity)' }); return; }
            bands.forEach(function (B) {
                var lo = Math.max(b.min[B[1]], B[2]), hi = Math.min(b.max[B[1]], B[3]); if (hi <= lo) return;
                var whole = lo <= b.min[B[1]] + 1e-6 && hi >= b.max[B[1]] - 1e-6, sb = _clone(b); sb.min[B[1]] = lo; sb.max[B[1]] = hi;
                portions.push({ pid: pid, zone: B[0], portion: whole ? 'whole part' : B[4], box: sb, why: B[5] }); used.push([B[1], lo, hi]);
            });
            // the rest along the fore-aft axis (where a band cut the part), or the whole part when no band touched it
            var cutX = used.filter(function (u) { return u[0] === 0; }), whole0 = used.some(function (u) { return u[1] <= b.min[u[0]] + 1e-6 && u[2] >= b.max[u[0]] - 1e-6; });
            if (whole0) return;
            var lo2 = b.min[0], hi2 = b.max[0]; cutX.forEach(function (u) { if (u[1] <= lo2 + 1e-6) lo2 = Math.max(lo2, u[2]); if (u[2] >= hi2 - 1e-6) hi2 = Math.min(hi2, u[1]); });
            if (hi2 - lo2 < 1e-6) return;
            var rb = _clone(b); rb.min[0] = lo2; rb.max[0] = hi2;
            portions.push({ pid: pid, zone: null, portion: used.length ? 'remainder' : 'whole part', box: rb, why: '' });
        });
        // remainder: 2A when swept aft of a 1A portion (overlapping it across span and height), else 3
        var oneA = portions.filter(function (q) { return q.zone === '1A'; });
        portions.forEach(function (q) { if (q.zone) return; var sw = oneA.some(function (a) { return (fwdSign < 0 ? q.box.min[0] >= a.box.min[0] : q.box.max[0] <= a.box.max[0]) && q.box.min[1] < a.box.max[1] && a.box.min[1] < q.box.max[1] && q.box.min[2] < a.box.max[2] && a.box.min[2] < q.box.max[2]; }); q.zone = sw ? '2A' : '3'; q.why = sw ? 'swept stroke aft of a 1A region' : 'rest of the skin'; });
        portions.sort(function (p1, p2) { return _cmp(p1.pid, p2.pid) || _cmp(p1.zone, p2.zone) || _cmp(p1.portion, p2.portion); });
        // the main zone of a part (for the per-part lists): the zone of its largest portion
        var main = {}; portions.forEach(function (q) { var L = _boxVolume(q.box); if (!main[q.pid] || L > main[q.pid].L) main[q.pid] = { zone: q.zone, L: L, why: q.why }; });
        return { ok: true, cadId: X.cadId, rule: SKIN_RULE, band: band, skinMethod: sl ? sl.method : ps.method, skinConfirmedBy: sl ? sl.confirmedBy : null, warning: ps ? ps.warning : null,
                 portions: portions, parts: ext.filter(function (pid) { return main[pid]; }).map(function (pid) { return { pid: pid, zone: main[pid].zone, why: main[pid].why || 'largest portion', status: 'proposed' }; }) };
    }
    function _boxVolume(b) { return Math.max(0, b.max[0] - b.min[0]) * Math.max(0, b.max[1] - b.min[1]) * Math.max(0, b.max[2] - b.min[2]); }
    function _skin() { var pc = _pc(); if (!pc.praLightningSkin || typeof pc.praLightningSkin !== 'object') pc.praLightningSkin = {}; return pc.praLightningSkin; }
    function lightningSkin(cadId) { var r = (_pc().praLightningSkin || {})[cadId]; return r ? _clone(r) : null; }
    function confirmSkinZones(cadId, parts, by, opts) {
        opts = opts || {}; if (!_s(by)) return { ok: false, err: 'Lightning zones are confirmed only with the engineer\'s name.' };
        var rows = _arr(parts).filter(function (p) { return p && LIGHTNING_ZONES.indexOf(p.zone) >= 0; }); if (!rows.length) return { ok: false, err: 'No skin parts to confirm.' };
        var S = _skin(), old = S[cadId] || {}; S[cadId] = { assign: {}, confirmedBy: _s(by), at: opts.at || new Date().toISOString(), edits: old.edits || [], depthMm: old.depthMm || null, depthBy: old.depthBy || null };
        rows.forEach(function (p) { S[cadId].assign[String(p.pid)] = p.zone; }); S[cadId].portions = _clone(_arr(opts.portions)); _save(); return { ok: true, count: rows.length };
    }
    function editSkinZone(cadId, pid, zone, reason, by, opts) {
        opts = opts || {}; var S = _skin()[cadId]; if (!S) return { ok: false, err: 'Confirm the proposed zones first.' };
        if (!_s(by)) return { ok: false, err: 'Name needed.' }; if (_s(reason).length < 10) return { ok: false, err: 'Write the reason for moving the part to another zone.' };
        if (LIGHTNING_ZONES.indexOf(zone) < 0 || !S.assign[pid]) return { ok: false, err: 'Unknown zone or part.' };
        S.edits.push({ pid: String(pid), from: S.assign[pid], to: zone, reason: _s(reason), by: _s(by), at: opts.at || new Date().toISOString() }); S.assign[pid] = zone; (S.portions || []).forEach(function (q) { if (q.pid === String(pid)) { q.zone = zone; q.portion = 'whole part (moved by the engineer)'; } }); _save(); return { ok: true };
    }
    function setSkinDepth(cadId, mm, by) { var S = _skin()[cadId]; if (!S) return { ok: false, err: 'Confirm the zones first.' }; if (!_s(by) || !(mm > 0)) return { ok: false, err: 'Enter the depth and your name.' }; S.depthMm = mm; S.depthBy = _s(by); _save(); return { ok: true }; }
    function skinZoneReport(cadId, zone) {
        var X = _ctx(cadId), S = (_pc().praLightningSkin || {})[cadId]; if (!X || !S) return { ok: false, err: 'Confirm the skin zones first (Step 2).' };
        var por = (S.portions || []).filter(function (q) { return q.zone === zone; });
        var direct = por.length ? _uniq(por.map(function (q) { return q.pid; })) : Object.keys(S.assign).filter(function (pid) { return S.assign[pid] === zone; }).sort(_cmp);
        var directPortions = por.map(function (q) { return { pid: q.pid, portion: q.portion, box: q.box }; });
        var skinSet = {}; Object.keys(S.assign).forEach(function (pid) { skinSet[pid] = 1; });
        var boxOf = {}; X.parts.forEach(function (p) { boxOf[String(p.pid)] = p.bbox; });
        var depth = S.depthMm || 0, indirect = [];
        // only equipment and named components: inner faces of a skin product (a surface model) are never equipment
        var skinProd = {}, linked = {}; X.parts.forEach(function (p) { if (skinSet[String(p.pid)]) skinProd[_prodKey(p)] = 1; });
        try { var CC = _C(); Object.keys((CC && CC.confirmed && CC.confirmed(cadId)) || {}).forEach(function (q) { linked[q] = 1; }); } catch (_) {}
        if (depth > 0) X.parts.forEach(function (p) { var pid = String(p.pid); if (skinSet[pid]) return; if (!linked[pid] && skinProd[_prodKey(p)]) return; var d = Infinity; (directPortions.length ? directPortions.map(function (q) { return q.box; }) : direct.map(function (q) { return boxOf[q]; })).forEach(function (qb) { d = Math.min(d, _bd(p.bbox, qb)); }); if (d <= depth) indirect.push({ pid: pid, distanceMm: _r6(d) }); });
        indirect.sort(function (a, b) { return a.distanceMm - b.distanceMm || _cmp(a.pid, b.pid); });
        var all = direct.concat(indirect.map(function (x) { return x.pid; })), im = _impactFor(X, all), f = (_pc().praLightningFlow || {})[cadId] || {}, wf = (f.waveforms || {})[zone];
        return { ok: true, kind: 'lightning', zone: zone, label: 'Lightning zone ' + zone, direct: direct, directPortions: directPortions, indirect: indirect, parts: all, equipment: im.equipment, conditions: im.conditions, worst: im.worst, shared: _sharedExposure(im.equipment),
                 skinMethod: ((_pc().praSkinParts || {})[cadId] || {}).method || 'box level', depthMm: P(S.depthMm, S.depthMm ? 'engineer' : 'missing', null, S.depthMm ? 'engineer input: how far behind the skin region internal equipment counts as exposed to indirect effects (' + S.depthBy + ')' : 'depth behind the skin not entered: no internal equipment listed'),
                 edits: (S.edits || []).filter(function (e) { return e.to === zone || e.from === zone; }), confirmedBy: S.confirmedBy, rule: SKIN_RULE,
                 definition: P(null, 'unverified', null, 'proposed by a geometry rule, unverified (SAE ARP5414 not in the knowledge base); assignment confirmed by ' + S.confirmedBy),
                 waveform: wf ? P(wf.text, 'engineer', null, 'not from a cited standard, engineer input (' + wf.by + ')') : P(null, 'missing', null, 'no test waveform or level entered; SAE ARP5412 values are not in the knowledge base'),
                 wiringNote: 'Wiring is not in the CAD model: assess induced transients on wiring routed under this skin region separately.', effects: LIGHTNING_EFFECTS, refs: ['cfr-25.581'].map(ref).filter(Boolean) };
    }
    function _bd(a, b) { var s2 = 0; for (var i = 0; i < 3; i++) { var g = Math.max(0, Math.max(a.min[i] - b.max[i], b.min[i] - a.max[i])); s2 += g * g; } return Math.sqrt(s2); }

    // Many faces of one product (a surface model exported as one body) read as one part: the product
    // name with where the faces lie (x station, y from the centerline, z waterline). Distinct named parts keep their names.
    var GROUP_MIN = 5;
    function _prodKey(p) { return String(p.pid).replace(/#\d+$/, '') + '|' + _s(p.name); }
    function partGroups(parts) {
        var by = {}, g = {}; _arr(parts).forEach(function (p) { var k = _prodKey(p); (by[k] = by[k] || []).push(p); });
        Object.keys(by).forEach(function (k) { if (by[k].length >= GROUP_MIN) by[k].forEach(function (p) { g[p.pid] = k; }); }); return g;
    }
    function _lenTxt(v, units) { return units === 'mm' || !units ? (Math.round(v / 100) / 10).toFixed(1) : String(Math.round(v * 10) / 10); }
    function locationText(boxes, units) {
        var mn = [1e300, 1e300, 1e300], mx = [-1e300, -1e300, -1e300]; boxes.forEach(function (b) { for (var i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b.min[i]); mx[i] = Math.max(mx[i], b.max[i]); } });
        var u = units === 'mm' || !units ? ' m' : ' ' + units;
        return ['x', 'y', 'z'].map(function (a, i) { return a + ' ' + _lenTxt(mn[i], units) + ' to ' + _lenTxt(mx[i], units) + u; }).join(', ');
    }
    // describeParts(parts, pids, units, nameOf): [{ label, pids, grouped }] in the order the pids come
    function describeParts(parts, pids, units, nameOf) {
        var g = partGroups(parts), byPid = {}, out = [], at = {}; _arr(parts).forEach(function (p) { byPid[p.pid] = p; });
        _arr(pids).forEach(function (pid) {
            var k = g[pid]; if (!k) { out.push({ label: nameOf ? nameOf(pid) : ((byPid[pid] && byPid[pid].name) || pid), pids: [pid], grouped: false }); return; }
            if (at[k] == null) { at[k] = out.length; out.push({ key: k, pids: [], grouped: true }); } out[at[k]].pids.push(pid);
        });
        out.forEach(function (e) { if (!e.grouped) return; var nm = _s(byPid[e.pids[0]].name) || 'unnamed product', cl = _clusters(e.pids, byPid);
            e.clusters = cl.map(function (L) { return { pids: L, location: locationText(L.map(function (q) { return byPid[q].bbox; }), units) }; });
            e.label = nm + ', ' + e.clusters.map(function (c) { return (c.pids.length === 1 ? '1 surface' : c.pids.length + ' surfaces') + ' at ' + c.location; }).join('; '); });
        return out;
    }
    // connected groups of faces: faces sharing an edge (two or more vertices within 1 mm) when the
    // triangles are loaded, otherwise faces whose boxes touch (within 1 mm)
    function _clusters(pids, byPid) {
        var n = pids.length, par = pids.map(function (_, i) { return i; }), find = function (i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
        var keys = pids.map(function (q) { var T = _triSource ? _triSource(q) : null; if (!T) return null; var K = {}; for (var i = 0; i < T.length; i += 3) K[Math.round(T[i]) + ',' + Math.round(T[i + 1]) + ',' + Math.round(T[i + 2])] = 1; return K; });
        for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
            var adj = false;
            if (keys[i] && keys[j]) { var c = 0, A = keys[i], B = keys[j]; for (var k in A) if (B[k]) { c++; if (c >= 2) break; } adj = c >= 2; }
            else { var a = byPid[pids[i]].bbox, b = byPid[pids[j]].bbox; adj = [0, 1, 2].every(function (x) { return a.min[x] <= b.max[x] + 1 && b.min[x] <= a.max[x] + 1; }); }
            if (adj) par[find(i)] = find(j);
        }
        var G = {}, order = []; pids.forEach(function (q, i) { var r = find(i); if (!G[r]) { G[r] = []; order.push(r); } G[r].push(q); });
        return order.map(function (r) { return G[r]; });
    }
    function describeCadParts(cadId, pids, nameOf) { var C = _C(); if (!C) return _arr(pids).map(function (p) { return { label: p, pids: [p], grouped: false }; }); var m = C.model(cadId || C.latestCadId()); return describeParts(m ? C.partsOf(m) : [], pids, m && m.units, nameOf); }

    var api = { VERSION: VERSION, REFS: REFS, ref: ref, cite: cite, FRAGMENT_MODELS: FRAGMENT_MODELS, FRAGMENT_ORDER: FRAGMENT_ORDER,
                proposeRotors: proposeRotors, rotorIssue: rotorIssue, confirmRotor: confirmRotor, rotors: rotors, rotor: rotor, removeRotor: removeRotor,
                sweep: sweep, STEP1_FIELDS: STEP1_FIELDS, DEFAULT_TYPES: DEFAULT_TYPES, confirmRotorField: confirmRotorField, step1Status: step1Status, fragmentEnergy: fragmentEnergy, spreadVolume: spreadVolume, modelReach: modelReach, spreadMeshPoints: spreadMeshPoints, readBackSpread: readBackSpread, rotorReport: rotorReport, STEP1: STEP1, TIRE_DEFAULT_CASES: TIRE_DEFAULT_CASES, confirmField: confirmField, stepStatus: stepStatus, tireReport: tireReport, externalParts: externalParts, setTriangleSource: setTriangleSource, skinByRays: skinByRays, proposeSkin: proposeSkin, skinParts: skinParts, confirmSkinParts: confirmSkinParts, editSkinParts: editSkinParts, proposeSkinZones: proposeSkinZones, lightningSkin: lightningSkin, confirmSkinZones: confirmSkinZones, editSkinZone: editSkinZone, setSkinDepth: setSkinDepth, skinZoneReport: skinZoneReport, SKIN_RULE: SKIN_RULE, whyNotReached: whyNotReached, lightningStep1: lightningStep1, saveLightningFlow: saveLightningFlow, lightningFlow: lightningFlow, setLightningWaveform: setLightningWaveform, lightningReport: lightningReport, SOURCE_TYPES: SOURCE_TYPES, sources: sources, saveSource: saveSource, sourceBox: sourceBox, sourceReport: sourceReport, birds: birds, bird: bird, saveBird: saveBird, birdSpeedRule: birdSpeedRule, proposeBirdZones: proposeBirdZones, confirmBirdZones: confirmBirdZones, birdReport: birdReport, birdVolume: birdVolume, tireVolume: tireVolume, setTireArcLimit: setTireArcLimit, setTireGear: setTireGear, tireCases: tireCases, GEAR_MODELS: GEAR_MODELS, GEAR_DEFAULTS: GEAR_DEFAULTS, TIRE_MODELS: TIRE_MODELS, TIRE_ORDER: TIRE_ORDER, proposeTires: proposeTires, confirmTire: confirmTire, tires: tires, tire: tire, tireThreats: tireThreats,
                birdExposure: birdExposure, LIGHTNING_ZONES: LIGHTNING_ZONES, LIGHTNING_EFFECTS: LIGHTNING_EFFECTS, proposeLightningZones: proposeLightningZones, confirmLightningZones: confirmLightningZones, lightningZones: lightningZones, GENERIC_KINDS: GENERIC_KINDS, pathSegments: pathSegments, functionRiskView: functionRiskView, addGenericVolume: addGenericVolume,
                BIRD_CASES: BIRD_CASES, basisKey: basisKey, birdCases: birdCases, GROUP_MIN: GROUP_MIN, tireReach: tireReach, birdRays: birdRays, tireCaseResults: tireCaseResults, setRiskFactor: setRiskFactor, setUnmodeledStagesHarmless: setUnmodeledStagesHarmless, fragmentAxialWidth: fragmentAxialWidth, fawProposal: function (r) { return _fawProposal(r); }, setTireOutboard: setTireOutboard, setTireWheelsPerLeg: setTireWheelsPerLeg, setTireFlangeRadius: setTireFlangeRadius, setBirdDiameter: setBirdDiameter, computeBirdZones: computeBirdZones, birdProposalState: birdProposalState, birdInputHash: _birdInputHash, setBirdLevel4: setBirdLevel4, birdZoneProposal: birdZoneProposal, tireConeMesh: tireConeMesh, creditBirdShield: creditBirdShield, creditTireShield: creditTireShield, setTireStowed: setTireStowed, _wedgeHitTris: _wedgeHitTris, parseBasis: parseBasis, PALETTE: PALETTE, setPhaseFactor: setPhaseFactor, PHASES_681: PHASES_681, exactIntervals: exactIntervals, multipleFragments: multipleFragments, averageRisk: averageRisk, tireDefaultReach: tireDefaultReach, setTireReach: setTireReach, confirmTireReach: confirmTireReach, partGroups: partGroups, describeParts: describeParts, describeCadParts: describeCadParts, locationText: locationText,
                _internal: { cylT: _cylT, birdScene: _birdScene, birdRay: _birdRay, ptInWedge: _ptInWedge, ptInCone: _ptInCone, wedgeHitTris: _wedgeHitTris, coneHitTris: _coneHitTris, bvh: _bvh, bvhSegment: _bvhSegment, rayTri: _rayTri, pathHit: _pathHit, partGeom: _partGeom, frame: _frame, ranges: _ranges } };
    // D1: an impact evaluation that met a non-monotone tree beyond the subset bound gives no result: every API call that
    // ran into one returns { ok: false, refused: true, err } instead of a result that could be optimistic.
    Object.keys(api).forEach(function (k) { var f = api[k]; if (typeof f !== 'function' || k === '_internal') return;
        api[k] = function () { var C = _C(), take = C && C.takeRefusals, tnm = C && C.takeNonMonotone; if (take) take(); if (tnm) tnm(); var r = f.apply(this, arguments); var rf = take ? take() : [], nm = tnm ? tnm() : [];
            if (rf.length) return { ok: false, refused: true, notEvaluated: rf[0], err: 'Not evaluated: ' + rf[0], refusals: rf };
            // (timebox 48) every result that used the subset rule says so, for its report and export
            if (nm.length && r && typeof r === 'object' && !Array.isArray(r) && r.ok !== false) { r.nonMonotone = { note: 'non-monotone tree: worst case over subsets used', trees: nm.filter(function (x, i) { return nm.indexOf(x) === i; }) }; }
            return r; }; });
    try { root.SLPraModels = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

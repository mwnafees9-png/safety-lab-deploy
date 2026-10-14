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
    function cite(p) { if (!p) return 'missing'; if (p.source === 'missing') return 'missing' + (p.note ? ': ' + p.note : ''); if (p.source === 'engineer') return 'engineer entered'; if (p.source === 'unverified') return 'unverified' + (p.note ? ': ' + p.note : ''); var r = REFS[p.ref]; return (r ? r.doc + ' ' + r.section : p.ref || p.source) + (p.source === 'derived' ? ' (derived' + (p.note ? ': ' + p.note : '') + ')' : ''); }

    // ---- AC 20-128A fragment models ----------------------------------------------------------
    // R = disc radius (to the blade root), b = blade length; bladed radius Rb = R + b. Lengths mm.
    // halfWidth is half the width of the swept path in the plane of rotation; rCg the radius of
    // the fragment's c.g. at release; massFraction of the bladed disc mass.
    function _sectorCentroid(Rb) { var a = Math.PI / 3; return 2 * Rb * Math.sin(a) / (3 * a); }   // 120 degree sector
    var FRAGMENT_MODELS = {
        oneThirdDisc: { label: 'Single one-third disc fragment', order: 1, spread: P(3, 'ac', 'ac20128a-9a'), massFraction: P(1 / 3, 'ac', 'ac20128a-9a'), criterion: P(1 / 20, 'ac', 'ac20128a-10c3i'),
            geom: function (R, b) {
                var Rb = R + b, rc = _sectorCentroid(Rb);
                // greatest radius from the sector centroid to its periphery: the apex or an arc end
                var toApex = rc, toEnd = Math.sqrt(Rb * Rb + rc * rc - 2 * Rb * rc * Math.cos(Math.PI / 3));
                return { rCg: P(_r6(rc), 'derived', 'ac20128a-9a', 'centroid of a 120 degree sector of the bladed disc; AC Figure 3 places the c.g. on the maximum dimension (the scanned figure is not legible, so the centroid is computed from the geometry)'),
                         halfWidth: P(_r6(Math.max(toApex, toEnd)), 'derived', 'ac20128a-app-a', 'path width = twice the greatest radius from the sector centroid to its periphery'),
                         maxDimension: P(_r6(Rb * Math.sqrt(3)), 'derived', 'ac20128a-9a', 'chord of one-third of the bladed disc') };
            } },
        intermediate: { label: 'Intermediate fragment', order: 2, spread: P(5, 'ac', 'ac20128a-9b'), massFraction: P(1 / 30, 'ac', 'ac20128a-9b'), criterion: P(1 / 40, 'ac', 'ac20128a-10c3ii'),
            geom: function (R, b) { var md = (R + b) / 3; return { rCg: P(_r6(R), 'ac', 'ac20128a-fig4'), halfWidth: P(_r6(md / 2), 'derived', 'ac20128a-9b', 'half the maximum dimension'), maxDimension: P(_r6(md), 'ac', 'ac20128a-9b') }; } },
        alternate: { label: 'Alternative model: single one-third disc at ±5 degrees', order: 3, spread: P(5, 'ac', 'ac20128a-9c'), massFraction: P(1 / 3, 'ac', 'ac20128a-9a'), criterion: P(1 / 20, 'ac', 'ac20128a-10c3i'), optional: true,
            geom: function (R, b) { return FRAGMENT_MODELS.oneThirdDisc.geom(R, b); } },
        small: { label: 'Small fragments', order: 4, spread: P(15, 'ac', 'ac20128a-9d'), massFraction: P(null, 'unverified', null, 'AC 20-128A para 9d gives no mass for engine small fragments; consult the engine manufacturer'), criterion: P(null, 'ac', 'ac20128a-10c5'),
            geom: function (R, b) { var md = b / 2; return { rCg: P(_r6(R + 0.75 * b), 'derived', 'ac20128a-9d', 'middle of the tip half of the blade'), halfWidth: P(_r6(md / 2), 'derived', 'ac20128a-9d', 'half the maximum dimension'), maxDimension: P(_r6(md), 'ac', 'ac20128a-9d') }; } },
        fanBlade: { label: 'Fan blade fragment', order: 5, spread: P(15, 'ac', 'ac20128a-9e'), massFraction: P(null, 'unverified', null, 'one-third of the airfoil including any part span shroud (AC 20-128A para 9e): enter the blade mass'), criterion: P(null, 'ac', 'ac20128a-10c5'), fanOnly: true,
            geom: function (R, b) { var md = b / 3; return { rCg: P(_r6(R + b * 5 / 6), 'derived', 'ac20128a-9e', 'middle of the tip third of the blade; AC Figure 5 not legible in the scan'), halfWidth: P(_r6(md / 2), 'derived', 'ac20128a-9e', 'half the maximum dimension'), maxDimension: P(_r6(md), 'ac', 'ac20128a-9e') }; } }
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
        return { hull: _hull(cs.map(function (x) { return [x.u, x.v]; })), elevDeg: elev };
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
        var p23nc = /part\s*23/.test(basis) && !/commuter/.test(basis);
        var parts = C.partsOf(m).filter(function (p) { return p && p.bbox && String(p.pid) !== r.pid; }).slice().sort(function (a, b) { return _cmp(a.pid, b.pid); })
            .map(function (p) { var g = _partGeom(p, F, r.center); return { pid: String(p.pid), name: p.name || String(p.pid), hull: g.hull, elevDeg: g.elevDeg }; });
        var cache = {};
        var impactOf = function (eq) { var k = eq.join('|'); if (!cache[k]) cache[k] = eq.length ? C.impactOfEquipment(eq) : { conditions: [], worst: null, functions: [], systems: [], equipment: [] }; return cache[k]; };
        var models = (opts.models || FRAGMENT_ORDER).filter(function (k) { var fm = FRAGMENT_MODELS[k]; return fm && !(fm.fanOnly && r.kind !== 'fan'); });
        var results = models.map(function (k) {
            var fm = FRAGMENT_MODELS[k], g = fm.geom(r.discRadius, r.bladeLength);
            var spread = (r.spreadOverride && typeof r.spreadOverride[k] === 'number') ? P(r.spreadOverride[k], 'engineer') : fm.spread;
            var inBand = parts.filter(function (p) { return p.elevDeg <= spread.value + 1e-9; });
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
            var ranges = _ranges(angles, step);
            var catDeg = angles.filter(function (a) { return a.worst === 'Catastrophic'; }).length * step;
            var crit = fm.criterion.value == null ? null : (p23nc ? fm.criterion.value * 2 : fm.criterion.value);
            var ratio = _r6(catDeg / 360);
            // energy: only where a shield or structure is credited (the AC treats the fragment as
            // having infinite energy otherwise)
            var energy = null;
            if (r.shields.length) {
                var mass = (fm.massFraction.value != null && r.bladedDiscMassKg) ? P(_r6(fm.massFraction.value * r.bladedDiscMassKg), 'derived', fm.massFraction.ref, 'fraction of the engineer entered bladed disc mass') : P(null, 'missing', null, r.bladedDiscMassKg ? fm.massFraction.note || 'no mass fraction for this fragment' : 'bladed disc mass not entered');
                var speed = r.rpm ? P(_r6(r.rpm * 2 * Math.PI / 60 * g.rCg.value / 1000), 'derived', g.rCg.ref, 'engineer entered speed times the c.g. radius') : P(null, 'missing', null, 'rotor speed not entered');
                energy = { massKg: mass, speedMs: speed, joules: (mass.value != null && speed.value != null) ? P(_r6(0.5 * mass.value * speed.value * speed.value), 'derived', 'ac20128a-9a', 'translational energy, rotational energy neglected') : P(null, 'missing', null, 'mass or speed missing') };
            }
            return { model: k, label: fm.label, spreadDeg: spread, rCgMm: g.rCg, halfWidthMm: g.halfWidth, maxDimensionMm: g.maxDimension, massFraction: fm.massFraction,
                     angles: angles, ranges: ranges, catastrophicDeg: catDeg, hazardRatio: ratio,
                     criterion: crit == null ? null : { value: crit, ref: p23nc ? 'ac20128a-10c4' : fm.criterion.ref, text: '1 in ' + Math.round(1 / crit) },
                     meets: crit == null ? null : ratio <= crit + 1e-12,
                     assessmentNote: crit == null ? 'No numerical risk assessment is requested for this fragment (AC 20-128A para 10c(5)); the exposed angles are listed for the design precautions.' : null,
                     energy: energy, energyNote: r.shields.length ? null : 'No shield credited: the fragment is treated as having infinite energy (AC 20-128A appendix (a)).' };
        });
        return { ok: true, rotorId: r.id, label: r.label, cadId: cadId, step: step, basis: basis || null, criterionDoubled: p23nc,
                 method: 'Path from the fragment c.g. at release, tangential in the direction of rotation; part boxes projected on the plane of rotation; spread from the plane at the shaft centerline (para 6f); release uniformly distributed (appendix (b)). Results to ' + step + ' degree steps.',
                 models: results };
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
    function basisKey(basis) {
        var b = _s(basis).toLowerCase();
        if (/vtol/.test(b)) return 'sc-vtol';
        if (/29/.test(b) && /part|cs|far/.test(b)) return 'part29';
        if (/27/.test(b) && /part|cs|far/.test(b)) return 'part27';
        if (/23/.test(b) && /part|cs|far/.test(b)) return 'part23';
        if (/25/.test(b) && /part|cs|far/.test(b)) return 'part25';
        return null;
    }
    // birdCases(basis, speeds): speeds { caseId: m/s } engineer entered. Energy = 1/2 m v^2.
    function birdCases(basis, speeds) {
        speeds = speeds || {};
        var k = basisKey(basis);
        if (!k) return { ok: false, err: 'No certification basis set (or not recognized): bird mass and speed are missing.', basis: basis || null };
        return { ok: true, basis: k, cases: BIRD_CASES[k].map(function (c) {
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
        return { equipment: eq, conditions: im.conditions.map(function (c) { return { fcId: c.fcId || c.id, desc: c.desc, severity: c.severity }; }), worst: im.worst || null,
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
                    upDir: _n3(t.upDir) ? _unit(t.upDir) : [0, 0, 1], outboard: _n3(t.outboard) ? _unit(t.outboard) : null,
                    flangeHalfAngleDeg: t.flangeHalfAngleDeg > 0 ? t.flangeHalfAngleDeg : null, burstReachMm: t.burstReachMm > 0 ? t.burstReachMm : null,
                    confirmedBy: _s(by), confirmedAt: opts.at || new Date().toISOString() };
        var i = arr.findIndex(function (x) { return x && x.id === id; }); if (i >= 0) arr[i] = rec; else arr.push(rec);
        _save(); return { ok: true, tire: _clone(rec) };
    }
    // _bandHit(part, center, axis, theta, reach, upDir): any corner or the box center within
    // theta of the wheel plane (either side of the tire center line), above the axle (towards
    // the aircraft) and within reach when given.
    function _samplePts(b) { return _corners(b).concat([[(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]]); }
    function _bandHit(p, c, ax, theta, reach, up) {
        return _samplePts(p.bbox).some(function (q) {
            var w = _sub(q, c), d = _len(w); if (d === 0) return true;
            if (reach != null && d > reach) return false;
            if (up && _dot(w, up) < 0) return false;
            return Math.asin(Math.min(1, Math.abs(_dot(w, ax)) / d)) / D2R <= theta + 1e-9;
        });
    }
    function tireThreats(tireId, opts) {
        opts = opts || {};
        var t = tire(tireId); if (!t || !t.confirmedBy) return { ok: false, err: 'Tire not found or not confirmed by an engineer.' };
        var X = _ctx(opts.cadId || t.cadId); if (!X) return { ok: false, err: 'No CAD model or the CAD / zonal engine is not loaded.' };
        var W = t.sectionWidth, DG = t.grownDiameter;
        var others = X.parts.filter(function (p) { return String(p.pid) !== t.pid; });
        var models = TIRE_ORDER.map(function (k) {
            var tm = TIRE_MODELS[k], theta = tm.theta, reach = null, params = {}, hits = [], note = null;
            if (tm.brakedOnly && !t.braked) return { model: k, label: tm.label, applies: false, note: 'Model 4 applies only to tires on braked wheels (AMC 25.734 Model 4 (1)).' };
            if (k === 'm1Large') params = { sizeMm: P(_r6(W) + ' x ' + _r6(W), 'ac', 'amc25-734-m1'), speedMs: t.speedRatingMs ? P(t.speedRatingMs, 'engineer', null, 'minimum tire speed rating') : P(null, 'missing', null, 'minimum tire speed rating not entered') };
            if (k === 'm1Small') {
                var mm = t.massKg ? P(_r6(0.01 * t.massKg), 'derived', 'amc25-734-m1', '1 per cent of the engineer entered tire mass') : P(null, 'missing', null, 'tire mass not entered');
                var sp = t.speedRatingMs ? P(t.speedRatingMs, 'engineer') : P(null, 'missing', null, 'minimum tire speed rating not entered');
                params = { massKg: mm, speedMs: sp, impactAreaMm2: P(_r6(0.015 * Math.PI * DG * W), 'derived', 'amc25-734-m1', '1.5 per cent of the total tread area pi DG WSG'),
                           energyJ: (mm.value != null && sp.value != null) ? P(_r6(0.5 * mm.value * sp.value * sp.value), 'derived', 'amc25-734-m1', '1/2 m v^2') : P(null, 'missing', null, 'mass or speed missing') };
            }
            if (k === 'm2Flange') { params = { arcDeg: P(60, 'ac', 'amc25-734-m2'), speedMs: P(100, 'ac', 'amc25-734-m2') }; if (t.flangeHalfAngleDeg) theta = P(t.flangeHalfAngleDeg, 'engineer'); }
            if (k === 'm3Strip') { reach = DG / 2 + 2.5 * W; params = { lengthMm: P(_r6(2.5 * W), 'ac', 'amc25-734-m3'), widthMm: P(_r6(W / 2), 'ac', 'amc25-734-m3'), reachMm: P(_r6(reach), 'derived', 'amc25-734-m3', 'grown radius plus the strip length') }; }
            if (k === 'm4Burst') {
                params = { burstPressureKpaAbs: t.ratedPressureKpa ? P(_r6((t.ratedPressureKpa / 1.07 + 101.325) * 1.3), 'derived', 'amc25-734-m4', '1.3 x (rated / 1.07 + 101.325 kPa ambient), absolute, as in the AMC example') : P(null, 'missing', null, 'unloaded rated tire pressure not entered'),
                           decayConstants: P('C1 12.478, C2 1.222, C3 0.024', 'ac', 'amc25-734-m4e'), plume: P(t.radial ? 'radial: wedge (Figures 4d, 4e)' : 'bias: cone rotated ±100 degrees over the tread (Figure 4a)', 'ac', 'amc25-734-m4'),
                           decayFormula: P(null, 'unverified', null, 'the decay formula of Figure 4e is an image in the published text; the pressure at a distance is not computed') };
                reach = t.burstReachMm || null; if (reach) theta = P(90, 'engineer', null, 'whole plume reach entered by the engineer');
            }
            if (theta.value == null || (k === 'm4Burst' && !reach)) return { model: k, label: tm.label, applies: true, theta: theta, params: params, hits: [], incomplete: true, note: 'Exposure not computed: ' + cite(theta) };
            others.forEach(function (p) {
                var ok;
                if (tm.lateral) {
                    var out = t.outboard || t.axis;
                    ok = _samplePts(p.bbox).some(function (q) { var w = _sub(q, t.center), d = _len(w); return d > 0 && Math.acos(Math.max(-1, Math.min(1, _dot(w, out) / d))) / D2R <= theta.value + 1e-9; });
                } else ok = _bandHit(p, t.center, t.axis, theta.value, reach, k === 'm4Burst' ? null : t.upDir);
                if (ok) hits.push(String(p.pid));
            });
            var im = _impactFor(X, hits);
            return { model: k, label: tm.label, applies: true, gear: tm.gear, theta: theta, params: params, hits: hits,
                     zones: hits.map(function (pid) { return { pid: pid, zoneId: X.zoneOf[pid] || null, zone: _zoneLabel(X.zoneOf[pid]) }; }),
                     wheelWellHits: hits.filter(function (pid) { var zl = _zoneLabel(X.zoneOf[pid]) || ''; return /wheel\s*well|gear\s*bay|landing\s*gear/i.test(zl); }),
                     equipment: im.equipment, conditions: im.conditions, worst: im.worst, functions: im.functions, unlinkedParts: im.unlinkedParts, shared: _sharedExposure(im.equipment),
                     note: k === 'm1Large' ? 'Companion tire: both tires releasing large debris inside 15 degrees (AMC 25.734 Model 1 (3)).' : null };
        });
        return { ok: true, tireId: t.id, label: t.label, cadId: X.cadId, models: models, method: 'Part boxes (corners and center) tested against each model zone from the tire center; zones are measured either side of the tire center line, towards the aircraft.' };
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
            var tt = tireThreats(t.id, { cadId: X.cadId }); if (!tt.ok) return;
            tt.models.forEach(function (m) { _arr(m.equipment).forEach(function (sid) { add(sid, { kind: 'tireBurst', risk: 'tireBurst', label: t.label + ': ' + m.label, worst: m.worst, src: 'praTires/' + t.id + '#' + m.model }); }); });
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

    var api = { VERSION: VERSION, REFS: REFS, ref: ref, cite: cite, FRAGMENT_MODELS: FRAGMENT_MODELS, FRAGMENT_ORDER: FRAGMENT_ORDER,
                proposeRotors: proposeRotors, rotorIssue: rotorIssue, confirmRotor: confirmRotor, rotors: rotors, rotor: rotor, removeRotor: removeRotor,
                sweep: sweep, TIRE_MODELS: TIRE_MODELS, TIRE_ORDER: TIRE_ORDER, proposeTires: proposeTires, confirmTire: confirmTire, tires: tires, tire: tire, tireThreats: tireThreats,
                birdExposure: birdExposure, LIGHTNING_ZONES: LIGHTNING_ZONES, LIGHTNING_EFFECTS: LIGHTNING_EFFECTS, proposeLightningZones: proposeLightningZones, confirmLightningZones: confirmLightningZones, lightningZones: lightningZones, GENERIC_KINDS: GENERIC_KINDS, pathSegments: pathSegments, functionRiskView: functionRiskView, addGenericVolume: addGenericVolume,
                BIRD_CASES: BIRD_CASES, basisKey: basisKey, birdCases: birdCases,
                _internal: { pathHit: _pathHit, partGeom: _partGeom, frame: _frame, ranges: _ranges } };
    try { root.SLPraModels = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

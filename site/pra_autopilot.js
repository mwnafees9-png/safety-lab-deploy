// pra_autopilot.js (SLPraAuto v1.0, 4 Nov 2026): the PRA Autopilot on the PRA page.
//
// Waqas: "Put PRAs in the PRA ... make the inputs more intuitive"; "think about it similarly to how we built the planning
// auto pilot"; "so intuitive my 10 year old daughter should be able to do it". Same pattern as the ZSA Autopilot
// (zsa_autopilot.js) and the same look (autopilot_ui.js).
//
// For each particular risk the tool works out, on the CAD model, what it could reach and what that would cause:
//   ROTOR    each engine's fan and turbine discs (parts named as rotating discs in the CAD model): the parts inside the
//            burst band of every fragment AC 20-128A asks for (one-third disc +/-3 degrees, intermediate +/-5, small
//            +/-15; the alternative +/-5 one-third disc when chosen), out to the fragment range;
//   TIRE     each main bogie's tire burst volume, and the wheel-well fire, from the risk volumes on the CAD page;
//   FIRE     the hold fire volume;
//   BIRD     the parts right behind the forward-facing surfaces (nose, wing leading edges, engine intakes, fins);
//   LIGHT    the parts close to the likely lightning attachment points (nose, wing tips, fin tips, nacelles).
// It asks only the real choices: for the rotor bursts, which fragments to plan for (each answer shows how many parts and
// systems that reaches); and for every risk, each set of lanes of the same job that one event reaches together, where
// the answers are protect it (shield), move one lane, or accept with the reason the standard allows. Each answer says
// what it changes before it is picked; the risk's row in the PRA table is written from the answers (adopted by its PRA
// id, never duplicated). The full AC 20-128A angle sweep with hazard ratios stays in the PRA panel on the CAD page.
// Answers: projectConfig.praAuto = { v:1, answers: { qid: { pick, by, at } }, signed: { riskKey: { by, at } } }.
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var D2R = Math.PI / 180;
    function U() { return root.SLAutopilotUI; }
    function C() { return root.SLCadZonal; }
    function ZA() { return root.SLZsaAuto; }
    function _g(n) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
    function _pc() { return _g('projectConfig') || {}; }
    function _arr(a) { return Array.isArray(a) ? a : []; }
    function _store() { var pc = _pc(); var s = pc.praAuto; if (!s || typeof s !== 'object') s = pc.praAuto = { v: 1, answers: {}, signed: {} }; s.answers = s.answers || {}; s.signed = s.signed || {}; s.settings = s.settings || {}; return s; }
    function _peekStore() { var s = _pc().praAuto; return (s && typeof s === 'object') ? s : { answers: {}, signed: {}, settings: {} }; }
    var SEV = ['No Safety Effect', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];
    function sevRank(s) { var i = SEV.indexOf(String(s || '')); return i < 0 ? -1 : i; }
    function _hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
    function _sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function _dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function _len(a) { return Math.sqrt(_dot(a, a)); }
    function _center(b) { return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; }
    function _samples(b) { var out = [], xs = [b.min[0], (b.min[0] + b.max[0]) / 2, b.max[0]], ys = [b.min[1], (b.min[1] + b.max[1]) / 2, b.max[1]], zs = [b.min[2], (b.min[2] + b.max[2]) / 2, b.max[2]]; xs.forEach(function (x) { ys.forEach(function (y) { zs.forEach(function (z) { out.push([x, y, z]); }); }); }); return out; }
    function _sys(id) { return _arr(_g('systemsData')).find(function (s) { return s && s.id === id; }) || null; }
    function worstOf(ids) { return ZA() && ZA().worstOf ? ZA().worstOf(ids) : null; }
    function label(u) { return u.designator && u.designator !== u.name ? u.name + ' (' + u.designator + ')' : u.name; }

    // ---- the fragments AC 20-128A asks for (spread from pra_models.js FRAGMENT_MODELS, para 9) --------------
    var FRAG = [
        { id: 'oneThirdDisc', label: 'one-third disc', spread: 3, ref: 'AC 20-128A para 9a', criterion: '1 in 20' },
        { id: 'intermediate', label: 'intermediate piece', spread: 5, ref: 'AC 20-128A para 9b', criterion: '1 in 40' },
        { id: 'small', label: 'small pieces', spread: 15, ref: 'AC 20-128A para 9d', criterion: null },
        { id: 'alternate', label: 'one-third disc, alternative model', spread: 5, ref: 'AC 20-128A para 9c', criterion: '1 in 20', optional: true }
    ];
    function _spreadOf(id) { try { var M = root.SLPraModels && root.SLPraModels.FRAGMENT_MODELS; if (M && M[id] && M[id].spread && typeof M[id].spread.value === 'number') return M[id].spread.value; } catch (_) {} var f = FRAG.find(function (x) { return x.id === id; }); return f ? f.spread : 15; }
    var RANGE = 40000;   // mm: fragment range for the hit list (the PRA panel's sweep has no range limit)

    // ---- the risks on this model ---------------------------------------------------------------------------
    var _cache = null;
    function compute() {
        var CZ = C(); if (!CZ || !ZA()) return null;
        var cadId = CZ.latestCadId && CZ.latestCadId(); if (!cadId) return null;
        var m = CZ.model(cadId); if (!m) return null;
        var parts = (CZ.partsOf ? CZ.partsOf(cadId) : m.parts) || [];
        var key = cadId + '|' + parts.length + '|' + !!(_peekStore().settings || {}).alternate + '|' + (CZ.riskVolumes() || []).length + '|' + JSON.stringify(_rotorRecs());
        if (_cache && _cache.key === key) return _cache.res;
        var links = CZ.confirmed ? CZ.confirmed(cadId) : {};
        var units = [], runs = [];
        parts.forEach(function (p) {
            var sysId = links[p.pid] || null, k = ZA().classify(p, sysId);
            if (k.kind === 'unit') units.push({ pid: p.pid, name: p.name, designator: p.designator || '', sysId: sysId, sysName: sysId && _sys(sysId) ? _sys(sysId).name : (_arr(p.path)[2] || ''), bbox: p.bbox, k: k });
            else if (k.kind === 'route') runs.push({ pid: p.pid, run: k.run, kind: k.routeKind, bbox: p.bbox });
        });
        var zoneOf = {}; try { CZ.containment(cadId).parts.forEach(function (r) { if (r.zoneId) zoneOf[r.pid] = r.zoneId; }); } catch (_) {}
        var Z = root.ZONES, topCode = function (zid) { var z = Z && Z.get(zid), g = 0; while (z && z.parentId && g++ < 20) z = Z.get(z.parentId); return z ? z.code : null; };
        var risks = [];
        // ROTOR: the engines' discs
        // 4 Nov 2026: the AC 20-128A set always; the alternative one-third disc model when ticked on the inputs screen
        var frags = FRAG.filter(function (f) { return !f.optional || !!(_peekStore().settings || {}).alternate; });
        var rotors = parts.filter(function (p) { return /\b(fan|turbine|compressor)\b.*\b(disc|disk|rotor)\b|\b(rotor|disc)\b.*\b(fan|turbine)\b/i.test(p.name || '') && p.bbox; });
        var byEngine = {};
        rotors.forEach(function (p) { var n = /ENG-(\d+)/.exec(p.designator || '') || /engine (\d+)/i.exec(p.name || ''); var e = n ? n[1] : '?'; (byEngine[e] = byEngine[e] || []).push(p); });
        Object.keys(byEngine).sort().forEach(function (e) {
            var discs = byEngine[e].map(function (p) {
                var ext = [0, 1, 2].map(function (i) { return p.bbox.max[i] - p.bbox.min[i]; }), ax = ext.indexOf(Math.min.apply(null, ext)), axis = [0, 0, 0]; axis[ax] = 1;
                return { pid: p.pid, name: p.name, designator: p.designator || '', cadId: cadId, center: _center(p.bbox), axis: axis, radius: Math.max.apply(null, ext.filter(function (_, i) { return i !== ax; })) / 2, thickness: ext[ax], fan: /\bfan\b/i.test(p.name || '') };
            });
            var reach = function (u, spread) {
                return discs.some(function (d) { return _samples(u.bbox).some(function (q) { var w = _sub(q, d.center), L = _len(w); if (L < 1 || L > RANGE) return false; var el = Math.asin(Math.min(1, Math.abs(_dot(w, d.axis)) / L)) / D2R; return el <= spread; }); });
            };
            var maxSpread = Math.max.apply(null, frags.map(function (f) { return _spreadOf(f.id); }));
            var shapes = discs.map(function (d) { return { kind: 'sector', center: d.center, range: RANGE * 0.5, spreadDeg: maxSpread }; });
            risks.push(_risk({ key: 'rotor-' + e, praId: 'PRA-001', kind: 'ROTOR', title: 'Engine ' + e + ' rotor burst', short: 'Engine ' + e,
                what: 'A spinning disc in engine ' + e + ' breaks and pieces fly out sideways, in a thin band around the engine.',
                shapes: shapes, frags: frags, discs: discs, engine: e, units: units, runs: runs, reachFor: function (u) { var hit = null; frags.forEach(function (f) { if (!hit && reach(u, _spreadOf(f.id))) hit = f; }); return hit; }, zoneOf: zoneOf, topCode: topCode }));
        });
        // TIRE, FIRE: the risk volumes on the CAD page, grouped by kind and PRA row
        var vols = CZ.riskVolumes() || [];
        var groups = {};
        vols.filter(function (v) { return v.kind !== 'rotorBurst'; }).forEach(function (v) { var k = v.kind + '|' + (v.praId || ''); (groups[k] = groups[k] || []).push(v); });
        Object.keys(groups).sort().forEach(function (k) {
            var vs = groups[k], v0 = vs[0];
            var title = v0.kind === 'tireBurst' ? 'Tire burst' : (vs.length === 1 ? v0.label : v0.label.replace(/,.*$/, ''));
            risks.push(_risk({ key: 'vol-' + _hash(k), praId: v0.praId || null, kind: v0.kind === 'tireBurst' ? 'TIRE' : 'FIRE', title: title, short: title,
                what: v0.kind === 'tireBurst' ? 'A tire bursts on the ground or as the gear retracts, and tread and pieces fly around the wheel well.' : 'A fire starts here: ' + vs.map(function (v) { return v.label; }).join('; ') + '.',
                shapes: vs.map(function (v) { var s = v.shape; return s.kind === 'sphere' ? { kind: 'sphere', center: s.center, radius: s.radius } : (s.kind === 'box' ? { kind: 'box', min: s.min, max: s.max } : null); }).filter(Boolean),
                units: units, runs: runs, reachFor: function (u) { return vs.some(function (v) { return CZ.inShape(v.shape, _center(u.bbox)) || _samples(u.bbox).some(function (q) { return CZ.inShape(v.shape, q); }); }) ? { id: 'volume' } : null; }, zoneOf: zoneOf, topCode: topCode }));
        });
        // BIRD: right behind the forward-facing surfaces
        var Zall = Z ? Z.all().filter(function (z) { return z && z.volume && z.volume.kind === 'box'; }) : [];
        var front = Zall.filter(function (z) { return /NOSE|NAC|WING|EMP|FDCK/.test(z.code || ''); }).map(function (z) { var b = { min: z.volume.min.slice(), max: z.volume.max.slice() }; b.max[0] = Math.min(b.max[0], b.min[0] + (/NOSE|FDCK/.test(z.code) ? 3000 : 1500)); return b; });
        if (front.length) risks.push(_risk({ key: 'bird', praId: 'PRA-006', kind: 'BIRD', title: 'Bird strike', short: 'Bird strike',
            what: 'A bird hits the front of the aircraft: the nose, the wing and tail leading edges or an engine intake. Whatever sits right behind those surfaces can be hit.',
            shapes: front.map(function (b) { return { kind: 'box', min: b.min, max: b.max }; }), units: units, runs: runs,
            reachFor: function (u) { var c = _center(u.bbox); return front.some(function (b) { return c[0] >= b.min[0] && c[0] <= b.max[0] && c[1] >= b.min[1] && c[1] <= b.max[1] && c[2] >= b.min[2] && c[2] <= b.max[2]; }) ? { id: 'front' } : null; }, zoneOf: zoneOf, topCode: topCode }));
        // LIGHT: close to the likely attachment points (lightning zones 1A and 1B: nose, wing tips, fin tips, nacelle fronts)
        var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        Zall.forEach(function (z) { for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], z.volume.min[i]); hi[i] = Math.max(hi[i], z.volume.max[i]); } });
        if (Zall.length) {
            var pts = [[lo[0], 0, (lo[2] + hi[2]) / 2], [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2], [(lo[0] + hi[0]) / 2, hi[1], (lo[2] + hi[2]) / 2], [hi[0], 0, hi[2]]];
            Zall.filter(function (z) { return /EMP/.test(z.code || ''); }).forEach(function (z) { pts.push([z.volume.max[0], z.volume.min[1], z.volume.max[2]], [z.volume.max[0], z.volume.max[1], z.volume.max[2]]); });
            Zall.filter(function (z) { return /NAC/.test(z.code || ''); }).forEach(function (z) { pts.push([z.volume.min[0], (z.volume.min[1] + z.volume.max[1]) / 2, (z.volume.min[2] + z.volume.max[2]) / 2]); });
            var lsh = pts.map(function (p) { return { kind: 'sphere', center: p, radius: 3000 }; });
            risks.push(_risk({ key: 'lightning', praId: 'PRA-007', kind: 'LIGHT', title: 'Lightning strike', short: 'Lightning strike',
                what: 'Lightning attaches at the nose, a wing tip, a fin tip or an engine front and runs through the structure. Units and wiring close to those points get the strongest currents.',
                shapes: lsh, units: units, runs: runs, reachFor: function (u) { var c = _center(u.bbox); return lsh.some(function (s) { return _len(_sub(c, s.center)) <= s.radius; }) ? { id: 'near' } : null; }, zoneOf: zoneOf, topCode: topCode }));
        }
        var res = { cadId: cadId, risks: risks, byKey: {} };
        risks.forEach(function (r) { res.byKey[r.key] = r; });
        _cache = { key: key, res: res };
        return res;
    }
    function _risk(o) {
        var hits = o.units.filter(function (u) { var h = o.reachFor(u); if (h) u._frag = h; return !!h; }).map(function (u) { return Object.assign({}, u, { frag: u._frag }); });
        o.units.forEach(function (u) { delete u._frag; });
        var runHits = {}; o.runs.forEach(function (r) { if (!runHits[r.run] && o.reachFor(r)) runHits[r.run] = r; });
        var runList = Object.keys(runHits).sort().map(function (k) { return runHits[k]; });
        var runParts = {}; o.runs.forEach(function (r) { if (runHits[r.run]) (runParts[r.run] = runParts[r.run] || []).push(r.pid); });
        var sysSet = {}; hits.forEach(function (u) { if (u.sysId) sysSet[u.sysId] = 1; });
        var zones = {}; hits.forEach(function (u) { var z = o.zoneOf[u.pid]; var c = z ? o.topCode(z) : null; if (c) zones[c] = 1; });
        var r = { key: o.key, praId: o.praId, kind: o.kind, title: o.title, short: o.short, what: o.what, shapes: o.shapes, frags: o.frags || null, discs: o.discs || null, engine: o.engine || null, hits: hits, runs: Object.keys(runHits).sort(), runHits: runList, runParts: runParts, systems: Object.keys(sysSet).sort(), zones: Object.keys(zones).sort(), questions: [] };
        r.worst = worstOf(r.systems);
        r.groups = _laneGroups(r);
        if (r.kind === 'ROTOR') _rotorCalc(r);
        _questions(r);
        _routeLanes(r, r.questions);
        return r;
    }
    function _questions(r) {
        var Q = r.questions;
        // lanes of the same job reached by the same event
        var lanes = {};
        r.hits.filter(function (u) { return u.sysId; }).forEach(function (u) { var k = ZA().laneKey(u.name) || u.name.toLowerCase(); (lanes[u.sysId + '|' + k] = lanes[u.sysId + '|' + k] || []).push(u); });
        Object.keys(lanes).sort().forEach(function (k) {
            var g = lanes[k].slice().sort(function (a, b) { return String(a.designator || a.name).localeCompare(String(b.designator || b.name), undefined, { numeric: true }); });
            if (g.length < 2) return;
            var w = worstOf([g[0].sysId]); if (!w || sevRank(w.severity) < 2) return;
            // rotor burst: asked only once the numbers are in and only where they fail AC 20-128A (_rotorCalc)
            var calc = null;
            if (r.kind === 'ROTOR') { var gk = 'u:' + g.map(function (u) { return u.pid; }).join('|'); calc = (r.calc && r.calc.groups[gk]) || null; if (!calc || calc.status === 'meets' || calc.status === 'clear') return; }
            var names = g.map(label), all = g.length === 2 ? 'both ' + names.join(' and ') : 'all ' + g.length + ': ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
            var accept = r.kind === 'ROTOR' ? null   // the numbers decide: no "accept" when they fail
                : { id: 'qualified', label: 'They are built and tested to survive it', status: 'accepted', mitigation: names.join(', ') + ' qualified for this risk; accepted', impact: 'Accepts it. The qualification (test report) is listed as the evidence it needs.' };
            var colors = ['#2563EB', '#7C3AED', '#0D9488', '#DB2777'];
            Q.push({ id: r.key + ':lanes:' + _hash(g.map(function (u) { return u.pid; }).join('|')), rule: 'LANES',
                text: (r.kind === 'ROTOR' ? (calc.status === 'small' ? 'Small pieces from a burst in engine ' + r.engine + ' can reach ' + all + ' together. What protects them?' : 'A burst in engine ' + r.engine + ' fails the AC 20-128A limit for ' + all + '. What protects them?') : 'One ' + r.short.toLowerCase() + ' could reach ' + all + '. What protects them?'),
                why: (r.kind === 'ROTOR' ? _calcWhy(calc) + ' ' : '') + 'They do the same job (' + U().E(g[0].sysName) + '). Losing them: <b>' + U().E(w.fc) + '</b> (' + U().E(w.severity) + ').',
                marks: g.slice(0, 4).map(function (u, i) { return { min: u.bbox.min, max: u.bbox.max, color: colors[i], label: label(u) }; }),
                legend: g.slice(0, 4).map(function (u, i) { return [colors[i], label(u)]; }),
                options: [
                    { id: 'shield', label: 'A shield or structure stops it before it reaches them', status: 'mitigated', mitigation: 'Shield between the ' + r.short.toLowerCase() + ' and ' + names.join(', '), impact: 'Adds the shield as a mitigation. Its strength (energy it absorbs) is listed as needed evidence.' },
                    { id: 'move', label: 'One of them moves out of the way', status: 'open', mitigation: 'Design change: move ' + names[names.length - 1] + ' out of the ' + r.short.toLowerCase() + ' path', impact: 'Records a design change. This stays open in the PRA until the CAD model shows them apart' + (r.kind === 'ROTOR' ? ' and the calculation passes.' : '.') }
                ].concat(accept ? [accept] : []) });
        });
    }
    // lines of the same kind that differ only by their lane letter or number (H-A-02 and H-B-02): one event reaching both
    var RUN_SYS = { hydraulic: /hydraulic power/i, fuel: /^fuel system/i, wire: /wiring/i, bleed: /pneumatic|environmental/i, oxygen: /oxygen/i };
    function _routeLanes(r, Q) {
        var groups = {};
        r.runHits.forEach(function (x) { var k = x.kind + '|' + String(x.run).toUpperCase().replace(/(^|-)([A-D]|[1-4])(?=-|$)/g, '$1#'); if (k.indexOf('#') < 0) return; (groups[k] = groups[k] || []).push(x); });
        Object.keys(groups).sort().forEach(function (k) {
            var g = groups[k]; if (g.length < 2) return;
            var kind = g[0].kind, rx = RUN_SYS[kind]; var sys = rx ? _arr(_g('systemsData')).find(function (s) { return rx.test(s.name || ''); }) : null;
            var w = sys ? worstOf([sys.id]) : null; if (!w || sevRank(w.severity) < 2) return;
            var calc = null;
            if (r.kind === 'ROTOR') { calc = (r.calc && r.calc.groups['r:' + g.map(function (x) { return x.run; }).join('|')]) || null; if (!calc || calc.status === 'meets' || calc.status === 'clear') return; }
            var names = g.map(function (x) { return (kind === 'wire' ? 'harness ' : kind + ' line ') + x.run; }), all = g.length === 2 ? 'both ' + names.join(' and ') : 'all ' + g.length + ': ' + names.join(', ');
            var colors = ['#2563EB', '#7C3AED', '#0D9488', '#DB2777'];
            Q.push({ id: r.key + ':runs:' + _hash(g.map(function (x) { return x.run; }).join('|')), rule: 'LINES',
                text: (r.kind === 'ROTOR' ? (calc.status === 'small' ? 'Small pieces from a burst in engine ' + r.engine + ' can cut ' + all + ' together. What protects them?' : 'A burst in engine ' + r.engine + ' fails the AC 20-128A limit for ' + all + '. What protects them?') : 'One ' + r.short.toLowerCase() + ' could cut ' + all + '. What protects them?'),
                why: (r.kind === 'ROTOR' ? _calcWhy(calc) + ' ' : '') + 'They carry the same thing on separate lanes (' + U().E(sys.name) + '). Losing them: <b>' + U().E(w.fc) + '</b> (' + U().E(w.severity) + ').',
                marks: g.slice(0, 4).map(function (x, i) { return { min: x.bbox.min, max: x.bbox.max, color: colors[i], label: names[i] }; }),
                legend: g.slice(0, 4).map(function (x, i) { return [colors[i], names[i]]; }),
                options: [
                    { id: 'shield', label: 'A shield or structure stops it before it reaches them', status: 'mitigated', mitigation: 'Shield between the ' + r.short.toLowerCase() + ' and ' + names.join(', '), impact: 'Adds the shield as a mitigation. Its strength is listed as needed evidence.' },
                    { id: 'move', label: 'One line is rerouted away from the other', status: 'open', mitigation: 'Design change: reroute ' + names[names.length - 1] + ' out of the ' + r.short.toLowerCase() + ' area', impact: 'Records a design change. This stays open in the PRA until the CAD model shows the new route.' },
                ].concat(r.kind === 'ROTOR' ? [] : [{ id: 'accept', label: 'Losing both lines is acceptable here', status: sevRank(w.severity) >= 3 ? 'open' : 'accepted', mitigation: 'Loss of ' + names.join(' and ') + ' accepted: ' + w.fc + ' (' + w.severity + ')', impact: sevRank(w.severity) >= 3 ? 'Losing them leads to ' + w.fc + ' (' + w.severity + '), so this cannot simply be accepted: it stays open for a common mode review (CMA).' : 'Accepts losing them.' }]) });
        });
    }
    // ---- rotor burst: the inputs, and the AC 20-128A calculation (4 Nov 2026) -----------------------------
    // Waqas: "why are we asking these questions rather than doing the calculations and giving them the answers"; "they
    // should be doing it as part of the PRA auto pilot". Each engine's discs are set up on the Autopilot's first screen
    // (position, spin axis, diameter, blade length and fragment width from the CAD model; mass and redline speed from the
    // engine maker), confirmed into Safety Lab's rotor store (pra_models.js confirmRotor, the same record the PRA panel
    // uses). Then the PRA panel's own AC 20-128A sweep (pra_models.js sweep) runs on the lanes this risk can reach: for
    // every pair (or set) of lanes of one job, the share of release angles at which ONE fragment reaches all of them,
    // per fragment type, the worst of the engine's discs, against the AC limit (1 in 20 one-third disc, 1 in 40
    // intermediate). Conservative: no credit for a fragment passing above or below one of them within the spread.
    // Within the limit: recorded with the number, nothing asked. Over it: shield or move. Small pieces (no number in
    // the AC, para 10c(5)): design precautions, asked only when one piece can reach all the lanes.
    function rotorId(d) { return 'ap-' + _hash(String(d.pid)); }
    function _rotorRecs() { return _arr(_pc().praRotors).filter(function (x) { return x && /^ap-/.test(x.id); }).map(function (x) { return [x.id, x.center, x.axis, x.discRadius, x.bladeLength, x.fragmentAxialWidthMm, x.bladedDiscMassKg, x.rpm, x.rotation, x.confirms ? Object.keys(x.confirms).sort().join(',') : '']; }); }
    function rotorReady(d) {
        var P = root.SLPraModels; if (!P) return false;
        var rec = P.rotor(rotorId(d)); if (!rec) return false;
        var s1 = P.step1Status(rec.id); return !!(s1 && s1.unlocked && rec.confirms && rec.confirms.axialWidth);
    }
    function _isDemo() { try { return !!(root.SLHl1Cad && root.SLHl1Cad.isAeolus && root.SLHl1Cad.isAeolus()); } catch (_) { return false; } }
    // what the inputs screen starts from: the stored rotor, else the CAD model (and, in the Aeolus demo, its assumptions)
    function prefill(d) {
        var P = root.SLPraModels, rec = P ? P.rotor(rotorId(d)) : null, R = d.radius, demo = _isDemo();
        if (rec) return { center: rec.center.slice(), axis: rec.axis.slice(), diameter: Math.round(2 * rec.discRadius), blade: Math.round(rec.bladeLength), width: rec.fragmentAxialWidthMm, mass: rec.bladedDiscMassKg, rpm: rec.rpm, rotation: rec.rotation, demo: false };
        return { center: d.center.map(Math.round), axis: d.axis.slice(), diameter: Math.round(2 * R * (d.fan ? 0.3 : 0.8)), blade: Math.round(R * (d.fan ? 0.7 : 0.2)), width: Math.round(d.thickness), mass: demo ? (d.fan ? 450 : 120) : null, rpm: demo ? (d.fan ? 3300 : 12000) : null, rotation: 1, demo: demo };
    }
    function saveRotor(d, v, by) {
        var P = root.SLPraModels; if (!P) return { ok: false, err: 'The particular risk models are not loaded.' };
        var num = function (x) { var n = Number(String(x == null ? '' : x).replace(/,/g, '')); return isFinite(n) ? n : NaN; };
        var c = (v.center || []).map(num), dia = num(v.diameter), bl = num(v.blade), w = num(v.width), mass = num(v.mass), rpm = num(v.rpm);
        if (c.length !== 3 || c.some(isNaN)) return { ok: false, err: 'Where it is needs three numbers (mm).' };
        if (!(dia > 0)) return { ok: false, err: 'The disc diameter must be more than 0 mm.' };
        if (!(bl >= 0)) return { ok: false, err: 'The blade length must be 0 or more (mm).' };
        if (!(w >= 0)) return { ok: false, err: 'The fragment width must be 0 or more (mm).' };
        if (!(mass > 0)) return { ok: false, err: 'Enter the disc mass with its blades (kg), from the engine maker\'s data.' };
        if (!(rpm > 0)) return { ok: false, err: 'Enter the redline speed (rpm), from the engine maker\'s data.' };
        var r = P.confirmRotor({ id: rotorId(d), label: 'Engine ' + (v.engine || '') + ' ' + (d.fan ? 'fan disc' : 'turbine disc'), cadId: d.cadId, pid: d.pid, kind: d.fan ? 'fan' : 'rotor', center: c, axis: v.axis || d.axis, rotation: v.rotation === -1 ? -1 : 1,
            discRadius: dia / 2, bladeLength: bl, fragmentAxialWidthMm: w, bladedDiscMassKg: mass, rpm: rpm, engine: 'Engine ' + (v.engine || '') }, by);
        if (!r || !r.ok) return { ok: false, err: (r && r.err) || 'The rotor could not be saved.' };
        ['location', 'diameter', 'mass', 'rpm', 'axialWidth'].forEach(function (f) { P.confirmRotorField(r.rotor.id, f, by); });
        return { ok: true };
    }
    // the lanes this risk reaches: units of one job (same system, same name once the lane is taken out) and lines of one kind
    function _laneGroups(r) {
        var out = [], lanes = {};
        r.hits.filter(function (u) { return u.sysId; }).forEach(function (u) { var k = ZA().laneKey(u.name) || u.name.toLowerCase(); (lanes[u.sysId + '|' + k] = lanes[u.sysId + '|' + k] || []).push(u); });
        Object.keys(lanes).sort().forEach(function (k) {
            var g = lanes[k].slice().sort(function (a, b) { return String(a.designator || a.name).localeCompare(String(b.designator || b.name), undefined, { numeric: true }); });
            if (g.length < 2) return; var w = worstOf([g[0].sysId]); if (!w || sevRank(w.severity) < 2) return;
            out.push({ key: 'u:' + g.map(function (u) { return u.pid; }).join('|'), names: g.map(label), members: g.map(function (u) { return [u.pid]; }), worst: w });
        });
        var rg = {};
        r.runHits.forEach(function (x) { var k = x.kind + '|' + String(x.run).toUpperCase().replace(/(^|-)([A-D]|[1-4])(?=-|$)/g, '$1#'); if (k.indexOf('#') < 0) return; (rg[k] = rg[k] || []).push(x); });
        Object.keys(rg).sort().forEach(function (k) {
            var g = rg[k]; if (g.length < 2) return;
            var rx = RUN_SYS[g[0].kind], sys = rx ? _arr(_g('systemsData')).find(function (s) { return rx.test(s.name || ''); }) : null, w = sys ? worstOf([sys.id]) : null; if (!w || sevRank(w.severity) < 2) return;
            out.push({ key: 'r:' + g.map(function (x) { return x.run; }).join('|'), names: g.map(function (x) { return (g[0].kind === 'wire' ? 'harness ' : g[0].kind + ' line ') + x.run; }), members: g.map(function (x) { return r.runParts[x.run] || [x.pid]; }), worst: w });
        });
        return out;
    }
    var _sweeps = {};
    function _rotorCalc(r) {
        var P = root.SLPraModels, ready = !!P && r.discs.length > 0 && r.discs.every(rotorReady);
        r.inputsReady = ready; r.calc = { ready: ready, groups: {}, rotors: [] };
        if (!ready || !r.groups.length) return;
        var only = {}; r.groups.forEach(function (g) { g.members.forEach(function (m) { m.forEach(function (pid) { only[String(pid)] = 1; }); }); });
        var models = r.frags.map(function (f) { return f.id; });
        var crit = {}; r.frags.forEach(function (f) { crit[f.id] = f.criterion ? 1 / Number(f.criterion.split(' in ')[1]) : null; });
        r.discs.forEach(function (d) {
            var id = rotorId(d), rec = P.rotor(id), k = JSON.stringify([id, rec.center, rec.axis, rec.discRadius, rec.bladeLength, rec.fragmentAxialWidthMm, rec.rotation, models, Object.keys(only).sort()]);
            var sw = _sweeps[k] || (_sweeps[k] = P.sweep(id, { models: models, only: only }));
            r.calc.rotors.push({ id: id, label: rec.label, ok: !!(sw && sw.ok), err: sw && sw.err });
            if (!sw || !sw.ok) return;
            sw.models.forEach(function (m) {
                r.groups.forEach(function (g) {
                    var deg = 0;
                    (m.intervals || []).forEach(function (iv) { var set = {}; (iv.pids || []).forEach(function (p) { set[String(p)] = 1; }); if (g.members.every(function (mem) { return mem.some(function (p) { return set[String(p)]; }); })) deg += iv.width; });
                    var G = r.calc.groups[g.key] || (r.calc.groups[g.key] = { names: g.names, worst: g.worst, models: {} });
                    var cur = G.models[m.model], share = deg / 360;
                    if (!cur || share > cur.share) G.models[m.model] = { share: share, deg: deg, limit: crit[m.model], label: m.label, disc: rec.label };
                });
            });
        });
        Object.keys(r.calc.groups).forEach(function (k) {
            var G = r.calc.groups[k], fails = false, any = false, small = false;
            Object.keys(G.models).forEach(function (mk) { var x = G.models[mk]; if (x.share > 0) any = true; if (x.limit != null && x.share > x.limit + 1e-12) fails = true; if (x.limit == null && x.share > 0) small = true; });
            G.status = fails ? 'fails' : (small ? 'small' : (any ? 'meets' : 'clear'));
        });
    }
    function _pct(x) { return (Math.round(x * 1000) / 10).toFixed(1) + '%'; }
    function _calcWhy(c) {
        if (!c) return '';
        return 'The AC 20-128A calculation: ' + Object.keys(c.models).map(function (mk) { var x = c.models[mk]; return U().E(x.label) + ' ' + _pct(x.share) + ' of release angles reach them all' + (x.limit != null ? ' (limit ' + _pct(x.limit) + ', ' + (x.share > x.limit + 1e-12 ? '<b>over</b>' : 'within') + ')' : ' (no number in the AC: design precautions)'); }).join('; ') + '.';
    }
    function _calcLines(r) {
        if (!r.calc || !r.calc.ready) return [];
        return Object.keys(r.calc.groups).sort().map(function (k) { var c = r.calc.groups[k]; return { key: k, names: c.names, status: c.status, text: c.names.join(' + ') + ': ' + Object.keys(c.models).map(function (mk) { var x = c.models[mk]; return x.label + ' ' + _pct(x.share) + (x.limit != null ? ' (limit ' + _pct(x.limit) + ')' : ''); }).join('; ') + ' -> ' + ({ meets: 'within AC 20-128A', clear: 'no single fragment reaches them all', fails: 'over the AC 20-128A limit', small: 'small pieces only: design precautions' })[c.status] }; });
    }

    // ---- answers and status --------------------------------------------------------------------------------
    function answerOf(qid) { return _store().answers[qid] || null; }
    function optionOf(q) { var a = answerOf(q.id); if (!a) return null; return q.options.find(function (o) { return o.id === a.pick; }) || null; }
    function riskStatus(r) {
        if (r.kind === 'ROTOR' && !r.inputsReady) { var sg = _peekStore().signed[r.key] || null; return { questions: r.questions.length, answered: 0, open: 0, signed: sg, state: 'todo', inputs: true }; }
        var n = r.questions.length, answered = 0, open = 0;
        r.questions.forEach(function (q) { var o = optionOf(q); if (o) { answered++; if (o.status === 'open') open++; } });
        var signed = _store().signed[r.key] || null;
        return { questions: n, answered: answered, open: open, signed: signed, state: answered < n ? 'todo' : (open ? 'open' : (signed ? 'done' : 'ready')) };
    }
    function _find(qid) { var res = compute(); if (!res) return null; var hit = null; res.risks.some(function (r) { var q = r.questions.find(function (x) { return x.id === qid; }); if (q) hit = { r: r, q: q }; return !!q; }); return hit; }
    function answer(qid, pick) {
        var h = _find(qid); if (!h || !h.q.options.some(function (o) { return o.id === pick; })) return false;
        _store().answers[qid] = { pick: pick, by: U().who(), at: new Date().toISOString() };
        if (h.q.shared) { Object.keys(_store().signed).forEach(function (k) { if (/^rotor-/.test(k)) delete _store().signed[k]; }); if (qid === 'rotor:fragments') _cache = null; }
        else if (_store().signed[h.r.key]) delete _store().signed[h.r.key];
        materialize(h.r.praId); U().save();
        return true;
    }
    function sign(key) {
        var res = compute(); var r = res && res.byKey[key]; if (!r || riskStatus(r).state !== 'ready') return false;
        _store().signed[key] = { by: U().who(), at: new Date().toISOString() };
        materialize(r.praId); U().save();
        return true;
    }

    // ---- the PRA table: one row per PRA id, adopted --------------------------------------------------------
    function _rows() { return _g('praData'); }
    function _nextId() { try { if (typeof root.generateId === 'function') return root.generateId(); } catch (_) {} var mx = 0; _arr(_rows()).forEach(function (r) { mx = Math.max(mx, Number(r.internalId) || 0); }); return mx + 1; }
    function materialize(praId) {
        var res = compute(); var rows = _rows(); if (!res || !praId || !Array.isArray(rows)) return null;
        var risks = res.risks.filter(function (r) { return r.praId === praId; }); if (!risks.length) return null;
        var row = rows.find(function (r) { return r && r.praId === praId; });
        if (!row) { row = { internalId: _nextId(), praId: praId, threat: risks[0].title, origin: 'pra-autopilot' }; rows.push(row); }
        if (!row.praTyped && row.origin !== 'pra-autopilot') row.praTyped = { desc: row.desc || '', systems: row.systems || '', csfl: row.csfl || '', mitigation: row.mitigation || '', affectedZones: _arr(row.affectedZones).slice() };
        var sys = {}, zones = {}, mit = [], lines = [], worst = null, st = { open: 0, todo: 0, signed: 0 }, seenQ = {};
        risks.forEach(function (r) {
            r.systems.forEach(function (s) { sys[s] = 1; }); r.zones.forEach(function (z) { zones[z] = 1; });
            if (r.worst && (!worst || sevRank(r.worst.severity) > sevRank(worst.severity))) worst = r.worst;
            var rs = riskStatus(r); st.open += rs.open; if (rs.state === 'todo') st.todo++; if (rs.state === 'done') st.signed++;
            if (r.calc && r.calc.ready) (row.praCalc = row.praCalc || {})[r.key] = _calcLines(r).map(function (l) { return { lanes: l.names, status: l.status, text: l.text }; });
            lines.push(r.title + ': reaches ' + r.hits.length + ' units of ' + r.systems.length + ' systems' + (r.runs.length ? ' and ' + r.runs.length + ' harness, tube and duct runs' : ''));
            _calcLines(r).forEach(function (l) { lines.push('  AC 20-128A, ' + l.text); if (l.status === 'meets' || l.status === 'clear') { var m = 'Within AC 20-128A for ' + l.names.join(', ') + ' (' + r.title + ')'; if (mit.indexOf(m) < 0) mit.push(m); } });
            if (r.kind === 'ROTOR' && !r.inputsReady) lines.push('  The disc numbers are not in yet: the AC 20-128A calculation has not run.');
            r.questions.forEach(function (q) { var o = optionOf(q); if (seenQ[q.id]) return; seenQ[q.id] = 1; lines.push('  ' + q.text + (o ? ' -> ' + o.label : ' (not answered yet)')); if (o && o.mitigation && mit.indexOf(o.mitigation) < 0) mit.push(o.mitigation); });
        });
        row.systems = Object.keys(sys).sort().map(function (s) { return (_sys(s) || {}).name || s; }).join(', ') || row.systems;
        row.affectedZones = Object.keys(zones).sort();
        row.csfl = worst ? worst.fc + ' (' + worst.severity + ')' : (row.csfl || '');
        row.desc = lines.join('\n');
        row.mitigation = mit.join('; ');
        var seenF = {};
        row.praFindings = [].concat.apply([], risks.map(function (r) { return r.questions.filter(function (q) { if (seenF[q.id]) return false; seenF[q.id] = 1; return true; }).map(function (q) { var o = optionOf(q), a = answerOf(q.id); return { id: q.id, risk: r.title, text: q.text, pick: o ? o.label : null, status: o ? o.status : 'unanswered', by: a ? a.by : null, at: a ? a.at : null }; }); }));
        row.disposition = st.todo ? 'Open' : (st.open ? 'Open (design change)' : (st.signed === risks.length ? 'Closed' : 'Mitigated'));
        row.assessMethod = 'PRA Autopilot: worked out on the CAD model, choices by the engineer';
        return row;
    }

    // ---- the page ------------------------------------------------------------------------------------------
    var state = { risk: null, step: 0 };
    function _outline() { var Z = root.ZONES; return Z ? Z.all().filter(function (z) { return z && z.volume && z.volume.kind === 'box' && !z.parentId; }).map(function (z) { return { min: z.volume.min, max: z.volume.max }; }) : []; }
    function _host() { return typeof document !== 'undefined' ? document.getElementById('pra-auto-host') : null; }
    function render() {
        var h = _host(); if (!h || !U()) return;
        U().style();
        var res = compute();
        if (!res) { h.innerHTML = U().emptyCard('PRA Autopilot', 'The PRA Autopilot works the particular risks out on the CAD model.'); return; }
        var tot = { q: 0, a: 0, open: 0, done: 0 };
        res.risks.forEach(function (r) { var s = riskStatus(r); tot.q += s.questions; tot.a += s.answered; tot.open += s.open; if (s.state === 'done') tot.done++; });
        var items = res.risks.map(function (r) { var s = riskStatus(r); return { key: r.key, label: r.title, sub: r.hits.length + ' units reached, ' + (s.inputs ? 'the disc numbers come first' : (s.questions ? s.answered + ' of ' + s.questions + ' answered' : 'nothing to ask')) + (s.open ? ', ' + s.open + ' open' : '') + (s.state === 'done' ? ', signed' : ''), state: s.state === 'done' ? 'done' : (s.open ? 'open' : 'todo'), on: state.risk === r.key }; });
        var body = state.risk && res.byKey[state.risk] ? _riskHtml(res, res.byKey[state.risk]) : _overviewHtml(res, tot);
        h.innerHTML = '<div class="slap slap-card" data-pra-auto="1"><div class="slap-head"><span class="slap-title">PRA Autopilot</span><span class="slap-sub">' + res.risks.length + ' risks, ' + tot.q + ' questions, ' + tot.a + ' answered, ' + tot.open + ' open, ' + tot.done + ' signed</span>' + U().progress(tot.a, tot.q) +
            '<button type="button" class="slap-btn" onclick="SLPraAuto.ui.report()">Write the PRA report</button>' + U().importButtons(true) + '</div>' +
            '<div class="slap-grid"><div>' + U().rail(items, 'SLPraAuto.ui.risk') + '</div><div data-pra-auto-body="1">' + body + '</div></div></div>';
    }
    function _overviewHtml(res, tot) {
        var first = res.risks.find(function (r) { return riskStatus(r).state !== 'done'; });
        return '<div class="slap-q">The tool has worked out what each particular risk can reach on the CAD model.</div>' +
            '<div class="slap-why">For every risk it found the parts in the danger area and what losing them would cause, and kept only the choices an engineer has to make: ' + tot.q + ' questions across ' + res.risks.length + ' risks.</div>' +
            U().picture({ outline: _outline(), volumes: [].concat.apply([], res.risks.map(function (r) { return r.shapes; })) }, { legend: [['rgba(220,38,38,.35)', 'danger areas']] }) +
            '<div class="slap-nav">' + (first ? '<button type="button" class="slap-btn p" onclick="SLPraAuto.ui.risk(' + U().E(JSON.stringify(first.key)) + ')">Start with ' + U().E(first.title) + '</button>' : '<span class="slap-pill ok">Every risk is signed</span>') + '</div>';
    }
    function _riskHtml(res, r) {
        var st = riskStatus(r), n = r.questions.length, step = Math.max(0, Math.min(state.step, n + 1));
        var head = '<div class="slap-head"><button type="button" class="slap-btn" onclick="SLPraAuto.ui.risk(null)">All risks</button><b>' + U().E(r.title) + '</b>' +
            U().pill(st.state === 'done' ? 'ok' : (st.open ? 'open' : (st.state === 'ready' ? 'info' : 'todo')), st.state === 'done' ? 'Signed' : (st.open ? st.open + ' open' : (st.state === 'ready' ? 'Ready to sign' : st.answered + ' of ' + n + ' answered'))) +
            '<span class="slap-sub">Step ' + (step + 1) + ' of ' + (n + 2) + '</span>' + (r.praId ? '<span class="slap-sub">' + U().E(r.praId) + '</span>' : '') + '</div>';
        var base = { outline: _outline(), volumes: r.shapes };
        if (r.kind === 'ROTOR' && (!r.inputsReady || state.editInputs === r.key)) return head + _inputsHtml(r);
        if (step === 0) {
            var bySys = {}; r.hits.forEach(function (u) { var k = u.sysName || 'Not in this project'; (bySys[k] = bySys[k] || []).push(u); });
            return head + '<div class="slap-q">What could happen</div><div class="slap-why">' + U().E(r.what) + ' On the CAD model it reaches ' + r.hits.length + ' units of ' + r.systems.length + ' systems' + (r.runs.length ? ' and ' + r.runs.length + ' harness, tube and duct runs' : '') + '. ' + (r.worst ? 'The worst it can cause: <b>' + U().E(r.worst.fc) + '</b> (' + U().E(r.worst.severity) + ').' : '') + '</div>' +
                U().picture(Object.assign({}, base, { marks: r.hits.map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: '#2563EB', label: label(u) }; }) }), { legend: [['rgba(220,38,38,.35)', 'danger area'], ['#2563EB', 'units it reaches']] }) +
                '<table class="slap-tbl"><tr><th>System</th><th>Units reached</th></tr>' + Object.keys(bySys).sort().map(function (k) { return '<tr><td>' + U().E(k) + '</td><td>' + bySys[k].map(function (u) { return U().E(label(u)); }).join(', ') + '</td></tr>'; }).join('') + '</table>' +
                (r.kind === 'ROTOR' ? _resultsHtml(r) : '') +
                '<div class="slap-nav"><button type="button" class="slap-btn p" onclick="SLPraAuto.ui.step(1)">' + (n ? 'Next: ' + n + ' question' + (n === 1 ? '' : 's') : 'Next') + '</button></div>';
        }
        if (step <= n) {
            var q = r.questions[step - 1], o = optionOf(q);
            return head + U().picture(Object.assign({}, base, { marks: q.marks || [] }), { legend: q.legend || [['rgba(220,38,38,.35)', 'danger area']] }) + U().question({ id: q.id, text: q.text, why: q.why, options: q.options, picked: o ? o.id : null }, 'SLPraAuto.ui.pick') +
                (q.shared ? '<div class="slap-note">This answer counts for every engine that reaches them.</div>' : '') +
                (answerOf(q.id) ? '<div class="slap-note">Answered by ' + U().E(answerOf(q.id).by) + ' on ' + U().E(String(answerOf(q.id).at).slice(0, 10)) + '.</div>' : '') +
                '<div class="slap-nav"><button type="button" class="slap-btn" onclick="SLPraAuto.ui.step(' + (step - 1) + ')">Back</button><button type="button" class="slap-btn p" ' + (o ? '' : 'disabled') + ' onclick="SLPraAuto.ui.step(' + (step + 1) + ')">Next</button></div>';
        }
        return head + '<div class="slap-q">' + U().E(r.title) + ': the result</div>' +
            '<table class="slap-tbl"><tr><th>Question</th><th>Answer</th><th>Status</th></tr>' + (r.questions.map(function (q) { var o = optionOf(q); return '<tr><td>' + U().E(q.text) + '</td><td>' + (o ? U().E(o.label) : '<i>not answered</i>') + '</td><td>' + U().pill(!o ? 'todo' : (o.status === 'open' ? 'open' : 'ok'), !o ? 'To answer' : (o.status === 'open' ? 'Open' : (o.status === 'mitigated' ? 'Mitigated' : 'Accepted'))) + '</td></tr>'; }).join('') || '<tr><td colspan="3">Nothing to ask for this risk.</td></tr>') + '</table>' +
            '<div class="slap-why">' + (st.state === 'todo' ? 'Answer every question to sign this risk.' : (st.open ? 'Open design changes stay in the PRA table. The risk can be signed once they are closed.' : (st.signed ? 'Signed by ' + U().E(st.signed.by) + ' on ' + U().E(String(st.signed.at).slice(0, 10)) + '. Changing an answer reopens it.' : 'Everything is protected or accepted. Sign the risk to close it.'))) + '</div>' +
            '<div class="slap-nav"><button type="button" class="slap-btn" onclick="SLPraAuto.ui.step(' + n + ')">Back</button>' + (st.state === 'ready' ? '<button type="button" class="slap-btn p" onclick="SLPraAuto.ui.sign(' + U().E(JSON.stringify(r.key)) + ')">Sign this risk</button>' : '') + '<button type="button" class="slap-btn" onclick="SLPraAuto.ui.next()">Next risk</button></div>';
    }
    // the rotor numbers, on one screen: what the CAD model gives (to confirm or correct) and what only the engineer has
    function _inputsHtml(r) {
        var E = U().E, demoNote = false, alt = !!(_peekStore().settings || {}).alternate;
        var field = function (i, f, lab, val, hint, wide) { return '<label style="display:block;margin:6px 0;font-size:13px;"><span style="display:block;font-weight:600;">' + E(lab) + '</span><input data-pra-in="' + i + ':' + f + '" value="' + E(val == null ? '' : val) + '" style="width:' + (wide ? '110px' : '140px') + ';display:inline-block;margin:2px 6px 0 0;">' + (hint ? '<span class="slap-note">' + hint + '</span>' : '') + '</label>'; };
        var cards = r.discs.map(function (d, i) {
            var v = prefill(d); if (v.demo) demoNote = true;
            var axisTxt = d.axis[0] ? 'front to back' : (d.axis[1] ? 'side to side' : 'up and down');
            return '<div style="border:1px solid var(--color-border,#e3e5e8);border-radius:10px;padding:10px 14px;margin:8px 0;"><b>' + E(d.name) + (d.designator ? ' (' + E(d.designator) + ')' : '') + '</b> <span class="slap-note">spins ' + axisTxt + '</span>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;">' + field(i, 'cx', 'Where it is: x (mm)', v.center[0], '', true) + field(i, 'cy', 'y (mm)', v.center[1], '', true) + field(i, 'cz', 'z (mm)', v.center[2], 'from the CAD model', true) + '</div>' +
                field(i, 'dia', 'Disc diameter to the blade roots (mm)', v.diameter, 'from the CAD model: check it') +
                field(i, 'blade', 'Blade length (mm)', v.blade, 'from the CAD model: check it') +
                field(i, 'width', 'Fragment width: the disc rim thickness (mm)', v.width, 'from the CAD model: check it') +
                field(i, 'mass', 'Disc mass with its blades (kg)', v.mass, v.demo ? '<b>demo assumption</b>; for a real engine, the engine maker\'s data' : 'from the engine maker\'s data') +
                field(i, 'rpm', 'Highest speed, the redline (rpm)', v.rpm, v.demo ? '<b>demo assumption</b>; for a real engine, the engine maker\'s data' : 'from the engine maker\'s data') +
                '<label style="display:block;margin:6px 0;font-size:13px;"><span style="display:block;font-weight:600;">Spin direction</span><select data-pra-in="' + i + ':rot" style="width:auto;display:inline-block;"><option value="1"' + (v.rotation !== -1 ? ' selected' : '') + '>Clockwise, seen from the front of the engine</option><option value="-1"' + (v.rotation === -1 ? ' selected' : '') + '>Counterclockwise, seen from the front</option></select></label></div>';
        }).join('');
        var err = state.inputError && state.inputError.key === r.key ? '<div style="color:var(--color-danger,#b91c1c);font-weight:600;margin:6px 0;">' + E(state.inputError.text) + '</div>' : '';
        return '<div class="slap-q">The discs in engine ' + E(r.engine) + '</div>' +
            '<div class="slap-why">The AC 20-128A calculation needs each spinning disc\'s position, size, mass and top speed. The tool has filled in what the CAD model shows. Check those, add what only the engine maker knows, and the calculation runs.' + (demoNote ? ' In this demo the mass and speed are demo assumptions.' : '') + '</div>' +
            U().picture({ outline: _outline(), volumes: r.shapes, marks: r.discs.map(function (d) { var h = d.radius; return { min: [d.center[0] - d.thickness / 2, d.center[1] - h, d.center[2] - h], max: [d.center[0] + d.thickness / 2, d.center[1] + h, d.center[2] + h], color: '#DC2626', label: d.name }; }) }, { legend: [['#DC2626', 'the discs']] }) +
            cards +
            '<label style="display:block;margin:8px 0;font-size:13px;"><input type="checkbox" style="width:auto;" ' + (alt ? 'checked' : '') + ' onchange="SLPraAuto.ui.alternate(this.checked)"> Also check the alternative model for the big piece (one-third disc at +/-5 degrees, AC 20-128A para 9c). It counts for every engine.</label>' +
            err + '<div class="slap-nav"><button type="button" class="slap-btn p" data-pra-save="' + E(r.key) + '" onclick="SLPraAuto.ui.saveRotors(' + E(JSON.stringify(r.key)) + ')">Use these numbers and work it out</button>' + (r.inputsReady ? '<button type="button" class="slap-btn" onclick="SLPraAuto.ui.editInputs(null)">Cancel</button>' : '') + '</div>';
    }
    // what the calculation found, lane by lane
    function _resultsHtml(r) {
        var E = U().E, lines = _calcLines(r);
        if (!r.calc || !r.calc.ready) return '';
        var bad = r.calc.rotors.filter(function (x) { return !x.ok; });
        return '<div class="slap-q" style="font-size:16px;margin-top:12px;">The AC 20-128A calculation</div>' +
            (bad.length ? '<div style="color:var(--color-danger,#b91c1c);">Not worked out for ' + bad.map(function (x) { return E(x.label) + ': ' + E(x.err || ''); }).join('; ') + '</div>' : '') +
            (lines.length ? '<table class="slap-tbl"><tr><th>Lanes of one job</th><th>Share of release angles where one fragment reaches them all</th><th>Result</th></tr>' + lines.map(function (l) { var c = r.calc.groups[l.key]; return '<tr><td>' + E(c.names.join(', ')) + '</td><td>' + Object.keys(c.models).map(function (mk) { var x = c.models[mk]; return E(x.label) + ': <b>' + _pct(x.share) + '</b>' + (x.limit != null ? ' (limit ' + _pct(x.limit) + ')' : ' (no number in the AC)'); }).join('<br>') + '</td><td>' + U().pill(l.status === 'fails' ? 'open' : (l.status === 'small' ? 'info' : 'ok'), ({ meets: 'Within the limit', clear: 'Never together', fails: 'Over the limit: asked next', small: 'Small pieces: asked next' })[l.status]) + '</td></tr>'; }).join('') + '</table>' : '<div class="slap-note">No two lanes of the same job are in reach of this engine.</div>') +
            '<div class="slap-note">Worked out with the AC 20-128A angle sweep for ' + r.calc.rotors.map(function (x) { return E(x.label); }).join(' and ') + ' (the worst disc counts); no credit is taken for a fragment passing above or below a part within its spread.</div>' +
            '<div class="slap-nav" style="margin-top:6px;"><button type="button" class="slap-btn" onclick="SLPraAuto.ui.editInputs(' + E(JSON.stringify(r.key)) + ')">Change the disc numbers</button></div>';
    }
    // 6 Nov 2026 (report_ai.js rebuild): each particular risk's picture as a figure for the PRA report, {{figure:pra_risks}}
    function figures() {
        var res = compute(); if (!res) return [];
        return res.risks.map(function (r) {
            var f = U().figure({ outline: _outline(), volumes: r.shapes, marks: r.hits.map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: '#2563EB' }; }) }, { width: 460 });
            if (!f) return null; var svg = f.svg, w = f.w, h = f.h;
            return { title: r.title, caption: r.title + (r.praId ? ' (' + r.praId + ')' : '') + ': the danger areas (red) and the ' + r.hits.length + ' units they reach (blue), from the CAD model', svg: svg, w: w, h: h };
        }).filter(Boolean);
    }
    function report() {
        var res = compute(); if (!res) return false;
        var E = U().E, html = '<h1>Particular Risk Assessment</h1><p class="muted">' + E(_g('projectName') || '') + '. Worked out by the PRA Autopilot on the CAD model ' + E((C().model(res.cadId) || {}).fileName || '') + '; every choice made by an engineer, with who and when. ' + new Date().toISOString().slice(0, 10) + '.</p>';
        html += '<table><tr><th>Risk</th><th>PRA</th><th>Units reached</th><th>Worst it can cause</th><th>Open</th><th>Signed</th></tr>' + res.risks.map(function (r) { var s = riskStatus(r); return '<tr><td>' + E(r.title) + '</td><td>' + E(r.praId || '') + '</td><td>' + r.hits.length + '</td><td>' + E(r.worst ? r.worst.fc + ' (' + r.worst.severity + ')' : '-') + '</td><td class="' + (s.open ? 'open' : 'ok') + '">' + s.open + '</td><td>' + (s.signed ? E(s.signed.by + ', ' + String(s.signed.at).slice(0, 10)) : '-') + '</td></tr>'; }).join('') + '</table>';
        res.risks.forEach(function (r) {
            html += '<h2>' + E(r.title) + (r.praId ? ' (' + E(r.praId) + ')' : '') + '</h2><p>' + E(r.what) + '</p>' + U().picture({ outline: _outline(), volumes: r.shapes, marks: r.hits.map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: '#2563EB' }; }) }, { width: 460 }) +
                '<p>Reaches ' + r.hits.length + ' units of: ' + E(r.systems.map(function (s) { return (_sys(s) || {}).name || s; }).join(', ') || 'no system in this project') + '. Zones: ' + E(r.zones.join(', ') || '-') + '.</p>';
            if (r.kind === 'ROTOR') { var cl = _calcLines(r); html += r.calc && r.calc.ready ? ('<p><b>AC 20-128A calculation</b> (' + E(r.calc.rotors.map(function (x) { return x.label; }).join(', ')) + '; the worst disc counts):</p>' + (cl.length ? '<table><tr><th>Lanes of one job</th><th>Result</th></tr>' + cl.map(function (l) { return '<tr><td>' + E(l.names.join(', ')) + '</td><td class="' + (l.status === 'fails' || l.status === 'small' ? 'open' : 'ok') + '">' + E(l.text.split(': ').slice(1).join(': ')) + '</td></tr>'; }).join('') + '</table>' : '<p class="muted">No two lanes of the same job in reach.</p>')) : '<p class="open">The disc numbers are not in yet: the AC 20-128A calculation has not run.</p>'; }
            if (r.questions.length) html += '<table><tr><th>Question</th><th>Answer</th><th>Mitigation or reason</th><th>Status</th><th>By</th></tr>' + r.questions.map(function (q) { var o = optionOf(q), a = answerOf(q.id); return '<tr><td>' + E(q.text) + '</td><td>' + (o ? E(o.label) : '<i>not answered</i>') + '</td><td>' + E(o ? o.mitigation : '') + '</td><td class="' + (o && o.status !== 'open' ? 'ok' : 'open') + '">' + E(o ? o.status : 'unanswered') + '</td><td>' + E(a ? a.by + ', ' + String(a.at).slice(0, 10) : '') + '</td></tr>'; }).join('') + '</table>';
        });
        return U().openReport('Particular Risk Assessment', html);
    }
    var ui = {
        risk: function (key) { state.risk = key || null; state.step = 0; render(); },
        step: function (n) { state.step = n; render(); },
        pick: function (qid, opt) { answer(qid, opt); render(); },
        sign: function (key) { sign(key); render(); },
        next: function () { var res = compute(); if (!res) return; var i = res.risks.findIndex(function (r) { return r.key === state.risk; }); var nx = res.risks.slice(i + 1).concat(res.risks.slice(0, i + 1)).find(function (r) { return riskStatus(r).state !== 'done'; }); ui.risk(nx ? nx.key : null); },
        report: report,
        editInputs: function (key) { state.editInputs = key; render(); },
        alternate: function (on) { _store().settings.alternate = !!on; _cache = null; U().save(); render(); },
        saveRotors: function (key) {
            var res = compute(); var r = res && res.byKey[key]; if (!r) return false;
            var by = U().who(), err = null;
            r.discs.forEach(function (d, i) {
                if (err) return;
                var q = function (f) { var el = document.querySelector('[data-pra-in="' + i + ':' + f + '"]'); return el ? el.value : ''; };
                var v = { center: [q('cx'), q('cy'), q('cz')], axis: d.axis, diameter: q('dia'), blade: q('blade'), width: q('width'), mass: q('mass'), rpm: q('rpm'), rotation: q('rot') === '-1' ? -1 : 1, engine: r.engine };
                var out = saveRotor(d, v, by); if (!out.ok) err = d.name + ': ' + out.err;
            });
            if (err) { state.inputError = { key: key, text: err }; render(); return false; }
            state.inputError = null; state.editInputs = null; _cache = null;
            U().save(); materialize(r.praId); state.step = 0; render();
            return true;
        }
    };
    function mount() {
        if (typeof document === 'undefined') return false;
        var v = document.getElementById('view-pra'); if (!v) return false;
        var host = document.getElementById('pra-auto-host');
        if (!host) { host = document.createElement('div'); host.id = 'pra-auto-host'; var head = v.querySelector('.header-with-export'); if (head && head.nextSibling) v.insertBefore(host, head.nextSibling); else v.insertBefore(host, v.firstChild); }
        if (!v._praAutoObs && typeof MutationObserver === 'function') {
            var shown = v.style.display !== 'none';
            v._praAutoObs = new MutationObserver(function () { var now = v.style.display !== 'none'; if (now && !shown) { _cache = null; try { render(); } catch (e) { try { console.warn('[pra-autopilot]', e); } catch (_) {} } } shown = now; });
            v._praAutoObs.observe(v, { attributes: true, attributeFilter: ['style', 'class'] });
            if (shown) { try { render(); } catch (_) {} }
        }
        return true;
    }
    if (typeof document !== 'undefined') { var tries = 40, t = setInterval(function () { if (mount() || --tries <= 0) clearInterval(t); }, 250); }
    root.SLPraAuto = { VERSION: VERSION, FRAG: FRAG, compute: function () { return compute(); }, riskStatus: riskStatus, answer: answer, sign: sign, materialize: materialize, report: report, figures: figures, render: render, ui: ui, state: state, reset: function () { _cache = null; } };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLPraAuto;
})(typeof window !== 'undefined' ? window : globalThis);

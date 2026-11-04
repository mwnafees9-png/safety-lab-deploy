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
    function _store() { var pc = _pc(); var s = pc.praAuto; if (!s || typeof s !== 'object') s = pc.praAuto = { v: 1, answers: {}, signed: {} }; s.answers = s.answers || {}; s.signed = s.signed || {}; return s; }
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
        var key = cadId + '|' + parts.length + '|' + JSON.stringify((_store().answers || {})['rotor:fragments'] || null) + '|' + (CZ.riskVolumes() || []).length;
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
        var pick = (_store().answers['rotor:fragments'] || {}).pick || 'ac';
        var frags = FRAG.filter(function (f) { return !f.optional || pick === 'ac+alt'; });
        var rotors = parts.filter(function (p) { return /\b(fan|turbine|compressor)\b.*\b(disc|disk|rotor)\b|\b(rotor|disc)\b.*\b(fan|turbine)\b/i.test(p.name || '') && p.bbox; });
        var byEngine = {};
        rotors.forEach(function (p) { var n = /ENG-(\d+)/.exec(p.designator || '') || /engine (\d+)/i.exec(p.name || ''); var e = n ? n[1] : '?'; (byEngine[e] = byEngine[e] || []).push(p); });
        Object.keys(byEngine).sort().forEach(function (e) {
            var discs = byEngine[e].map(function (p) {
                var ext = [0, 1, 2].map(function (i) { return p.bbox.max[i] - p.bbox.min[i]; }), ax = ext.indexOf(Math.min.apply(null, ext)), axis = [0, 0, 0]; axis[ax] = 1;
                return { pid: p.pid, name: p.name, center: _center(p.bbox), axis: axis, radius: Math.max.apply(null, ext.filter(function (_, i) { return i !== ax; })) / 2 };
            });
            var reach = function (u, spread) {
                return discs.some(function (d) { return _samples(u.bbox).some(function (q) { var w = _sub(q, d.center), L = _len(w); if (L < 1 || L > RANGE) return false; var el = Math.asin(Math.min(1, Math.abs(_dot(w, d.axis)) / L)) / D2R; return el <= spread; }); });
            };
            var maxSpread = Math.max.apply(null, frags.map(function (f) { return _spreadOf(f.id); }));
            var shapes = discs.map(function (d) { return { kind: 'sector', center: d.center, range: RANGE * 0.5, spreadDeg: maxSpread }; });
            risks.push(_risk({ key: 'rotor-' + e, praId: 'PRA-001', kind: 'ROTOR', title: 'Engine ' + e + ' rotor burst', short: 'Engine ' + e,
                what: 'A spinning disc in engine ' + e + ' breaks and pieces fly out sideways, in a thin band around the engine.',
                shapes: shapes, frags: frags, units: units, runs: runs, reachFor: function (u) { var hit = null; frags.forEach(function (f) { if (!hit && reach(u, _spreadOf(f.id))) hit = f; }); return hit; }, zoneOf: zoneOf, topCode: topCode }));
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
        var sysSet = {}; hits.forEach(function (u) { if (u.sysId) sysSet[u.sysId] = 1; });
        var zones = {}; hits.forEach(function (u) { var z = o.zoneOf[u.pid]; var c = z ? o.topCode(z) : null; if (c) zones[c] = 1; });
        var r = { key: o.key, praId: o.praId, kind: o.kind, title: o.title, short: o.short, what: o.what, shapes: o.shapes, frags: o.frags || null, hits: hits, runs: Object.keys(runHits).sort(), runHits: runList, systems: Object.keys(sysSet).sort(), zones: Object.keys(zones).sort(), questions: [] };
        r.worst = worstOf(r.systems);
        _questions(r);
        _routeLanes(r, r.questions);
        return r;
    }
    function _questions(r) {
        var Q = r.questions;
        if (r.kind === 'ROTOR' && r.key === _firstRotorKey(r)) {
            // which fragments: one answer for every engine
            Q.push({ id: 'rotor:fragments', rule: 'FRAGMENTS', shared: true,
                text: 'Which pieces of a burst disc do we plan for?',
                why: 'AC 20-128A asks for three kinds of fragment, each flying out in a band around the disc: the bigger the piece, the thinner the band. The alternative model widens the band for the big piece.',
                options: [
                    { id: 'ac', label: 'The three AC 20-128A fragments (one-third disc +/-3 degrees, intermediate +/-5, small +/-15)', status: 'accepted', mitigation: 'Fragments per AC 20-128A para 9a, 9b and 9d', impact: 'The standard set. Every engine is checked with these three bands.' },
                    { id: 'ac+alt', label: 'Those three and the alternative one-third disc model (+/-5 degrees)', status: 'accepted', mitigation: 'Fragments per AC 20-128A para 9a, 9b, 9c and 9d', impact: 'Adds the wider band for the big piece (para 9c). The hit lists for every engine are worked out again with it.' }
                ] });
        }
        // lanes of the same job reached by the same event
        var lanes = {};
        r.hits.filter(function (u) { return u.sysId; }).forEach(function (u) { var k = ZA().laneKey(u.name) || u.name.toLowerCase(); (lanes[u.sysId + '|' + k] = lanes[u.sysId + '|' + k] || []).push(u); });
        Object.keys(lanes).sort().forEach(function (k) {
            var g = lanes[k].slice().sort(function (a, b) { return String(a.designator || a.name).localeCompare(String(b.designator || b.name), undefined, { numeric: true }); });
            if (g.length < 2) return;
            var w = worstOf([g[0].sysId]); if (!w || sevRank(w.severity) < 2) return;
            var names = g.map(label), all = g.length === 2 ? 'both ' + names.join(' and ') : 'all ' + g.length + ': ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
            var accept = r.kind === 'ROTOR' ? { id: 'chance', label: 'The chance is within AC 20-128A (' + (FRAG[0].criterion) + ' for the one-third disc)', status: 'accepted', mitigation: 'Accepted on the AC 20-128A Appendix 1 hazard ratio for ' + names.join(', ') + '; the angle sweep in the PRA panel (CAD page) is the evidence', impact: 'Accepts it on the numbers. The AC 20-128A angle sweep for this engine (PRA panel on the CAD page) is listed as the evidence it needs.' }
                : { id: 'qualified', label: 'They are built and tested to survive it', status: 'accepted', mitigation: names.join(', ') + ' qualified for this risk; accepted', impact: 'Accepts it. The qualification (test report) is listed as the evidence it needs.' };
            var colors = ['#2563EB', '#7C3AED', '#0D9488', '#DB2777'];
            Q.push({ id: (r.kind === 'ROTOR' ? 'rotor' : r.key) + ':lanes:' + _hash(g.map(function (u) { return u.pid; }).join('|')), rule: 'LANES', shared: r.kind === 'ROTOR',
                text: (r.kind === 'ROTOR' ? 'A burst in engine ' + r.key.split('-')[1] : 'One ' + r.short.toLowerCase()) + ' could reach ' + all + '. What protects them?',
                why: 'They do the same job (' + U().E(g[0].sysName) + '). Losing them: <b>' + U().E(w.fc) + '</b> (' + U().E(w.severity) + ').',
                marks: g.slice(0, 4).map(function (u, i) { return { min: u.bbox.min, max: u.bbox.max, color: colors[i], label: label(u) }; }),
                legend: g.slice(0, 4).map(function (u, i) { return [colors[i], label(u)]; }),
                options: [
                    { id: 'shield', label: 'A shield or structure stops it before it reaches them', status: 'mitigated', mitigation: 'Shield between the ' + r.short.toLowerCase() + ' and ' + names.join(', '), impact: 'Adds the shield as a mitigation. Its strength (energy it absorbs) is listed as needed evidence.' },
                    { id: 'move', label: 'One of them moves out of the way', status: 'open', mitigation: 'Design change: move ' + names[names.length - 1] + ' out of the ' + r.short.toLowerCase() + ' path', impact: 'Records a design change. This stays open in the PRA until the CAD model shows them apart.' },
                    accept
                ] });
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
            var names = g.map(function (x) { return (kind === 'wire' ? 'harness ' : kind + ' line ') + x.run; }), all = g.length === 2 ? 'both ' + names.join(' and ') : 'all ' + g.length + ': ' + names.join(', ');
            var colors = ['#2563EB', '#7C3AED', '#0D9488', '#DB2777'];
            Q.push({ id: (r.kind === 'ROTOR' ? 'rotor' : r.key) + ':runs:' + _hash(g.map(function (x) { return x.run; }).join('|')), rule: 'LINES', shared: r.kind === 'ROTOR',
                text: (r.kind === 'ROTOR' ? 'A burst in engine ' + r.key.split('-')[1] : 'One ' + r.short.toLowerCase()) + ' could cut ' + all + '. What protects them?',
                why: 'They carry the same thing on separate lanes (' + U().E(sys.name) + '). Losing them: <b>' + U().E(w.fc) + '</b> (' + U().E(w.severity) + ').',
                marks: g.slice(0, 4).map(function (x, i) { return { min: x.bbox.min, max: x.bbox.max, color: colors[i], label: names[i] }; }),
                legend: g.slice(0, 4).map(function (x, i) { return [colors[i], names[i]]; }),
                options: [
                    { id: 'shield', label: 'A shield or structure stops it before it reaches them', status: 'mitigated', mitigation: 'Shield between the ' + r.short.toLowerCase() + ' and ' + names.join(', '), impact: 'Adds the shield as a mitigation. Its strength is listed as needed evidence.' },
                    { id: 'move', label: 'One line is rerouted away from the other', status: 'open', mitigation: 'Design change: reroute ' + names[names.length - 1] + ' out of the ' + r.short.toLowerCase() + ' area', impact: 'Records a design change. This stays open in the PRA until the CAD model shows the new route.' },
                    { id: 'accept', label: 'Losing both lines is acceptable here', status: sevRank(w.severity) >= 3 ? 'open' : 'accepted', mitigation: 'Loss of ' + names.join(' and ') + ' accepted: ' + w.fc + ' (' + w.severity + ')', impact: sevRank(w.severity) >= 3 ? 'Losing them leads to ' + w.fc + ' (' + w.severity + '), so this cannot simply be accepted: it stays open for a common mode review (CMA).' : 'Accepts losing them.' }
                ] });
        });
    }
    var _rk = null;
    function _firstRotorKey() { return _rk; }

    // ---- answers and status --------------------------------------------------------------------------------
    function answerOf(qid) { return _store().answers[qid] || null; }
    function optionOf(q) { var a = answerOf(q.id); if (!a) return null; return q.options.find(function (o) { return o.id === a.pick; }) || null; }
    function riskStatus(r) {
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
            lines.push(r.title + ': reaches ' + r.hits.length + ' units of ' + r.systems.length + ' systems' + (r.runs.length ? ' and ' + r.runs.length + ' harness, tube and duct runs' : ''));
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
        var items = res.risks.map(function (r) { var s = riskStatus(r); return { key: r.key, label: r.title, sub: r.hits.length + ' units reached, ' + (s.questions ? s.answered + ' of ' + s.questions + ' answered' : 'nothing to ask') + (s.open ? ', ' + s.open + ' open' : '') + (s.state === 'done' ? ', signed' : ''), state: s.state === 'done' ? 'done' : (s.open ? 'open' : 'todo'), on: state.risk === r.key }; });
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
        if (step === 0) {
            var bySys = {}; r.hits.forEach(function (u) { var k = u.sysName || 'Not in this project'; (bySys[k] = bySys[k] || []).push(u); });
            return head + '<div class="slap-q">What could happen</div><div class="slap-why">' + U().E(r.what) + ' On the CAD model it reaches ' + r.hits.length + ' units of ' + r.systems.length + ' systems' + (r.runs.length ? ' and ' + r.runs.length + ' harness, tube and duct runs' : '') + '. ' + (r.worst ? 'The worst it can cause: <b>' + U().E(r.worst.fc) + '</b> (' + U().E(r.worst.severity) + ').' : '') + '</div>' +
                U().picture(Object.assign({}, base, { marks: r.hits.map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: '#2563EB', label: label(u) }; }) }), { legend: [['rgba(220,38,38,.35)', 'danger area'], ['#2563EB', 'units it reaches']] }) +
                '<table class="slap-tbl"><tr><th>System</th><th>Units reached</th></tr>' + Object.keys(bySys).sort().map(function (k) { return '<tr><td>' + U().E(k) + '</td><td>' + bySys[k].map(function (u) { return U().E(label(u)); }).join(', ') + '</td></tr>'; }).join('') + '</table>' +
                (r.kind === 'ROTOR' ? '<div class="slap-note">The full AC 20-128A angle sweep with the hazard ratio for each fragment is in the PRA panel on the CAD page.</div>' : '') +
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
    function report() {
        var res = compute(); if (!res) return false;
        var E = U().E, html = '<h1>Particular Risk Assessment</h1><p class="muted">' + E(_g('projectName') || '') + '. Worked out by the PRA Autopilot on the CAD model ' + E((C().model(res.cadId) || {}).fileName || '') + '; every choice made by an engineer, with who and when. ' + new Date().toISOString().slice(0, 10) + '.</p>';
        html += '<table><tr><th>Risk</th><th>PRA</th><th>Units reached</th><th>Worst it can cause</th><th>Open</th><th>Signed</th></tr>' + res.risks.map(function (r) { var s = riskStatus(r); return '<tr><td>' + E(r.title) + '</td><td>' + E(r.praId || '') + '</td><td>' + r.hits.length + '</td><td>' + E(r.worst ? r.worst.fc + ' (' + r.worst.severity + ')' : '-') + '</td><td class="' + (s.open ? 'open' : 'ok') + '">' + s.open + '</td><td>' + (s.signed ? E(s.signed.by + ', ' + String(s.signed.at).slice(0, 10)) : '-') + '</td></tr>'; }).join('') + '</table>';
        res.risks.forEach(function (r) {
            html += '<h2>' + E(r.title) + (r.praId ? ' (' + E(r.praId) + ')' : '') + '</h2><p>' + E(r.what) + '</p>' + U().picture({ outline: _outline(), volumes: r.shapes, marks: r.hits.map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: '#2563EB' }; }) }, { width: 460 }) +
                '<p>Reaches ' + r.hits.length + ' units of: ' + E(r.systems.map(function (s) { return (_sys(s) || {}).name || s; }).join(', ') || 'no system in this project') + '. Zones: ' + E(r.zones.join(', ') || '-') + '.</p>';
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
        report: report
    };
    // the first engine carries the fragments question (computed before the risks are built)
    var _compute0 = compute;
    compute = function () {
        var CZ = C(); var cadId = CZ && CZ.latestCadId && CZ.latestCadId(); var m = cadId && CZ.model(cadId);
        if (m) { var ps = (CZ.partsOf ? CZ.partsOf(cadId) : m.parts) || []; var e = null; ps.forEach(function (p) { if (/\b(fan|turbine)\b.*\b(disc|disk|rotor)\b/i.test(p.name || '')) { var n = /ENG-(\d+)/.exec(p.designator || '') || /engine (\d+)/i.exec(p.name || ''); var k = n ? n[1] : '?'; if (e === null || k < e) e = k; } }); _rk = e != null ? 'rotor-' + e : null; }
        return _compute0();
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
    root.SLPraAuto = { VERSION: VERSION, FRAG: FRAG, compute: function () { return compute(); }, riskStatus: riskStatus, answer: answer, sign: sign, materialize: materialize, report: report, render: render, ui: ui, state: state, reset: function () { _cache = null; } };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLPraAuto;
})(typeof window !== 'undefined' ? window : globalThis);

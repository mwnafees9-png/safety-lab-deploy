// pra_autopilot.js (SLPraAuto v2.7, 9 Nov 2026; v2.6 v2.5 v2.4 v2.3 9 Nov 2026; v2.2 9 Nov 2026; v2.1 8 Nov 2026): the PRA page.
// v2.3, Waqas, 9 Nov 2026: "I want the PRA reports to explain their methods their basis, the math, where we have multiple
// impact zones, we should have 1 image per cone like in the rotor burst PRA 1 per engine and the cones be different distinct
// colors, show the calculations, tell the whole story please"; "yeah needs to look clean and legible". Each risk the CAD model
// works out has danger sources (r.sources: each engine, each bogie's volume, each fire volume, each group of forward-facing
// surfaces, each group of lightning attachment points), each with the parts it reaches by the risk's own reach test. Each
// report section reads: the risk and its question; method; basis (rule, paragraph, pass criterion, in our words);
// calculations per source (rotor burst: the disc numbers, the bands, the units inside them, the hazard ratio of every set of
// lanes against its limit from the PRA panel's sweep, one worked example); the results; the choices; retention; the
// conclusion. One 3D picture per source sits in its calculations (SLCadShots per-source views, pre-ticked).
// The PRA Autopilot asks on the left; the PRA report builds
// on the right, one section per particular risk (cca_report.js, the shared frame of the PRA, ZSA and CMA Autopilots).
//
// v2.1, Waqas, 8 Nov 2026, confirmed: "I want all PRAs on their individual tab with their auto pilot and report preview".
// The page is on the frame's tabs (cca_report.js v1.2, spec.tabs): "All risks" first (the whole PRA document, Word and
// Print; on the left the Autopilot's overview of every risk, the outputs to accept and document control), then one tab
// per particular risk in PRA ID order, labeled with its ID and short name. A risk's tab holds only its Autopilot questions
// (every risk the CAD model works out under that PRA ID: the four engines of the rotor burst share PRA-001) and only its
// section of the report, with "Export this risk to Word". Opening a risk on the left, Start, Next risk, Add and the ZSA's
// "Open PRA-xxx in the PRA report" all open the risk's tab.
//
// v2.0, Waqas, 8 Nov 2026: "I want the PRA table gone, and each PRA presented in a report format listing out all the
// stuff that is impacted, all equipment in the zone, all functions that equipment performs"; "PRA build and ZSA similar
// to the planing autopilot, ability to see the reports etc."; the table goes, with an inline Edit per section and "Add a
// particular risk" so no data entry is lost. Each section: (1) the risk, its source, the standard it is assessed against
// and its mitigation; (2) the zones it reaches, by name; (3) the equipment housed in them and routed through them, by
// system; (4) the functions that equipment performs, with the owning system; (5) what is lost: systems directly and as a
// knock-on, failure conditions with their names and severity, the MAC rules that break; (6) the choice made for each set
// of lanes one event reaches together; (7) retention: each catastrophic outcome and its disposition, in plain words;
// (8) Simulate. What is lost is computed by praDynamicModel (cca_models.js), whose panel no longer shows on the page.
// praData keeps every field other code reads; Edit and Add write it without duplicates (one row per PRA id and per
// threat). An Edit on a row the Autopilot writes is kept in row.praOwn and merged into every later write.
//
// v1 (4 Nov 2026), kept: Waqas: "Put PRAs in the PRA ... make the inputs more intuitive"; "think about it similarly to
// how we built the planning auto pilot"; "so intuitive my 10 year old daughter should be able to do it". Same pattern as the ZSA Autopilot
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
    var VERSION = '2.7';   // 2.7 9 Nov 2026: the loss figure drawn with squared connectors in their own lanes (SLCcaReport.flow);   // 2.6 9 Nov 2026: proposed mitigations, path to compliance and conclusion are the engineer's (written or AI drafted and accepted); the tool's part is the summary of results;   // 2.5 9 Nov 2026: the burst bands table names each kind of piece's color in the pictures;   // 2.4 9 Nov 2026: every particular risk its own report, picked from a dropdown, with a register;   // 2.3 9 Nov 2026: each section tells the whole story (method, basis, calculations per danger source, one 3D picture per source); 2.2: 3D model pictures per risk
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
            var rotorReach = function (u) { var hit = null; frags.forEach(function (f) { if (!hit && reach(u, _spreadOf(f.id))) hit = f; }); return hit; };
            // v2.3: one danger source per engine (its discs' burst bands together): one picture and one set of calculations each
            risks.push(_risk({ key: 'rotor-' + e, praId: 'PRA-001', kind: 'ROTOR', title: 'Engine ' + e + ' rotor burst', short: 'Engine ' + e,
                what: 'A spinning disc in engine ' + e + ' breaks and pieces fly out sideways, in a thin band around the engine.',
                shapes: shapes, frags: frags, discs: discs, engine: e, units: units, runs: runs, reachFor: rotorReach, zoneOf: zoneOf, topCode: topCode,
                sources: [{ id: 'engine', label: 'Engine ' + e, shapes: shapes, test: function (u) { return !!rotorReach(u); } }] }));
        });
        // TIRE, FIRE: the risk volumes on the CAD page, grouped by kind and PRA row
        var vols = CZ.riskVolumes() || [];
        var groups = {};
        vols.filter(function (v) { return v.kind !== 'rotorBurst'; }).forEach(function (v) { var k = v.kind + '|' + (v.praId || ''); (groups[k] = groups[k] || []).push(v); });
        Object.keys(groups).sort().forEach(function (k) {
            var vs = groups[k], v0 = vs[0];
            var title = v0.kind === 'tireBurst' ? 'Tire burst' : (vs.length === 1 ? v0.label : v0.label.replace(/,.*$/, ''));
            // v2.3: each volume is its own danger source (one per bogie for the tire burst), with the same reach test as before
            var srcs = vs.map(function (v) { return { id: String(v.id || _hash(JSON.stringify(v.shape))), label: _srcLabel(v.label, title), shapes: [_plainShape(v.shape)].filter(Boolean), volume: v.shape, test: function (u) { return !!_volPoint(v.shape, u); } }; });
            risks.push(_risk({ key: 'vol-' + _hash(k), praId: v0.praId || null, kind: v0.kind === 'tireBurst' ? 'TIRE' : 'FIRE', title: title, short: title,
                what: v0.kind === 'tireBurst' ? 'A tire bursts on the ground or as the gear retracts, and tread and pieces fly around the wheel well.' : 'A fire starts here: ' + vs.map(function (v) { return v.label; }).join('; ') + '.',
                shapes: vs.map(function (v) { return _plainShape(v.shape); }).filter(Boolean),
                units: units, runs: runs, reachFor: function (u) { return srcs.some(function (s) { return s.test(u); }) ? { id: 'volume' } : null; }, zoneOf: zoneOf, topCode: topCode, sources: srcs }));
        });
        // BIRD: right behind the forward-facing surfaces
        var Zall = Z ? Z.all().filter(function (z) { return z && z.volume && z.volume.kind === 'box'; }) : [];
        var front = Zall.filter(function (z) { return /NOSE|NAC|WING|EMP|FDCK/.test(z.code || ''); }).map(function (z) { var b = { min: z.volume.min.slice(), max: z.volume.max.slice(), code: z.code, name: z.name || '', depth: /NOSE|FDCK/.test(z.code) ? 3000 : 1500 }; b.max[0] = Math.min(b.max[0], b.min[0] + b.depth); return b; });
        // v2.3: the surfaces in four groups, each its own danger source (one picture and one worked line each)
        var birdSrc = BIRD_GROUPS.map(function (g) { var bs = front.filter(function (b) { return BIRD_GROUPS.filter(function (x) { return x.rx.test(b.code); })[0] === g; }); return { id: g.id, label: g.label, boxes: bs, shapes: bs.map(function (b) { return { kind: 'box', min: b.min, max: b.max }; }), test: function (u) { return !!_boxOf(bs, _center(u.bbox)); } }; }).filter(function (g) { return g.boxes.length; });
        if (front.length) risks.push(_risk({ key: 'bird', praId: 'PRA-006', kind: 'BIRD', title: 'Bird strike', short: 'Bird strike',
            what: 'A bird hits the front of the aircraft: the nose, the wing and tail leading edges or an engine intake. Whatever sits right behind those surfaces can be hit.',
            shapes: front.map(function (b) { return { kind: 'box', min: b.min, max: b.max }; }), units: units, runs: runs,
            reachFor: function (u) { return _boxOf(front, _center(u.bbox)) ? { id: 'front' } : null; }, zoneOf: zoneOf, topCode: topCode, sources: birdSrc }));
        // LIGHT: close to the likely attachment points (lightning zones 1A and 1B: nose, wing tips, fin tips, nacelle fronts)
        var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        Zall.forEach(function (z) { for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], z.volume.min[i]); hi[i] = Math.max(hi[i], z.volume.max[i]); } });
        if (Zall.length) {
            // v2.3: the attachment points in four groups (nose, wing tips, tail, engine fronts), each its own danger source; a point
            // two zones give twice is kept once (the reach test is the same: a unit's center within the radius of a point)
            var lg = { nose: [[lo[0], 0, (lo[2] + hi[2]) / 2]], wingtips: [[(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2], [(lo[0] + hi[0]) / 2, hi[1], (lo[2] + hi[2]) / 2]], tail: [[hi[0], 0, hi[2]]], engines: [] };
            Zall.filter(function (z) { return /EMP/.test(z.code || ''); }).forEach(function (z) { lg.tail.push([z.volume.max[0], z.volume.min[1], z.volume.max[2]], [z.volume.max[0], z.volume.max[1], z.volume.max[2]]); });
            Zall.filter(function (z) { return /NAC/.test(z.code || ''); }).forEach(function (z) { lg.engines.push([z.volume.min[0], (z.volume.min[1] + z.volume.max[1]) / 2, (z.volume.min[2] + z.volume.max[2]) / 2]); });
            var seenP = {}, lsh = [], lightSrc = [];
            LIGHT_GROUPS.forEach(function (g) {
                var sh = []; lg[g.id].forEach(function (p) { var k = p.join(','); if (seenP[k]) return; seenP[k] = 1; sh.push({ kind: 'sphere', center: p, radius: 3000 }); });
                if (!sh.length) return; lsh = lsh.concat(sh);
                lightSrc.push({ id: g.id, label: g.label, shapes: sh, test: function (u) { return !!_nearOf(sh, _center(u.bbox)); } });
            });
            risks.push(_risk({ key: 'lightning', praId: 'PRA-007', kind: 'LIGHT', title: 'Lightning strike', short: 'Lightning strike',
                what: 'Lightning attaches at the nose, a wing tip, a fin tip or an engine front and runs through the structure. Units and wiring close to those points get the strongest currents.',
                shapes: lsh, units: units, runs: runs, reachFor: function (u) { return _nearOf(lsh, _center(u.bbox)) ? { id: 'near' } : null; }, zoneOf: zoneOf, topCode: topCode, sources: lightSrc }));
        }
        var res = { cadId: cadId, risks: risks, byKey: {}, units: units, runs: runs, zoneOf: zoneOf };   // 8 Nov 2026: units, runs and zones for the report
        risks.forEach(function (r) { res.byKey[r.key] = r; });
        _cache = { key: key, res: res };
        return res;
    }
    // ---- v2.3: the danger sources and their reach tests (one test per source; the risk reaches what any source reaches) ----
    var BIRD_GROUPS = [{ id: 'nose', label: 'Nose and flight deck', rx: /NOSE|FDCK/ }, { id: 'wings', label: 'Wing leading edges', rx: /WING/ }, { id: 'intakes', label: 'Engine intakes', rx: /NAC/ }, { id: 'tail', label: 'Tail leading edges', rx: /EMP/ }];
    var LIGHT_GROUPS = [{ id: 'nose', label: 'Nose' }, { id: 'wingtips', label: 'Wing tips' }, { id: 'tail', label: 'Tail and fin tips' }, { id: 'engines', label: 'Engine fronts' }];
    function _plainShape(s) { return !s ? null : s.kind === 'sphere' ? { kind: 'sphere', center: s.center, radius: s.radius } : (s.kind === 'box' ? { kind: 'box', min: s.min, max: s.max } : null); }
    function _srcLabel(lab, title) { var t = String(lab || '').replace(new RegExp('^' + String(title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ',\\s*', 'i'), ''); return t ? t.charAt(0).toUpperCase() + t.slice(1) : String(lab || ''); }
    // the first of a unit's 27 box points (corners, edge midpoints, face centers, center) inside a volume, or null
    function _volPoint(shape, u) { var CZ = C(); if (!CZ || !u || !u.bbox) return null; var c = _center(u.bbox); if (CZ.inShape(shape, c)) return c; var pts = _samples(u.bbox); for (var i = 0; i < pts.length; i++) if (CZ.inShape(shape, pts[i])) return pts[i]; return null; }
    function _boxOf(list, c) { for (var i = 0; i < list.length; i++) { var b = list[i]; if (c[0] >= b.min[0] && c[0] <= b.max[0] && c[1] >= b.min[1] && c[1] <= b.max[1] && c[2] >= b.min[2] && c[2] <= b.max[2]) return b; } return null; }
    function _nearOf(list, c) { for (var i = 0; i < list.length; i++) if (_len(_sub(c, list[i].center)) <= list[i].radius) return list[i]; return null; }
    function _risk(o) {
        var hits = o.units.filter(function (u) { var h = o.reachFor(u); if (h) u._frag = h; return !!h; }).map(function (u) { return Object.assign({}, u, { frag: u._frag }); });
        o.units.forEach(function (u) { delete u._frag; });
        var runHits = {}; o.runs.forEach(function (r) { if (!runHits[r.run] && o.reachFor(r)) runHits[r.run] = r; });
        var runList = Object.keys(runHits).sort().map(function (k) { return runHits[k]; });
        var runParts = {}; o.runs.forEach(function (r) { if (runHits[r.run]) (runParts[r.run] = runParts[r.run] || []).push(r.pid); });
        var sysSet = {}; hits.forEach(function (u) { if (u.sysId) sysSet[u.sysId] = 1; });
        var zones = {}; hits.forEach(function (u) { var z = o.zoneOf[u.pid]; var c = z ? o.topCode(z) : null; if (c) zones[c] = 1; });
        // v2.3: what each danger source reaches (a subset of the risk's hits; the same test)
        var sources = _arr(o.sources).map(function (s) {
            var sh = hits.filter(function (u) { return s.test(u); }), rr = {}; o.runs.forEach(function (x) { if (runHits[x.run] && s.test(x)) rr[x.run] = 1; });
            var ss = {}; sh.forEach(function (u) { if (u.sysId) ss[u.sysId] = 1; });
            var pids = {}; sh.forEach(function (u) { pids[String(u.pid)] = 1; }); o.runs.forEach(function (x) { if (s.test(x)) pids[String(x.pid)] = 1; });
            return { id: s.id, label: s.label, shapes: s.shapes || [], volume: s.volume || null, boxes: s.boxes || null, hits: sh.map(function (u) { return u.pid; }), runs: Object.keys(rr).sort(), systems: Object.keys(ss).sort(), pids: pids, test: s.test };
        });
        var r = { key: o.key, praId: o.praId, kind: o.kind, title: o.title, short: o.short, what: o.what, shapes: o.shapes, frags: o.frags || null, discs: o.discs || null, engine: o.engine || null, hits: hits, runs: Object.keys(runHits).sort(), runHits: runList, runParts: runParts, systems: Object.keys(sysSet).sort(), zones: Object.keys(zones).sort(), questions: [], sources: sources };
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
            Q.push({ id: r.key + ':lanes:' + _hash(g.map(function (u) { return u.pid; }).join('|')), rule: 'LANES', names: names,
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
            Q.push({ id: r.key + ':runs:' + _hash(g.map(function (x) { return x.run; }).join('|')), rule: 'LINES', names: names,
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
        r.inputsReady = ready; r.calc = { ready: ready, groups: {}, rotors: [], discs: [] };
        if (!ready || !r.groups.length) return;
        var only = {}; r.groups.forEach(function (g) { g.members.forEach(function (m) { m.forEach(function (pid) { only[String(pid)] = 1; }); }); });
        var models = r.frags.map(function (f) { return f.id; });
        var crit = {}; r.frags.forEach(function (f) { crit[f.id] = f.criterion ? 1 / Number(f.criterion.split(' in ')[1]) : null; });
        r.discs.forEach(function (d) {
            var id = rotorId(d), rec = P.rotor(id), k = JSON.stringify([id, rec.center, rec.axis, rec.discRadius, rec.bladeLength, rec.fragmentAxialWidthMm, rec.rotation, models, Object.keys(only).sort()]);
            var sw = _sweeps[k] || (_sweeps[k] = P.sweep(id, { models: models, only: only }));
            r.calc.rotors.push({ id: id, label: rec.label, ok: !!(sw && sw.ok), err: sw && sw.err });
            if (!sw || !sw.ok) return;
            // v2.3: what the sweep used for this disc, kept for the report's calculations (the sweep's own numbers, not a second method)
            var D = { id: id, pid: d.pid, name: d.name, designator: d.designator, label: rec.label, models: {} };
            sw.models.forEach(function (m) { D.models[m.model] = { label: m.label, spread: m.spreadDeg && m.spreadDeg.value, rCg: m.rCgMm && m.rCgMm.value, halfWidth: m.halfWidthMm && m.halfWidthMm.value, maxDim: m.maxDimensionMm && m.maxDimensionMm.value, faw: m.fragmentAxialWidthMm && m.fragmentAxialWidthMm.value }; });
            r.calc.discs.push(D);
            sw.models.forEach(function (m) {
                r.groups.forEach(function (g) {
                    var deg = 0, ivs = [];
                    (m.intervals || []).forEach(function (iv) { var set = {}; (iv.pids || []).forEach(function (p) { set[String(p)] = 1; }); if (g.members.every(function (mem) { return mem.some(function (p) { return set[String(p)]; }); })) { deg += iv.width; ivs.push([iv.from, iv.to]); } });
                    var G = r.calc.groups[g.key] || (r.calc.groups[g.key] = { names: g.names, worst: g.worst, models: {}, byDisc: {} });
                    var cur = G.models[m.model], share = deg / 360, ranges = mergeRanges(ivs);
                    (G.byDisc[id] = G.byDisc[id] || {})[m.model] = { share: share, deg: deg, ranges: ranges };
                    if (!cur || share > cur.share) G.models[m.model] = { share: share, deg: deg, limit: crit[m.model], label: m.label, disc: rec.label, discId: id, ranges: ranges };
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
    // v2.3: release-angle intervals [from, to] (degrees, 0 to 360) joined where they touch, one range through 0 where the
    // first starts at 0 and the last ends at 360: [{ from, to, width }]
    function mergeRanges(ivs) {
        var L = ivs.slice().sort(function (a, b) { return a[0] - b[0]; }), out = [];
        L.forEach(function (iv) { var p = out[out.length - 1]; if (p && iv[0] <= p.to + 1e-9) p.to = Math.max(p.to, iv[1]); else out.push({ from: iv[0], to: iv[1] }); });
        if (out.length > 1 && out[0].from <= 1e-9 && Math.abs(out[out.length - 1].to - 360) < 1e-9) { var last = out.pop(); out[0].from = last.from; out[0].wrap = true; out[0].width = (360 - last.from) + out[0].to; }
        out.forEach(function (x) { if (x.width == null) x.width = x.to - x.from; });
        return out;
    }
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
        // 8 Nov 2026: what the engineer wrote with Edit on the report (row.praOwn) stays, ahead of what the model gives
        var own = row.praOwn && typeof row.praOwn === 'object' ? row.praOwn : null;
        if (own) { _arr(own.affectedZones).forEach(function (z) { zones[z] = 1; }); if (own.mitigation) mit.unshift(own.mitigation); }
        row.systems = Object.keys(sys).sort().map(function (s) { return (_sys(s) || {}).name || s; }).join(', ') || (own && own.systems) || row.systems;
        row.affectedZones = Object.keys(zones).sort();
        row.csfl = own && own.csfl ? own.csfl : (worst ? worst.fc + ' (' + worst.severity + ')' : (row.csfl || ''));
        row.desc = (own && own.desc ? own.desc + '\n' : '') + lines.join('\n');
        row.mitigation = mit.filter(function (m, i) { return mit.indexOf(m) === i; }).join('; ');
        var seenF = {};
        row.praFindings = [].concat.apply([], risks.map(function (r) { return r.questions.filter(function (q) { if (seenF[q.id]) return false; seenF[q.id] = 1; return true; }).map(function (q) { var o = optionOf(q), a = answerOf(q.id); return { id: q.id, risk: r.title, text: q.text, pick: o ? o.label : null, status: o ? o.status : 'unanswered', by: a ? a.by : null, at: a ? a.at : null }; }); }));
        row.disposition = st.todo ? 'Open' : (st.open ? 'Open (design change)' : (st.signed === risks.length ? 'Closed' : 'Mitigated'));
        row.assessMethod = 'PRA Autopilot: worked out on the CAD model, choices by the engineer';
        return row;
    }

    // ---- the page ------------------------------------------------------------------------------------------
    var state = { risk: null, step: 0 };
    function _outline() { var Z = root.ZONES; return Z ? Z.all().filter(function (z) { return z && z.volume && z.volume.kind === 'box' && !z.parentId; }).map(function (z) { return { min: z.volume.min, max: z.volume.max }; }) : []; }
    // 8 Nov 2026: the Autopilot draws the left pane of the PRA page; the frame (cca_report.js) draws the page and the report
    // v2.1: the section (and so the tab) a risk the Autopilot works out belongs to
    function secOf(r) { return r.praId && _rowOf(r.praId) ? r.praId : 'ap:' + r.key; }
    function _leftHtml(tab) {
        if (!U()) return '';
        var res = compute();
        if (!res) return U().emptyCard('PRA Autopilot', 'The PRA Autopilot works the particular risks out on the CAD model.').replace('The table below still works by hand.', 'The report on the right still works by hand: Edit a section or add a particular risk.');
        // a risk's tab: only the risks the CAD model works out under its PRA ID, and only their questions
        var L = tab ? res.risks.filter(function (r) { return secOf(r) === tab; }) : res.risks;
        if (tab && !L.length) return '<div class="slap slap-card" data-pra-auto="1" data-pra-tab="' + U().E(tab) + '"><div class="slap-head"><span class="slap-title">PRA Autopilot</span></div><div class="slap-why" data-pra-noq="1">This particular risk is not worked out on the CAD model, so the Autopilot has nothing to ask about it. Its section on the right is written from its record: use Edit there to change it.</div></div>';
        if (tab && !L.some(function (r) { return r.key === state.risk; })) { var pick = L.find(function (r) { return riskStatus(r).state !== 'done'; }) || L[0]; state.risk = pick.key; state.step = 0; }
        var tot = { q: 0, a: 0, open: 0, done: 0 };
        L.forEach(function (r) { var s = riskStatus(r); tot.q += s.questions; tot.a += s.answered; tot.open += s.open; if (s.state === 'done') tot.done++; });
        var items = L.map(function (r) { var s = riskStatus(r); return { key: r.key, label: r.title + (r.praId ? ' (' + r.praId + ')' : ''), sub: r.hits.length + ' units reached, ' + (s.inputs ? 'the disc numbers come first' : (s.questions ? s.answered + ' of ' + s.questions + ' answered' : 'nothing to ask')) + (s.open ? ', ' + s.open + ' open' : '') + (s.state === 'done' ? ', signed' : ''), state: s.state === 'done' ? 'done' : (s.open ? 'open' : 'todo'), on: state.risk === r.key }; });
        // All risks: the overview and every risk (a click opens its tab); a risk's tab: its own questions
        var body = tab ? _riskHtml(res, res.byKey[state.risk]) : _overviewHtml(res, tot);
        var rail = !tab || L.length > 1 ? '<div>' + U().rail(items, 'SLPraAuto.ui.risk') + '</div>' : '';
        return '<div class="slap slap-card" data-pra-auto="1"' + (tab ? ' data-pra-tab="' + U().E(tab) + '"' : '') + '><div class="slap-head"><span class="slap-title">PRA Autopilot</span><span class="slap-sub">' + (tab ? (L.length > 1 ? L.length + ' parts of this risk, ' : '') : L.length + ' risks, ') + tot.q + ' questions, ' + tot.a + ' answered, ' + tot.open + ' open, ' + tot.done + ' signed</span>' + U().progress(tot.a, tot.q) + '</div>' +
            (tab ? '' : '<div class="slap-nav" style="margin:0 0 8px">' + U().importButtons(true) + '</div>') +
            '<div class="slap-grid">' + rail + '<div data-pra-auto-body="1">' + body + '</div></div></div>';
    }
    function render() { var F = frame(); if (F) return F.render(); return false; }
    function _overviewHtml(res, tot) {
        var first = res.risks.find(function (r) { return riskStatus(r).state !== 'done'; });
        return '<div class="slap-q">The tool has worked out what each particular risk can reach on the CAD model.</div>' +
            '<div class="slap-why">For every risk it found the parts in the danger area and what losing them would cause, and kept only the choices an engineer has to make: ' + tot.q + ' questions across ' + res.risks.length + ' risks.</div>' +
            U().picture({ outline: _outline(), volumes: [].concat.apply([], res.risks.map(function (r) { return r.shapes; })) }, { legend: [['rgba(220,38,38,.35)', 'danger areas']] }) +
            '<div class="slap-why">Each particular risk has its own tab above, with its questions here and its section of the report on the right. Pick a risk to open its tab.</div>' +
            '<div class="slap-nav">' + (first ? '<button type="button" class="slap-btn p" data-pra-start="1" onclick="SLPraAuto.ui.risk(' + U().E(JSON.stringify(first.key)) + ')">Start with ' + U().E(first.title) + '</button>' : '<span class="slap-pill ok">Every risk is signed</span>') + '</div>';
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
                '<button type="button" class="ccr-see" data-pra-see="' + U().E(q.id) + '" onclick="SLCcaReport.act(\'pra\',\'see\',' + U().E(JSON.stringify(q.id)) + ')">See where it goes &rarr;</button>' +
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
    // ==== the PRA report (8 Nov 2026): one section per particular risk, built from the live model ====================
    function frame() { return root.SLCcaReport ? root.SLCcaReport.get('pra') : null; }
    // read once per redraw (the cascade and the zonal findings are the heavy part)
    var _memo = {}, _memoT = null;
    function memo(k, f) {
        if (Object.prototype.hasOwnProperty.call(_memo, k)) return _memo[k];
        var v = f(); _memo[k] = v;
        if (!_memoT && typeof setTimeout === 'function') _memoT = setTimeout(function () { _memo = {}; _memoT = null; }, 0);
        return v;
    }
    function forget() { _memo = {}; if (_memoT && typeof clearTimeout === 'function') clearTimeout(_memoT); _memoT = null; }
    function _list(a) { a = a.filter(Boolean); return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    // v2.3: a system name written with a long dash (some project data) reads with a comma in the report (house rule: no em dashes)
    function _nd(t) { return t ? String(t).replace(/\s*\u2014\s*/g, ', ') : t; }
    function _sysName(id) { var s = _sys(id); return String(s ? (s.name || id) : id).replace(/\s*\u2014\s*/g, ', '); }
    function _zone(code) {
        var Z = root.ZONES, z = null; try { z = Z && Z.byCode ? Z.byCode(code) : null; } catch (_) {}
        var row = _arr(_g('zsaData')).find(function (x) { return x && x.zoneId === code; });
        return { code: code, id: z ? z.id : null, name: (z && z.name) || (row && row.desc) || '', zone: z, row: row };
    }
    function zoneLabel(code) { var z = _zone(code); return z.name ? code + ' ' + z.name : code; }
    function _subName(subId) { var f = _arr(_g('acFunctionsData')).find(function (x) { return x && x.subId === subId; }); return f ? (f.subName || f.funcName || '') : ''; }
    function fnLabel(subId) { var n = _subName(subId); return n ? subId + ' ' + n : subId; }
    function _fc(fcId) {
        var f = _arr(_g('acFhaData')).find(function (x) { return x && x.fcId === fcId; });
        if (!f) _arr(_g('systemsData')).some(function (sy) { f = _arr(sy.fha).find(function (x) { return x && x.fcId === fcId; }); return !!f; });
        return f || null;
    }
    function fcLabel(fcId) { var f = _fc(fcId); return f && f.fcDesc ? fcId + ' ' + f.fcDesc : fcId; }
    function _items() { return memo('items', function () { var m = {}; _arr(_g('itemsData')).forEach(function (it) { if (it && it.itemId) m[it.itemId] = it; }); return m; }); }
    // the zones a CAD part sits in: its own zone and every zone above it, by code
    function _chain(zid) { var Z = root.ZONES, out = [], z = Z && Z.get ? Z.get(zid) : null, guard = 0; while (z && guard++ < 30) { if (z.code) out.push(z.code); z = z.parentId ? Z.get(z.parentId) : null; } return out; }
    // the units and runs in each zone (by every code up the tree), from the CAD model
    function _cadIndex() {
        return memo('cad', function () {
            var res = compute(), units = {}, runs = {};
            if (!res) return null;
            res.units.forEach(function (u) { var zid = res.zoneOf[u.pid]; if (!zid) return; _chain(zid).forEach(function (c) { (units[c] = units[c] || []).push(u); }); });
            res.runs.forEach(function (r) { var zid = res.zoneOf[r.pid]; if (!zid) return; _chain(zid).forEach(function (c) { var m = runs[c] = runs[c] || {}; if (!m[r.run]) m[r.run] = r; }); });
            return { units: units, runs: runs };
        });
    }
    function _risksOf(praId) { var res = compute(); return res ? res.risks.filter(function (r) { return r.praId === praId; }) : []; }
    function _managed(row) { return !!(row && (row.origin === 'pra-autopilot' || row.praTyped || row.praFindings)); }
    function _findings() { return memo('findings', function () { try { return typeof root.fsZonalFindings === 'function' ? root.fsZonalFindings() : []; } catch (_) { return []; } }); }
    function _dyn(praId) { return memo('dyn:' + praId, function () { try { return typeof root.praDynamicModel === 'function' ? root.praDynamicModel(praId, { findings: _findings() }) : null; } catch (_) { return null; } }); }
    // the standard each kind of particular risk is assessed against (named, not quoted)
    var STD = [
        [/rotor|non-?contain|uncontained|fan blade|propeller blade/i, 'AC 20-128A (rotor and fan blade failure) with 14 CFR 25.903(d)(1)'],
        [/ram air turbine|\bRAT\b/i, '14 CFR 25.1309, with the fragment approach of AC 20-128A for a released blade'],
        [/tire|tyre|tread|wheel flange|hub fragment/i, '14 CFR 25.734 with the tire and wheel failure models of AMC 25.734'],
        [/bird/i, '14 CFR 25.571(e)(1), 25.631 and 25.775(b)'],
        [/lightning/i, '14 CFR 25.581, 25.954 and 25.1316'],
        [/hirf|radiated/i, '14 CFR 25.1317'],
        [/hold fire|cargo fire|compartment fire/i, '14 CFR 25.855, 25.857 and 25.858'],
        [/battery/i, '14 CFR 25.1353'],
        [/fuel/i, '14 CFR 25.863 and 25.981'],
        [/fire/i, '14 CFR 25.863 and 25.1181 to 25.1207 (fire protection)'],
        [/decompression|bulkhead|pressure/i, '14 CFR 25.365'],
        [/duct/i, '14 CFR 25.1438 with 25.1309'],
        [/debris|ingestion|brownout|dust|ice shed/i, '14 CFR 25.1091(d) and 33.76 to 33.78 (what an engine must swallow)'],
        [/payload|cargo|shift/i, '14 CFR 25.561 and 25.787'],
        [/door/i, '14 CFR 25.783'],
        [/hail|turbulence/i, '14 CFR 25.341 and 25.1309'],
        [/chemical|container/i, '14 CFR 25.1309 and 25.1453']
    ];
    function standardOf(row) { if (row && row.standard) return row.standard; var t = String((row && row.threat) || ''); var hit = STD.find(function (x) { return x[0].test(t); }); return hit ? hit[1] : 'The particular risk analysis of ARP4761A, with 14 CFR 25.1309'; }
    function _own(row) { return row && row.praOwn && typeof row.praOwn === 'object' ? row.praOwn : {}; }
    function sourceOf(row, rs) {
        var o = _own(row); if (o.desc) return o.desc;
        if (_managed(row)) { if (row.praTyped && row.praTyped.desc) return row.praTyped.desc; return _list(rs.map(function (r) { return r.what; }).filter(function (w, i, a) { return a.indexOf(w) === i; })) || row.threat || ''; }
        return row.desc || '';
    }
    function mitigationOf(row) { var o = _own(row); if (o.mitigation) return o.mitigation; if (_managed(row)) return (row.praTyped && row.praTyped.mitigation) || ''; return row.mitigation || ''; }
    function csflOf(row) { var o = _own(row); if (o.csfl) return o.csfl; if (_managed(row)) return (row.praTyped && row.praTyped.csfl) || ''; return row.csfl || ''; }
    function zonesOf(row, rs) { var m = {}; _arr(row.affectedZones).forEach(function (z) { m[z] = 1; }); rs.forEach(function (r) { r.zones.forEach(function (z) { m[z] = 1; }); }); return Object.keys(m).sort(); }
    var RUN_WORD = { hydraulic: 'Hydraulic lines', fuel: 'Fuel lines', wire: 'Wiring harnesses', bleed: 'Air ducts', oxygen: 'Oxygen lines' };
    var RUN_OWNER = { hydraulic: /hydraulic/i, fuel: /^fuel system/i, wire: /wiring/i, bleed: /pneumatic|environmental/i, oxygen: /oxygen/i };
    function runOwner(kind, run) { var rx = RUN_OWNER[kind]; if (!rx) return null; var L = _arr(_g('systemsData')).filter(function (s) { return rx.test(s.name || ''); }); if (L.length > 1) { var lane = /(^|-)([A-D])(?=-|$)/.exec(String(run).toUpperCase()); if (lane) { var hit = L.find(function (s) { return new RegExp('\\b(system |)' + lane[2] + '$', 'i').test(s.name || '') || new RegExp('-' + lane[2].toLowerCase() + '$').test(s.id || ''); }); if (hit) return hit; } } return L[0] || null; }
    // equipment in a zone: CAD units by system, CAD runs, the routing records through it, the systems the zone list places there
    function equipmentOf(code) {
        var ix = _cadIndex(), z = _zone(code), bySys = {}, items = _items();
        var add = function (sysName, field, txt) { var k = sysName || 'Not linked to a system'; var r = bySys[k] = bySys[k] || { housed: [], routed: [] }; if (r[field].indexOf(txt) < 0) r[field].push(txt); };
        if (ix) (ix.units[code] || []).forEach(function (u) { var it = items[u.designator]; add(u.sysId ? _sysName(u.sysId) : (it && it.owningSystemId ? _sysName(it.owningSystemId) : ''), 'housed', label(u)); });
        if (ix) { var rk = ix.runs[code] || {}; Object.keys(rk).sort().forEach(function (run) { var r = rk[run], o = runOwner(r.kind, run); add(o ? o.name : (RUN_WORD[r.kind] || 'Harness, tube and duct runs'), 'routed', (RUN_WORD[r.kind] || 'Run') .replace(/s$/, '').toLowerCase() + ' ' + run); }); }
        _arr(_g('routingData')).forEach(function (rt) {
            if (!rt || _arr(rt.routesThroughZones).indexOf(code) < 0) return;
            var owners = {}; _arr(rt.carriesItems).forEach(function (id) { var it = items[id]; if (it && it.owningSystemId) owners[_sysName(it.owningSystemId)] = 1; });
            var on = Object.keys(owners); if (!on.length) on = ['Routing'];
            on.forEach(function (sn) { add(sn, 'routed', (rt.routingId ? rt.routingId + ' ' : '') + (rt.name || '') + (_arr(rt.carriesItems).length ? ' (carries ' + rt.carriesItems.map(function (id) { return items[id] ? id + ' ' + items[id].name : id; }).join(', ') + ')' : '')); });
        });
        var placed = []; try { if (z.id && root.ZONES && root.ZONES.equipmentInSubtree) placed = root.ZONES.equipmentInSubtree(z.id); } catch (_) {}
        placed.forEach(function (sid) { if (!bySys[_sysName(sid)]) add(_sysName(sid), 'housed', 'placed here on the zone list'); });
        if (!ix && z.row && z.row.equip) add('Recorded for the zone', 'housed', z.row.equip);
        return Object.keys(bySys).sort().map(function (k) { return { system: k, housed: bySys[k].housed, routed: bySys[k].routed }; });
    }
    // the functions the equipment in the zones performs: items by their functions; other units by their system's functions;
    // the zone's housed functions; what the routing carries
    function functionsOf(codes) {
        var ix = _cadIndex(), items = _items(), rows = {}, sysFns = {};
        var put = function (subId, sysId, by, where) {
            if (!subId) return; var k = subId + '|' + (sysId || ''); var r = rows[k] = rows[k] || { subId: subId, sysId: sysId, by: [], where: [] };
            if (by && r.by.indexOf(by) < 0) r.by.push(by); if (where && r.where.indexOf(where) < 0) r.where.push(where);
        };
        // a function a zone record or a run names without saying which system: it joins the row of that function an
        // owner's equipment already gives, or stands as one row shared by its owners
        var loose = [];
        var putLoose = function (subId, owners, by, where) { loose.push({ subId: subId, owners: owners, by: by, where: where }); };
        var fnsOfSys = function (sid) { if (sysFns[sid]) return sysFns[sid]; var s = _sys(sid), out = []; _arr(s && s.functions).forEach(function (f) { _arr(f.traceIds).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); }); }); return (sysFns[sid] = out); };
        var owners = function (subId) { return _arr(_g('systemsData')).filter(function (s) { return fnsOfSys(s.id).indexOf(subId) >= 0; }).map(function (s) { return s.id; }); };
        codes.forEach(function (code) {
            if (ix) (ix.units[code] || []).forEach(function (u) {
                var it = items[u.designator];
                if (it && _arr(it.traceIds).length) _arr(it.traceIds).forEach(function (t) { put(t, it.owningSystemId || u.sysId, label(u), code); });
                else if (u.sysId) fnsOfSys(u.sysId).forEach(function (t) { put(t, u.sysId, label(u), code); });
            });
            var z = _zone(code);
            _arr(z.row && z.row.housedFunctions).forEach(function (t) { putLoose(t, owners(t), 'the zone record (housed in the zone)', code); });
            _arr(_g('routingData')).forEach(function (rt) {
                if (!rt || _arr(rt.routesThroughZones).indexOf(code) < 0) return;
                var nm = (rt.routingId ? rt.routingId + ' ' : '') + (rt.name || '');
                _arr(rt.carriesFunctions).forEach(function (t) { putLoose(t, owners(t), nm, code); });
                _arr(rt.carriesItems).forEach(function (id) { var it = items[id]; if (it) _arr(it.traceIds).forEach(function (t) { put(t, it.owningSystemId, id + ' ' + it.name + ' (' + nm + ')', code); }); });
            });
        });
        loose.forEach(function (x) {
            var have = Object.keys(rows).filter(function (k) { return rows[k].subId === x.subId; });
            if (x.owners.length === 1) { put(x.subId, x.owners[0], x.by, x.where); return; }
            if (have.length) { have.forEach(function (k) { var r = rows[k]; if (r.by.indexOf(x.by) < 0) r.by.push(x.by); if (r.where.indexOf(x.where) < 0) r.where.push(x.where); }); return; }
            var k = x.subId + '|shared'; var r = rows[k] = rows[k] || { subId: x.subId, sysId: null, shared: x.owners.slice(), by: [], where: [] };
            if (r.by.indexOf(x.by) < 0) r.by.push(x.by); if (r.where.indexOf(x.where) < 0) r.where.push(x.where);
        });
        return Object.keys(rows).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); }).map(function (k) { return rows[k]; });
    }
    // a MAC rule in words: the function it protects, when, and what it needs that the event takes away
    function macWords(b, down) {
        var rule = _arr((_pc() || {}).macModels).find(function (r) { return r && r.id === b.ruleId; }) || null;
        var need = rule ? _arr(rule.clauses).map(function (cl) { var mem = _arr(cl.of), left = mem.filter(function (m) { return down.indexOf(m) < 0; }); return 'at least ' + (cl.floor != null ? cl.floor : (cl.min || 1)) + ' of ' + _list(mem.map(_sysName)) + ' (' + (left.length ? left.length + ' left: ' + _list(left.map(_sysName)) : 'none left') + ')'; }).join('; and ') : String(b.detail || '').replace(/\s*\u2014\s*/g, ': ');
        var ph = b.phase && b.phase !== 'all' ? ' in ' + b.phase : '';
        return fnLabel(b.subId) + ph + ' needs ' + need;
    }
    var SEV_WORD = { Catastrophic: 'catastrophic', Hazardous: 'hazardous', Major: 'major', Minor: 'minor', 'No Safety Effect': 'no safety effect' };
    function retentionWords(st) {
        return st === 'accepted' ? 'carried: an accepted zonal disposition covers it'
            : st === 'reopened' ? 'reopened: the zone changed after its disposition was accepted, so it needs accepting again'
                : st === 'open' ? 'open, no accepted disposition yet'
                    : 'open, no zonal disposition records it yet';
    }
    // what one event takes out, drawn: zones, then systems (direct, then knock-on), then failure conditions
    function lossFigure(row, dm, C) {
        var F = root.SLCcaReport, zones = _arr(dm && dm.zones), direct = _arr(dm && dm.directSystems), knock = _arr(dm && dm.knockOn), fcs = _arr(dm && dm.tripped);
        if (!zones.length) return null;
        var pos = {}, colsN = [[], [], [], []], edges = [], C0 = C;
        var col = function (ci, list, mk) { list.forEach(function (x) { var b = mk(x); colsN[ci].push({ id: b.id, t: b.t, s: b.s, k: b.k }); pos[b.id] = 1; }); return 0; };
        var sevKind = function (s) { return sevRank(s) >= 4 ? 'bad' : sevRank(s) >= 3 ? 'warn' : 'plain'; };
        var h1 = col(0, zones, function (z) { return { id: 'z:' + z, t: zoneLabel(z), s: 'Zone', k: 'on' }; });
        var h2 = col(1, direct, function (sid) { return { id: 's:' + sid, t: _sysName(sid), s: 'Lost directly', k: 'warn' }; });
        var h3 = col(2, knock, function (k) { return { id: 'k:' + k.id, t: _nd(k.name) || _sysName(k.id), s: 'Lost as a knock-on, through ' + (_nd(k.from) || 'the cascade'), k: 'off' }; });
        var h4 = col(3, fcs, function (f) { return { id: 'fc:' + f.fcId, t: fcLabel(f.fcId), s: (SEV_WORD[f.severity] || f.severity || '') + ' failure condition', k: sevKind(f.severity) }; });
        var line = function (a, b) { if (pos[a] && pos[b]) edges.push([a, b]); };
        _arr(dm.zoneNotes).forEach(function (zn) { zn.systems.forEach(function (sid) { line('z:' + zn.zone, 's:' + sid); }); });
        knock.forEach(function (k) { var fromId = direct.find(function (sid) { var s0 = _sys(sid); return _sysName(sid) === k.from || (s0 && s0.name === k.from); }); if (fromId) line('s:' + fromId, 'k:' + k.id); });
        _arr(dm.breaches).forEach(function (b) { var rule = _arr((_pc() || {}).macModels).find(function (r) { return r && r.id === b.ruleId; }); var mem = rule ? [].concat.apply([], _arr(rule.clauses).map(function (cl) { return _arr(cl.of); })) : []; b.fcs.forEach(function (f) { mem.forEach(function (sid) { if (pos['s:' + sid]) line('s:' + sid, 'fc:' + f.fcId); else if (pos['k:' + sid]) line('k:' + sid, 'fc:' + f.fcId); }); }); });
        var title = 'What one ' + String(row.threat || 'event').toLowerCase() + ' takes out (' + row.praId + ')';
        // v1.x 9 Nov 2026: drawn by the shared column diagram (squared connectors in their own lanes, never through a box)
        var heads = ['ZONES', 'LOST DIRECTLY', 'KNOCK-ON', 'FAILURE CONDITIONS'], fl = F.flow('pra', { title: title, sub: 'Zones it reaches, the systems lost directly and as a knock-on, and the failure conditions that trip. Click a box for more.', cols: colsN.map(function (n, i) { return { head: heads[i], nodes: n }; }).filter(function (c) { return c.nodes.length; }), edges: edges });
        return { k: 'fig', name: 'loss-' + row.praId, title: title, svg: fl.svg, w: fl.w, h: fl.h, lead: '{N} draws what one event takes out.' };
    }
    // the danger area on the CAD model (a picture from the Autopilot), dark when the page is
    function areaFigure(r, C) {
        var f = U() && U().figure ? U().figure({ outline: _outline(), volumes: r.shapes, marks: r.hits.map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: '#2563EB' }; }) }, { width: 460 }) : null;
        if (!f) return null;
        var svg = f.svg; if (C && C.paper !== '#ffffff') svg = svg.replace(/fill="#ffffff"/g, 'fill="' + C.paper + '"').replace(/fill="#5b6270"/g, 'fill="' + C.sub + '"');
        return { k: 'fig', name: 'area-' + r.key, title: r.title + ': the danger area (red) and the units it reaches (blue), on the CAD model', svg: svg, w: f.w, h: f.h, lead: '{N} shows where it reaches on the CAD model.' };
    }
    function _rowsSorted() { return _arr(_g('praData')).filter(function (r) { return r && r.praId; }).slice().sort(function (a, b) { return String(a.praId).localeCompare(String(b.praId), undefined, { numeric: true }); }); }
    // ==== v2.3 (9 Nov 2026): each section tells the whole story ======================================================
    // Waqas: "I want the PRA reports to explain their methods their basis, the math, where we have multiple impact zones,
    // we should have 1 image per cone like in the rotor burst PRA 1 per engine and the cones be different distinct colors,
    // show the calculations, tell the whole story please"; "yeah needs to look clean and legible".
    // The section reads in this order: (1) the risk and the question the analysis answers; (2) the method (how the danger
    // area is built for this kind of risk and how a part is judged to be reached); (3) the basis (the rule or guidance
    // behind each step, in our own words with its paragraph, and the pass criterion); (4) the calculations, per danger
    // source (each engine, each bogie, each group of surfaces or attachment points): the inputs, the formulas, the
    // results, one fully worked line and the source's own 3D picture in its own color; (5) and (6) the results (zones,
    // equipment, functions; what is lost); (7) the choices; (8) retention; (9) the conclusion. Every number is the one
    // compute() and the sweep of the PRA panel (pra_models.js) produce: nothing is worked out a second way here.
    function _n(x) { return Math.round(Number(x) || 0).toLocaleString('en-US'); }
    function _d1(x) { return (Math.round((Number(x) || 0) * 10) / 10).toFixed(1); }
    function _xyz(p) { return p ? 'x ' + _n(p[0]) + ', y ' + _n(p[1]) + ', z ' + _n(p[2]) + ' mm' : ''; }
    function _share(x) { if (!(x > 0)) return '0%'; var p = x * 100; return (p < 0.1 ? p.toFixed(3) : p < 1 ? p.toFixed(2) : p.toFixed(1)) + '%'; }
    function _oneIn(x) { return x > 0 ? 'about 1 in ' + _n(1 / x) : 'never'; }
    function _axisWords(a) { var i = [0, 1, 2].filter(function (k) { return Math.abs(a[k]) > 0.9; })[0]; return i === 0 ? 'the x axis (front to back)' : i === 1 ? 'the y axis (side to side)' : i === 2 ? 'the z axis (up and down)' : '(' + a.map(function (v) { return Math.round(v * 1000) / 1000; }).join(', ') + ')'; }
    function _zeroWords(rec) { return rec && rec.refDir ? 'the reference direction set for the disc' : (Math.abs((rec ? rec.axis : [1, 0, 0])[2]) < 0.9 ? 'straight up' : 'the x direction'); }
    function _rangesWords(R) { return R.map(function (x) { return _d1(x.from) + '° to ' + _d1(x.to) + '°' + (x.wrap ? ' (through 0°)' : '') + ' (' + _d1(x.width) + '° wide)'; }).join(' and '); }
    function _fragLabel(f) { return f.id === 'oneThirdDisc' ? 'One-third disc' : f.id === 'intermediate' ? 'Intermediate piece' : f.id === 'small' ? 'Small pieces' : 'One-third disc, alternative model'; }
    function _paraOf(f) { return String(f.ref || '').replace(/^AC 20-128A /, ''); }
    var FRAG_PARA = { oneThirdDisc: '10c(3)(i)', intermediate: '10c(3)(ii)', alternate: '10c(3)(i)', small: '10c(5)' };
    function _unitById(res) { var m = {}; (res ? res.units : []).forEach(function (u) { m[u.pid] = u; }); return m; }
    function _kindOf(rs) { return rs.length ? rs[0].kind : 'GENERIC'; }
    function _bySystem(units) { var m = {}; units.forEach(function (u) { var k = u.sysId ? _sysName(u.sysId) : (u.sysName || 'Not linked to a system'); (m[k] = m[k] || []).push(label(u)); }); return Object.keys(m).sort().map(function (k) { return { system: k, units: m[k] }; }); }
    var QUESTION = {
        ROTOR: 'If a spinning disc in any engine breaks and its pieces escape the engine case, can the aircraft still fly and land safely? In numbers: for every set of lanes of one job within reach, what share of the possible release angles lets a single piece reach them all, and is that share within the AC 20-128A limits?',
        TIRE: 'If a tire bursts on any main bogie, on the ground or as the gear comes up, do its pieces leave enough of every system needed to fly and land safely?',
        FIRE: 'If this fire starts, does what it reaches leave enough of every system needed to fly and land safely?',
        BIRD: 'If a bird hits any forward-facing surface, does what sits right behind it leave enough of every system needed to fly and land safely?',
        LIGHT: 'If lightning attaches at any extremity of the aircraft, do the units and wiring close to that point leave enough of every system needed to fly and land safely?',
        GENERIC: 'If this event happens, what does it take out, and can the aircraft still fly and land safely with what remains?'
    };
    var FROM_PARTS = '**From parts to losses.** The zones the reached parts sit in are read with everything they house and everything routed through them, the items with the functions they perform, and the systems with their failure conditions. What is lost then follows the availability cascade between the systems and the minimum aircraft configuration (MAC) rules, and each catastrophic outcome is checked for an accepted zonal disposition.';
    function methodBlocks(row, rs) {
        var P = function (t) { return { k: 'p', text: t }; }, k = _kindOf(rs), b = [];
        if (k === 'ROTOR') {
            var fr = rs[0].frags || FRAG.filter(function (f) { return !f.optional; });
            b.push(P('**How the danger area is built.** The tool finds each engine\'s spinning discs on the CAD model (the parts named as fan, compressor or turbine discs) and takes each disc\'s position, spin axis and size from it. The engineer checks those numbers and adds what only the engine maker knows. Around every disc it draws one burst band for each kind of piece AC 20-128A asks for: a thin slice either side of the disc\'s plane, as wide as that piece\'s spread angle (' + fr.map(function (f) { return _fragLabel(f).toLowerCase() + ' ±' + _spreadOf(f.id) + '°'; }).join(', ') + '), reaching out ' + _n(RANGE / 1000) + ' m, past the far side of the aircraft. Each engine is one danger source: its discs\' bands together.'));
            b.push(P('**How a part is judged to be reached.** A unit, or a harness, tube or duct run, counts as reached when any of 27 points on its box (the 8 corners, the 12 edge midpoints, the 6 face centers and the center) lies inside a band of one of the engine\'s discs: the angle between the disc\'s plane and the line from the disc center to the point is no more than the spread, and the point is within ' + _n(RANGE / 1000) + ' m. Each part is listed under the narrowest band that reaches it.'));
            b.push(P('**How the hazard ratio is worked out.** For each set of lanes of one job an engine can reach (two generators, hydraulic lines A and B), the tool runs the release angle sweep of the PRA panel on the CAD Model page for every disc. A piece lets go at each angle around the disc, its center flies off along the tangent in the direction of spin, and its path is as wide as the piece. The part outlines are laid onto the disc\'s plane, and the sweep finds exactly the ranges of release angles at which one piece crosses every lane of the set. The share of the full turn those ranges cover is the hazard ratio; the worst disc of the engine counts. No credit is taken for a piece passing above or below a part inside its band.'));
        } else if (k === 'TIRE') {
            b.push(P('**How the danger area is built.** Each main bogie has a tire burst volume drawn on the CAD Model page: a sphere around the bogie. It stands for the space the tire and wheel debris of AMC 25.734 can reach (tread pieces thrown out, a flange segment, a flailing tread strip, the burst blast in the wheel well). The tool takes each volume as drawn; it does not trace those debris models piece by piece, so the size of each volume is the engineer\'s judgment, to be checked against them. Each bogie is one danger source.'));
            b.push(P('**How a part is judged to be reached.** A unit, or a harness, tube or duct run, counts as reached when its box center or any of 27 points on its box (the 8 corners, the 12 edge midpoints, the 6 face centers and the center) lies inside a bogie\'s volume.'));
        } else if (k === 'FIRE') {
            b.push(P('**How the danger area is built.** The fire volume drawn on the CAD Model page (a box) stands for the space the fire, its heat and its smoke can reach. Everything inside it is taken as lost; nothing is credited for fire protection inside the volume.'));
            b.push(P('**How a part is judged to be reached.** A unit, or a harness, tube or duct run, counts as reached when its box center or any of 27 points on its box (the 8 corners, the 12 edge midpoints, the 6 face centers and the center) lies inside the volume.'));
        } else if (k === 'BIRD') {
            b.push(P('**How the danger area is built.** The forward-facing surfaces are read from the zone list and grouped as the nose and flight deck, the wing leading edges, the engine intakes and the tail leading edges. Behind each surface the tool takes a slab from the front face of its zone back 3,000 mm (nose and flight deck, where the skin is struck head on) or 1,500 mm (the others): what sits in that slab is what a bird coming through the skin can reach. Each group of surfaces is one danger source.'));
            b.push(P('**How a part is judged to be reached.** A unit, or a harness, tube or duct run, counts as reached when the center of its box lies inside one of the slabs.'));
        } else if (k === 'LIGHT') {
            b.push(P('**How the danger area is built.** Lightning first attaches at the aircraft\'s extremities, which the lightning zoning practice treats as the initial attachment zones: the nose, the wing tips, the tail and fin tips, and the engine fronts. The tool puts an attachment point at each of those extremities of the zone boxes and draws a sphere of 3,000 mm around it, where the current and its magnetic field are strongest. Each group of attachment points is one danger source.'));
            b.push(P('**How a part is judged to be reached.** A unit, or a harness, tube or duct run, counts as reached when the center of its box is within 3,000 mm of an attachment point.'));
        } else {
            b.push(P('**How the danger area is built.** The tool has no geometric model for this kind of risk on the CAD model. The zones recorded for it (Edit changes them) are taken as reached as a whole.'));
            b.push(P('**How a part is judged to be reached.** Every unit housed in those zones and every harness, tube and duct run routed through them counts as reached. That is the worst case: nothing in the zones is credited as surviving.'));
        }
        b.push(P(FROM_PARTS));
        return b;
    }
    // the basis: [step, rule or guidance with its paragraph, what it sets (in our words), pass criterion]
    function basisRows(row, rs) {
        var k = _kindOf(rs), R = function (a, b, c, d) { return { Step: a, 'Rule or guidance': b, 'What it sets (in our words)': c, 'Pass criterion': d }; };
        if (k === 'ROTOR') {
            var alt = (rs[0].frags || []).some(function (f) { return f.id === 'alternate'; });
            return [R('Pieces to assume', 'AC 20-128A para 9a, 9b and 9d' + (alt ? ', and 9c for the alternative' : ''), 'A one-third disc piece (a third of the disc with a third of the blade height); an intermediate piece a third of the bladed radius long, a thirtieth of the bladed disc mass; small pieces up to half a blade long' + (alt ? '; as an alternative to the first two, one one-third disc piece at the wider spread' : '') + '.', 'None: the set of pieces to check'),
                R('Spread angles', 'AC 20-128A para 6f with 9a to 9d', 'Measured fore and aft from the disc\'s plane at the shaft centerline: ±3° for the one-third disc, ±5° for the intermediate piece' + (alt ? ' and for the alternative' : '') + ', ±15° for small pieces.', 'None: the width of each band'),
                R('Path of a piece', 'AC 20-128A Appendix 1, 4.1(a)', 'The piece leaves along the tangent to the circle its center traces, in the direction of spin, and is taken as having unlimited energy: it goes through whatever it meets.', 'Only a shield the engineer credits stops it'),
                R('Release angle', 'AC 20-128A Appendix 1, 5.5, 6.4 and 6.5', 'A disc is equally likely to let go at any angle around the turn; the risk angle is the arc of release angles at which a piece reaches the parts that matter.', 'None: the share of 360° is the hazard ratio'),
                R('One-third disc', 'AC 20-128A para 10c(3)(i)', 'The chance that one released one-third disc piece causes a catastrophe' + (alt ? ' (the same limit for the alternative model)' : '') + '.', 'No more than 1 in 20 (5.0%)'),
                R('Intermediate piece', 'AC 20-128A para 10c(3)(ii)', 'The chance that one released intermediate piece causes a catastrophe.', 'No more than 1 in 40 (2.5%)'),
                R('Small pieces', 'AC 20-128A para 10c(5)', 'No number is asked; the parts small pieces can reach are shown so the design can separate or shield them.', 'Design precautions'),
                R('The requirement', '14 CFR 25.903(d)(1)', 'The design must minimize the hazard to the aircraft if a rotor fails.', 'Hazard minimized; continued safe flight and landing')];
        }
        if (k === 'TIRE') return [R('Debris to allow for', 'AMC 25.734, Models 1 to 4', 'Large and small tread pieces thrown from a burst tire, a released wheel flange segment, a flailing tread strip, and a burst in flight with the gear up.', 'None: the debris to design for'),
            R('The volume used here', 'The tire burst volumes on the CAD Model page', 'A sphere around each main bogie stands for the reach of that debris.', 'Its size is checked by the engineer against the models'),
            R('The requirement', '14 CFR 25.734 (CS 25.734)', 'Safe operation must be kept after a tire or wheel failure.', 'Continued safe flight and landing: no single burst takes out every lane of a function it needs')];
        if (k === 'BIRD') return [R('Structure', '14 CFR 25.571(e)(1)', 'The aircraft must finish the flight after hitting a 4 pound bird at its design cruise speed at sea level (or 85% of it at 8,000 ft).', 'Continued safe flight and landing'),
            R('Tail', '14 CFR 25.631', 'The tail must withstand an 8 pound bird at the same speeds.', 'Continued safe flight and landing'),
            R('Windshield', '14 CFR 25.775(b)', 'The pilots\' windshield and its frame must withstand a 4 pound bird at the design cruise speed at sea level without being penetrated.', 'No penetration'),
            R('Systems behind the skin', '14 CFR 25.1309 with the particular risk analysis of ARP4761A', 'The systems behind each struck surface are checked like those of any particular risk.', 'No catastrophic failure condition; lanes of one job not lost together')];
        if (k === 'LIGHT') return [R('Attachment zones', 'The lightning zoning practice', 'Lightning first attaches at the extremities (nose, wing tips, tail and fin tips, engine fronts) and sweeps back from there.', 'None: where to look'),
            R('Aircraft', '14 CFR 25.581', 'The aircraft must be protected against catastrophic effects of lightning.', 'No catastrophic effect'),
            R('Fuel system', '14 CFR 25.954', 'Lightning must not ignite fuel vapor in the fuel system.', 'No ignition'),
            R('Electrical and electronic systems', '14 CFR 25.1316', 'Systems whose failure would be catastrophic keep working through and after a strike; those whose failure would be hazardous or major recover in time.', 'Function kept, or recovered in time')];
        if (k === 'FIRE') return [R('The requirement', standardOf(row), 'The fire must be detected and contained; the equipment inside its volume is taken as lost.', 'Continued safe flight and landing with what remains'),
            R('The method', 'ARP4761A, particular risk analysis, with 14 CFR 25.1309', 'The fire is taken as happening; the analysis shows what it reaches and that what remains is enough.', 'No catastrophic failure condition without an accepted disposition')];
        return [R('The requirement', standardOf(row), 'What the rule asks for this kind of event.', 'Continued safe flight and landing'),
            R('The method', 'ARP4761A, particular risk analysis, with 14 CFR 25.1309', 'The event is taken as happening; the analysis shows what it reaches and that what remains is enough.', 'No catastrophic failure condition without an accepted disposition')];
    }
    // the formulas a rotor burst uses, in words and symbols
    function rotorFormulas(r) {
        var F = function (a, b, c) { return { Quantity: a, 'In words': b, 'In symbols': c }; };
        return [F('Inside a band', 'The angle between the disc\'s plane and the line from the disc center to a point of the part is no more than the spread, within the fragment range', 'asin(|w · a| / |w|) ≤ s and |w| ≤ ' + _n(RANGE) + ' mm (w: disc center to the point, a: spin axis, s: spread)'),
            F('Center of a one-third disc piece', 'The center of a 120° slice of radius R + b/3', 'r = 2 (R + b/3) sin 60° / (3 × π/3)'),
            F('Path width of a one-third disc piece', 'Twice the farthest distance from that center to the edge of the slice', 'w = 2 max(r, √((R + b/3)² + r² − 2 (R + b/3) r cos 60°))'),
            F('Intermediate piece', 'Its center at the blade roots; its path as wide as the piece, a third of the bladed radius', 'r = R, w = (R + b) / 3'),
            F('Small pieces', 'Their center in the middle of the outer half of a blade; their path as wide as the piece, half a blade', 'r = R + 0.75 b, w = b / 2'),
            F('Hazard ratio of a set of lanes', 'The release angles at which one piece reaches every lane of the set, added up, as a share of the full turn; the worst disc counts', 'H = Σ (to − from) / 360°, against 1/20 (one-third disc) or 1/40 (intermediate)')];
    }
    // the calculations of one engine (one danger source)
    function rotorCalcBlocks(r, row, idx, fallback) {
        var P = function (t, q) { var x = { k: 'p', text: t }; if (q) x.q = q; return x; }, b = [], PM = root.SLPraModels, ready = !!(r.calc && r.calc.ready);
        var discsWords = _list(r.discs.map(function (d) { return 'the ' + lcName(d.name) + (d.designator ? ' (' + d.designator + ')' : ''); }));
        b.push({ k: 'part', level: 2, text: '4.' + idx + ' ' + r.title });
        b.push(P('Engine ' + r.engine + ' has ' + (NUMW[r.discs.length] || r.discs.length) + ' disc' + (r.discs.length === 1 ? '' : 's') + ' that can let go: ' + discsWords + '.'));
        // the disc numbers (one column per disc)
        var recs = r.discs.map(function (d) { var rec = PM ? PM.rotor(rotorId(d)) : null; return { d: d, rec: rec, v: prefill(d) }; }), demo = _isDemo();
        var col = function (x) { return x.d.name + (x.d.designator ? ' (' + x.d.designator + ')' : ''); };
        var row1 = function (q, f, src) { var o = { Quantity: q }; recs.forEach(function (x) { o[col(x)] = f(x); }); o.Source = src; return o; };
        var fromCad = ready ? 'CAD model, checked on the Autopilot\'s inputs screen' : 'CAD model, not checked yet';
        var tbl = [row1('Center of the disc', function (x) { return _xyz(x.rec ? x.rec.center : x.v.center); }, fromCad),
            row1('Spin axis', function (x) { return _axisWords(x.rec ? x.rec.axis : x.v.axis); }, fromCad),
            row1('Spin direction', function (x) { return (x.rec ? x.rec.rotation : x.v.rotation) === -1 ? 'Counterclockwise, seen from the front' : 'Clockwise, seen from the front'; }, ready ? 'Engine maker, entered on the inputs screen' : 'Not entered yet (clockwise assumed)'),
            row1('Disc radius to the blade roots, R', function (x) { return _n(x.rec ? x.rec.discRadius : x.v.diameter / 2) + ' mm'; }, fromCad),
            row1('Blade length, b', function (x) { return _n(x.rec ? x.rec.bladeLength : x.v.blade) + ' mm'; }, fromCad),
            row1('Width of a piece (disc rim thickness)', function (x) { var v = x.rec ? x.rec.fragmentAxialWidthMm : x.v.width; return v == null ? 'Not entered yet' : _n(v) + ' mm'; }, fromCad),
            row1('Disc mass with its blades', function (x) { var v = x.rec ? x.rec.bladedDiscMassKg : x.v.mass; return v == null ? 'Not entered yet' : _n(v) + ' kg'; }, (demo ? 'Demo assumption; for a real engine, the engine maker. ' : 'Engine maker. ') + 'Not used in the hazard ratio: no shield is credited'),
            row1('Redline speed', function (x) { var v = x.rec ? x.rec.rpm : x.v.rpm; return v == null ? 'Not entered yet' : _n(v) + ' rpm'; }, (demo ? 'Demo assumption; for a real engine, the engine maker. ' : 'Engine maker. ') + 'Not used in the hazard ratio: no shield is credited')];
        b.push({ k: 'table', name: 'discs-' + r.key, title: 'Engine ' + r.engine + ': the disc numbers', rows: tbl, lead: '{N} gives the numbers for each disc of engine ' + r.engine + ' and where each comes from.' });
        // the bands: spread, from and to, the piece's path per disc, the units inside
        var D = {}; (ready ? r.calc.discs : []).forEach(function (x) { D[x.id] = x; });
        var bands = r.frags.map(function (f, fi) {
            var s = _spreadOf(f.id), inside = r.hits.filter(function (u) { return u.frag && _spreadOf(u.frag.id) <= s + 1e-9; });
            var fc = root.SLCadShots && root.SLCadShots.fragColor ? root.SLCadShots.fragColor(f.id, fi) : null;   // v2.5: each kind of piece has its own color in the pictures
            return { 'Kind of piece': _fragLabel(f) + (fc ? ' (' + fc.name + ' in the pictures)' : ''), 'Spread (rule)': '±' + s + '° (' + _paraOf(f) + ')', 'Band': '−' + s + '° to +' + s + '° from the disc plane, ' + (2 * s) + '° wide', 'Units inside': String(inside.length), 'Systems inside': String(_bySystem(inside).length) };
        });
        b.push({ k: 'table', name: 'bands-' + r.key, title: 'Engine ' + r.engine + ': the burst bands', rows: bands, lead: '{N} gives each burst band of engine ' + r.engine + ' and how much lies inside it.' });
        // the path of each piece, per disc (its own table, one column per disc, so it stays legible in Word)
        if (ready) b.push({ k: 'table', name: 'paths-' + r.key, title: 'Engine ' + r.engine + ': the path of each piece, per disc', rows: r.frags.map(function (f) {
            var o = { 'Kind of piece': _fragLabel(f) };
            recs.forEach(function (x) { var m = D[rotorId(x.d)] && D[rotorId(x.d)].models[f.id]; o[col(x)] = m ? 'center at ' + _n(m.rCg) + ' mm, path ' + _n(2 * m.halfWidth) + ' mm wide' : 'Not worked out'; });
            return o; }), lead: '{N} gives, for each kind of piece and each disc of engine ' + r.engine + ', how far from the spin axis its center flies (r) and how wide its path is (w), from the formulas at the start of section 4.' });
        else b.push(P('The path of each piece is worked out once the disc numbers for engine ' + r.engine + ' are in.'));
        // the units inside the bands, by system and band
        var uniq = []; r.frags.forEach(function (f) { if (!uniq.some(function (g) { return _spreadOf(g.id) === _spreadOf(f.id); })) uniq.push(f); });
        var sys = {}; r.hits.forEach(function (u) { var k = u.sysId ? _sysName(u.sysId) : (u.sysName || 'Not linked to a system'); var o = sys[k] = sys[k] || {}; var f = uniq.filter(function (g) { return _spreadOf(g.id) === _spreadOf(u.frag ? u.frag.id : 'small'); })[0] || uniq[uniq.length - 1]; (o[f.id] = o[f.id] || []).push(label(u)); });
        var ur = Object.keys(sys).sort().map(function (k) { var o = { System: k }; uniq.forEach(function (f, i) { o[(i ? 'Added at ±' : 'Inside ±') + _spreadOf(f.id) + '° (' + _fragLabel(f).toLowerCase() + ')'] = (sys[k][f.id] || []).join('; ') || 'None'; }); return o; });
        if (ur.length) b.push({ k: 'table', name: 'bandunits-' + r.key, title: 'Engine ' + r.engine + ': the units inside the bands, by system', rows: ur, lead: '{N} names the units inside each band of engine ' + r.engine + ', by system, under the narrowest band that reaches them.' });
        else b.push(P('No unit of a system lies inside the bands of engine ' + r.engine + '.'));
        // the hazard ratio per set of lanes
        if (!ready) { b.push(P('Not decided yet: the disc numbers for engine ' + r.engine + ' are not in, so the AC 20-128A hazard ratio has not been worked out (' + r.title + '). Enter them on the Autopilot\'s inputs screen.', 'inputs:' + r.key)); }
        else {
            var keys = Object.keys(r.calc.groups).sort();
            var bad = r.calc.rotors.filter(function (x) { return !x.ok; });
            if (bad.length) b.push(P('The sweep could not run for ' + bad.map(function (x) { return x.label + ' (' + (x.err || 'no result') + ')'; }).join('; ') + '.'));
            if (!keys.length) b.push(P('No two lanes of the same job are in reach of engine ' + r.engine + ', so there is no hazard ratio to work out.', 'inputs:' + r.key));
            else {
                var discName = function (id) { var d = r.discs.filter(function (x) { return rotorId(x) === id; })[0]; return d ? lcName(d.name) : id; };
                var hr = keys.map(function (k) {
                    var c = r.calc.groups[k], o = { 'Lanes of one job': c.names.join(', ') };
                    r.frags.forEach(function (f) { var x = c.models[f.id]; o[_fragLabel(f) + (f.criterion ? ' (limit ' + f.criterion + ')' : ' (no limit)')] = !x ? 'Not worked out' : (x.share > 0 ? _share(x.share) + ' (' + _d1(x.deg) + '° of 360°, ' + discName(x.discId).replace(/ (rotor )?disc$/, '') + ')' : '0% (never together)'); });
                    o.Result = ({ meets: 'Within the limits', clear: 'Never reached together by one piece', fails: 'Over the limit', small: 'Within the limits; small pieces can reach them all: design precautions' })[c.status];
                    return o;
                });
                b.push({ k: 'table', name: 'calc-' + r.key, title: 'Engine ' + r.engine + ': the hazard ratio for each set of lanes of one job', rows: hr, lead: '{N} gives the hazard ratio of engine ' + r.engine + ' for each set of lanes of one job in reach, for each kind of piece, against its limit (the worst disc counts).' });
                b.push(P(rotorWorked(r, discName), 'inputs:' + r.key));
            }
        }
        b.push({ k: 'shotslot', view: 'src:' + r.key + ':engine', fallback: fallback });
        return b;
    }
    var NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    function lcName(n) { n = String(n || ''); return /^[A-Z]{2}/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1); }
    // one fully worked line per engine: the set of lanes and kind of piece closest to its limit
    function rotorWorked(r, discName) {
        var best = null;
        Object.keys(r.calc.groups).sort().forEach(function (k) { var c = r.calc.groups[k]; Object.keys(c.models).forEach(function (mk) { var x = c.models[mk]; var score = x.limit != null ? x.share / x.limit : (x.share > 0 ? x.share * 1e-6 : -1); if (!best || score > best.score) best = { score: score, c: c, x: x, mk: mk }; }); });
        if (!best || !(best.x.share > 0)) return '**Worked example (engine ' + r.engine + ').** At no release angle does a single piece of any kind reach every lane of a set together, so every hazard ratio is 0%, within its limit.';
        var f = r.frags.filter(function (q) { return q.id === best.mk; })[0], x = best.x, names = best.c.names;
        var lanes = names.length === 2 ? 'both ' + names.join(' and ') : 'all of ' + _list(names);
        var others = Object.keys(best.c.byDisc || {}).filter(function (id) { return id !== x.discId; }).map(function (id) { var y = best.c.byDisc[id][best.mk]; return y ? 'on the ' + discName(id) + ' the share is ' + _share(y.share) : ''; }).filter(Boolean);
        var t = '**Worked example (engine ' + r.engine + ', ' + _fragLabel(f).toLowerCase() + ', ' + _list(names) + ').** On the ' + discName(x.discId) + ', one piece reaches ' + lanes + ' at release angles ' + _rangesWords(x.ranges) + ', measured around the disc from ' + _zeroWords(root.SLPraModels ? root.SLPraModels.rotor(x.discId) : null) + '. Together: ' + _d1(x.deg) + '°. Hazard ratio H = ' + _d1(x.deg) + '° / 360° = ' + (Math.round(x.share * 10000) / 10000) + ' (' + _share(x.share) + ', ' + _oneIn(x.share) + ').';
        if (x.limit != null) t += ' Limit for the ' + _fragLabel(f).toLowerCase() + ' (AC 20-128A para ' + FRAG_PARA[f.id] + '): ' + f.criterion + ' = ' + _share(x.limit) + '. ' + _share(x.share) + (x.share > x.limit + 1e-12 ? ' is above ' + _share(x.limit) + ': over the limit, so the lanes need a shield or a move (section 7).' : ' is no more than ' + _share(x.limit) + ': within the limit.');
        else t += ' AC 20-128A asks no number for small pieces (para 10c(5)): the lanes they can reach together need design precautions (section 7).';
        if (others.length) t += ' The worst disc counts: ' + _list(others) + '.';
        return t;
    }
    // the deciding point for a unit and a danger source of the other kinds (the same tests the risk uses)
    function _why(r, s, u) {
        if (r.kind === 'TIRE' || r.kind === 'FIRE') { var p = s.volume ? _volPoint(s.volume, u) : null; if (!p) return null; var sh = s.volume; return sh.kind === 'sphere' ? 'the point ' + _xyz(p) + ' of its box is ' + _n(_len(_sub(p, sh.center))) + ' mm from the center, within the ' + _n(sh.radius) + ' mm radius' : 'the point ' + _xyz(p) + ' of its box lies inside x ' + _n(sh.min[0]) + ' to ' + _n(sh.max[0]) + ', y ' + _n(sh.min[1]) + ' to ' + _n(sh.max[1]) + ', z ' + _n(sh.min[2]) + ' to ' + _n(sh.max[2]) + ' mm'; }
        var c = _center(u.bbox);
        if (r.kind === 'BIRD') { var bx = _boxOf(s.boxes || [], c); return bx ? 'the center of its box, ' + _xyz(c) + ', lies inside the slab behind ' + bx.code + (bx.name ? ' ' + bx.name : '') + ' (x ' + _n(bx.min[0]) + ' to ' + _n(bx.max[0]) + ' mm, ' + _n(bx.depth) + ' mm deep)' : null; }
        if (r.kind === 'LIGHT') { var sp = _nearOf(s.shapes || [], c); return sp ? 'the center of its box, ' + _xyz(c) + ', is ' + _n(_len(_sub(c, sp.center))) + ' mm from the attachment point at ' + _xyz(sp.center) + ', within ' + _n(sp.radius) + ' mm' : null; }
        return null;
    }
    function _srcShapeWords(r, s) {
        if (r.kind === 'BIRD') return _list((s.boxes || []).map(function (b) { return b.code; }).filter(function (c, i, a) { return a.indexOf(c) === i; })) + ': slabs ' + _list((s.boxes || []).map(function (b) { return _n(b.depth); }).filter(function (c, i, a) { return a.indexOf(c) === i; })) + ' mm deep behind the front face';
        return (s.shapes || []).map(function (sh) { return sh.kind === 'sphere' ? 'sphere of radius ' + _n(sh.radius) + ' mm around ' + _xyz(sh.center) : 'box x ' + _n(sh.min[0]) + ' to ' + _n(sh.max[0]) + ', y ' + _n(sh.min[1]) + ' to ' + _n(sh.max[1]) + ', z ' + _n(sh.min[2]) + ' to ' + _n(sh.max[2]) + ' mm'; }).join('; ');
    }
    // the calculations of a risk worked out from volumes, surfaces or attachment points: one table of the sources, one of
    // what each reaches by system, then one worked line and one picture per source
    function volumeCalcBlocks(r, res, fallbackOf) {
        var P = function (t) { return { k: 'p', text: t }; }, b = [], U0 = _unitById(res), srcs = r.sources || [];
        var noun = r.kind === 'TIRE' ? 'bogie' : r.kind === 'BIRD' ? 'group of surfaces' : r.kind === 'LIGHT' ? 'group of attachment points' : 'volume';
        b.push({ k: 'table', name: 'src-' + r.key, title: r.title + ': the danger sources', rows: srcs.map(function (s) { var us = s.hits.map(function (p) { return U0[p]; }).filter(Boolean); return { 'Danger source': s.label, 'Shape and size': _srcShapeWords(r, s), 'Units inside': String(us.length), 'Harness, tube and duct runs': s.runs.length ? s.runs.join(', ') : 'None', 'Systems inside': _list(s.systems.map(_sysName)) || 'None' }; }), lead: '{N} gives each danger source of the ' + r.title.toLowerCase() + ' (one per ' + noun + '), its shape and size, and what lies inside it.' });
        var rows = [];
        srcs.forEach(function (s) { _bySystem(s.hits.map(function (p) { return U0[p]; }).filter(Boolean)).forEach(function (x) { var o = {}; if (srcs.length > 1) o['Danger source'] = s.label; o.System = x.system; o.Units = x.units.join('; '); rows.push(o); }); });
        if (rows.length) b.push({ k: 'table', name: 'srcunits-' + r.key, title: r.title + ': the units each danger source reaches, by system', rows: rows, lead: '{N} names the units each danger source reaches, by system.' });
        // the sets of lanes of one job the risk reaches (the ones the choices in section 7 are about), and which source reaches them
        if ((r.groups || []).length) b.push({ k: 'table', name: 'srclanes-' + r.key, title: r.title + ': the lanes of one job within reach, and the danger sources that reach them', rows: r.groups.map(function (g) {
            var by = srcs.filter(function (s) { return g.members.some(function (m) { return m.some(function (p) { return s.pids[String(p)]; }); }); }), all = srcs.filter(function (s) { return g.members.every(function (m) { return m.some(function (p) { return s.pids[String(p)]; }); }); });
            return { 'Lanes of one job': g.names.join(', '), 'Reached by': _list(by.map(function (s) { return lcName(s.label); })) || 'None', 'All of them from one source': all.length ? 'Yes: ' + _list(all.map(function (s) { return lcName(s.label); })) : 'No: only from different sources together' }; }),
            lead: '{N} gives each set of lanes of one job the ' + r.title.toLowerCase() + ' reaches, which danger sources reach them and whether one source alone reaches them all. The choices in section 7 take the risk as a whole, which is the cautious reading.' });
        srcs.forEach(function (s) {
            var us = s.hits.map(function (p) { return U0[p]; }).filter(Boolean).sort(function (a, c) { return String(a.designator || a.name).localeCompare(String(c.designator || c.name), undefined, { numeric: true }); });
            var ex = null; us.some(function (u) { var w = _why(r, s, u); if (w) ex = { u: u, w: w }; return !!w; });
            b.push(P('**' + s.label + '.** ' + (ex ? 'Worked example: ' + label(ex.u) + ' is reached because ' + ex.w + '.' : 'Nothing on the CAD model lies inside it.')));
            b.push({ k: 'shotslot', view: 'src:' + r.key + ':' + s.id, fallback: fallbackOf(s) });
        });
        return b;
    }
    // the danger area of one source as a drawn figure, used where the 3D model cannot be drawn on this computer
    function srcFigure(r, s, C0, res) {
        var U0 = _unitById(res), us = r.kind === 'ROTOR' ? r.hits : s.hits.map(function (p) { return U0[p]; }).filter(Boolean);
        var f = U() && U().figure ? U().figure({ outline: _outline(), volumes: r.kind === 'ROTOR' ? r.shapes : s.shapes, marks: us.map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: '#2563EB' }; }) }, { width: 460 }) : null;
        if (!f) return null;
        var svg = f.svg; if (C0 && C0.paper !== '#ffffff') svg = svg.replace(/fill="#ffffff"/g, 'fill="' + C0.paper + '"').replace(/fill="#5b6270"/g, 'fill="' + C0.sub + '"');
        var t = (r.kind === 'ROTOR' ? r.title : r.title + ', ' + lcName(s.label)) + ': the danger area (red) and the units it reaches (blue), on the CAD model';
        return { k: 'fig', name: 'area-' + r.key + '-' + s.id, title: t, svg: svg, w: f.w, h: f.h, lead: '{N} shows where it reaches on the CAD model.' };
    }
    function calcBlocks(row, rs, ctx) {
        var b = [], res = compute(), k = _kindOf(rs);
        if (!rs.length) { b.push({ k: 'p', text: '**No danger area is computed for this risk.** The tool has no geometric model for this kind of risk on the CAD model, so nothing here is a number: the assessment is qualitative. Every zone recorded for it is taken as lost as a whole (all the equipment housed there and everything routed through it), the worst case; section 5 lists what that covers and section 6 what it takes out.' }); return b; }
        if (k === 'ROTOR') {
            b.push({ k: 'table', name: 'formulas-' + row.praId, title: 'The formulas the rotor burst calculations use', rows: rotorFormulas(rs[0]), lead: '{N} gives each formula in words and in symbols (R: disc radius to the blade roots, b: blade length, both from the disc numbers below).' });
            rs.forEach(function (r, i) { b = b.concat(rotorCalcBlocks(r, row, i + 1, srcFigure(r, (r.sources || [])[0] || { id: 'engine' }, ctx.C, res))); });
            return b;
        }
        rs.forEach(function (r) { b = b.concat(volumeCalcBlocks(r, res, function (s) { return srcFigure(r, s, ctx.C, res); })); });
        return b;
    }
    // the conclusion: what it takes out, whether continued safe flight and landing is kept, what protects it, what is open
    function conclusionBlocks(row, rs, dm, zones) {
        var P = function (t) { return { k: 'p', text: t }; }, b = [];
        var tripped = dm ? _arr(dm.tripped) : [], worst = null;
        tripped.forEach(function (f) { if (!worst || sevRank(f.severity) > sevRank(worst.severity)) worst = f; });
        if (!dm || !zones.length) b.push(P('**What it takes out.** Not worked out until the zones it reaches are recorded.'));
        else b.push(P('**What it takes out.** ' + (dm.directSystems.length ? _list(dm.directSystems.map(_sysName)) + (dm.knockOn.length ? ', and as a knock-on ' + _list(dm.knockOn.map(function (k) { return _nd(k.name) || _sysName(k.id); })) : '') + '.' : 'No system: nothing in its zones is traced to one.') + (worst ? ' The worst outcome is ' + fcLabel(worst.fcId) + ' (' + (SEV_WORD[worst.severity] || String(worst.severity || '').toLowerCase()) + ').' : ' No failure condition trips.')));
        var cat = tripped.filter(function (f) { return f.severity === 'Catastrophic'; }), ret = dm ? _arr(dm.retention) : [], notCarried = ret.filter(function (x) { return x.state !== 'accepted'; });
        // lanes and the engines (or none) they are named for, gathered so each set of lanes is named once
        var bag = function () { var m = {}, order = []; return { add: function (k, eng) { if (!m[k]) { m[k] = []; order.push(k); } if (eng && m[k].indexOf(eng) < 0) m[k].push(eng); }, list: function () { return order.map(function (k) { var e = m[k].sort(function (x, y) { return Number(x) - Number(y); }); return k + (e.length ? ' (engine' + (e.length > 1 ? 's ' : ' ') + _list(e) + ')' : ''); }); }, size: function () { return order.length; } }; };
        var over = bag(), within = bag(), chosen = bag(), toChoose = bag(), changes = bag();
        rs.forEach(function (r) { if (r.calc && r.calc.ready) Object.keys(r.calc.groups).forEach(function (k) { var c = r.calc.groups[k], nm = _list(c.names); if (c.status === 'fails') over.add(nm, r.engine); else if (c.status === 'meets' || c.status === 'clear') within.add(nm, r.engine); }); });
        var csfl = csflOf(row);
        if (csfl) b.push(P('**Continued safe flight and landing.** ' + _stop(csfl)));
        else if (!dm || !zones.length) b.push(P('**Continued safe flight and landing.** Not shown yet: the zones it reaches are not recorded.'));
        else if (!cat.length && !over.size()) b.push(P('**Continued safe flight and landing.** Kept: no catastrophic failure condition trips' + (worst ? '; the worst outcome is ' + (SEV_WORD[worst.severity] || '') + '.' : '.')));
        else if (!notCarried.length && !over.size()) b.push(P('**Continued safe flight and landing.** Kept with protection: ' + _list(cat.map(function (f) { return fcLabel(f.fcId); })) + ' can follow, and each is carried by an accepted zonal disposition.'));
        else b.push(P('**Continued safe flight and landing.** Not shown yet: ' + (notCarried.length ? _list(notCarried.map(function (x) { return fcLabel(x.fcId); })) + ' can follow and ' + (notCarried.length === 1 ? 'has' : 'have') + ' no accepted zonal disposition yet' : '') + (notCarried.length && over.size() ? '; and ' : '') + (over.size() ? 'one piece can reach ' + over.list().join('; ') + ' more often than AC 20-128A allows' : '') + '.'));
        var mit = mitigationOf(row); b.push(P('**Mitigation.** ' + (mit ? _stop(mit) : 'None recorded yet: the choices below and Edit say what protects against it.')));
        var seen = {}, noInputs = [];
        rs.forEach(function (r) {
            if (r.kind === 'ROTOR' && !r.inputsReady) noInputs.push(r.engine);
            r.questions.forEach(function (q) { if (seen[q.id]) return; seen[q.id] = 1; var o = optionOf(q), nm = _list(q.names || []); if (!o) toChoose.add(nm, r.engine); else if (o.status === 'open') changes.add(_stop(o.mitigation).replace(/\.$/, ''), r.engine); else chosen.add(lcFirstW(o.mitigation), null); });
        });
        var prot = [];
        if (within.size()) prot.push('Within the AC 20-128A limits: ' + within.list().join('; '));
        if (chosen.size()) prot.push('Chosen protection: ' + chosen.list().join('; '));
        var open = [];
        if (noInputs.length) open.push('The disc numbers for engine' + (noInputs.length > 1 ? 's ' : ' ') + _list(noInputs) + ', so the hazard ratio can be worked out');
        if (toChoose.size()) open.push('A choice of protection (shield, move' + (rs.some(function (r) { return r.kind !== 'ROTOR'; }) ? ' or accept' : '') + ') for the lanes one event reaches together: ' + toChoose.list().join('; '));
        if (changes.size()) open.push('Design changes still to be shown on the CAD model: ' + changes.list().join('; '));
        if (over.size() && !toChoose.size() && !changes.size() && !chosen.size()) open.push('A shield or a move for the lanes over the AC 20-128A limit: ' + over.list().join('; '));
        if (notCarried.length) open.push('An accepted zonal disposition for ' + _list(notCarried.map(function (x) { return fcLabel(x.fcId); })));
        b.push(P('**What protects it.** ' + (prot.length ? prot.join('. ') + '.' : 'Nothing beyond the mitigation above is recorded yet.')));
        b.push(P('**What remains open.** ' + (open.length ? open.join('. ') + '.' : 'Nothing: every choice is made and every catastrophic outcome is carried.')));
        if (row.minimization) b.push(P('**Why the remaining outcome is as small as it can be.** ' + row.minimization));
        return b;
    }
    function lcFirstW(s) { s = String(s || ''); return /^[A-Z]{2}|^[A-Z]-/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
    function _cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
    function _stop(s) { s = String(s || '').trim(); return /[.!?]$/.test(s) ? s : s + '.'; }
    function section(row, ctx) {
        var rs = _risksOf(row.praId), zones = zonesOf(row, rs), dm = _dyn(row.praId), b = [];
        var P = function (t, q) { var x = { k: 'p', text: t }; if (q) x.q = q; return x; };
        // 1. the risk and the question
        b.push({ k: 'part', text: '1. The risk and the question it answers' });
        b.push(P('**What it is.** ' + (row.threat || 'Not named yet') + '.'));
        var src = sourceOf(row, rs); b.push(P('**Where it comes from.** ' + (src || 'Not described yet: use Edit to say what happens and where it comes from.')));
        b.push(P('**The question.** ' + QUESTION[_kindOf(rs)]));
        // 2. method, 3. basis
        b.push({ k: 'part', text: '2. Method' });
        b = b.concat(methodBlocks(row, rs));
        b.push({ k: 'part', text: '3. Basis' });
        b.push(P('**Assessed against.** ' + standardOf(row) + '. Each step below names the rule or guidance behind it and its paragraph; the wording is ours, not the rule\'s.'));
        b.push({ k: 'table', name: 'basis-' + row.praId, title: 'The basis for each step of ' + row.praId + ' and its pass criterion', rows: basisRows(row, rs), lead: '{N} gives the rule or guidance behind each step and what passes.' });
        // 4. calculations
        b.push({ k: 'part', text: '4. Calculations' });
        b = b.concat(calcBlocks(row, rs, ctx));
        // 5. results: what it reaches
        b.push({ k: 'part', text: '5. Results: what it reaches' });
        b.push({ k: 'part', level: 2, text: '5.1 Zones it reaches' });
        b.push(P(zones.length ? _list(zones.map(zoneLabel)) + '.' : 'No zone is recorded for this risk yet: use Edit to tick the zones it reaches.'));
        b.push({ k: 'part', level: 2, text: '5.2 Equipment in those zones' });
        var eq = [];
        zones.forEach(function (z) { equipmentOf(z).forEach(function (e) { eq.push({ Zone: zoneLabel(z), System: e.system, 'Housed in the zone': e.housed.join('; ') || 'None', 'Routed through it': e.routed.join('; ') || 'None' }); }); });
        if (eq.length) b.push({ k: 'table', name: 'eq-' + row.praId, title: 'Equipment in the zones ' + row.praId + ' reaches, by system', rows: eq, lead: '{N} lists every unit housed in each zone and everything routed through it, by system.' });
        else b.push(P('No equipment is recorded in these zones yet (no CAD model, zone record or routing places any there).'));
        b.push({ k: 'part', level: 2, text: '5.3 Functions that equipment performs' });
        var fr = functionsOf(zones);
        if (fr.length) b.push({ k: 'table', name: 'fn-' + row.praId, title: 'Functions performed by the equipment in the zones ' + row.praId + ' reaches', rows: fr.map(function (f) { return { Function: fnLabel(f.subId), 'Owning system': f.sysId ? _sysName(f.sysId) : (f.shared && f.shared.length ? 'Shared by ' + _list(f.shared.map(_sysName)) : 'No system owns it yet'), 'Performed by': f.by.join('; '), Where: f.where.map(zoneLabel).join('; ') }; }), lead: '{N} lists each function that equipment performs, with the system that owns it.' });
        else b.push(P('No function is traced to the equipment in these zones yet.'));
        // 6. results: what is lost
        b.push({ k: 'part', text: '6. Results: what is lost' });
        if (!dm || !zones.length) b.push(P('Nothing is worked out until the zones are recorded.'));
        else {
            var down = _arr(dm.downSystems);
            b.push(P('**Systems lost directly.** ' + (dm.directSystems.length ? _list(dm.directSystems.map(_sysName)) + '.' : 'None: nothing in these zones is traced to a system.')));
            b.push(P('**Systems lost as a knock-on.** ' + (dm.knockOn.length ? _list(dm.knockOn.map(function (k) { return (_nd(k.name) || _sysName(k.id)) + ' (through ' + (_nd(k.from) || 'the cascade') + ')'; })) + '.' : 'None: no other system depends on what is lost.')));
            if (dm.tripped.length) b.push({ k: 'table', name: 'fc-' + row.praId, title: 'Failure conditions that trip when ' + row.praId + ' happens', rows: dm.tripped.map(function (f) { var br = dm.breaches.filter(function (x) { return x.fcs.some(function (y) { return y.fcId === f.fcId; }); }); return { 'Failure condition': fcLabel(f.fcId), Severity: f.severity || '', 'Why it trips': br.map(function (x) { return fnLabel(x.subId) + ' is no longer available'; }).join('; ') }; }), lead: '{N} lists the failure conditions that trip, with their severity.' });
            else b.push(P('**Failure conditions that trip.** None: every minimum aircraft configuration rule still holds.'));
            b.push(P('**Minimum aircraft configuration (MAC) rules that break.** ' + (dm.breaches.length ? dm.breaches.map(function (x) { return macWords(x, down); }).join('. ') + '.' : 'None.')));
            var lf = lossFigure(row, dm, ctx.C); if (lf) b.push(lf);
        }
        // 7. choices
        b.push({ k: 'part', text: '7. The choices made' });
        if (!rs.length) b.push(P('The PRA Autopilot does not work this kind of risk out on the CAD model; the assessment is the one written above (use Edit to change it).'));
        var seenQ = {};
        rs.forEach(function (r) {
            if (r.kind === 'ROTOR' && !r.inputsReady) { b.push(P('Not decided yet: nothing is asked for ' + r.title.toLowerCase() + ' until its disc numbers are in and the hazard ratio is worked out (section 4).')); return; }
            if (!r.questions.length) b.push(P(r.kind === 'ROTOR' ? 'Nothing to choose for ' + r.title.toLowerCase() + ': every set of lanes in reach is within the AC 20-128A limits or never reached together (section 4).' : 'Nothing to choose for ' + r.title.toLowerCase() + ': no two lanes of one job are reached together.'));
            r.questions.forEach(function (q) {
                if (seenQ[q.id]) return; seenQ[q.id] = 1;
                var o = optionOf(q);
                b.push(P(o ? q.text + ' Chosen: ' + o.label + '.' + (o.mitigation ? ' ' + o.mitigation + '.' : '') + (o.status === 'open' ? ' This stays open until the design change is shown.' : '') : 'Not decided yet: ' + q.text, q.id));
            });
        });
        // 8. retention
        b.push({ k: 'part', text: '8. Retention of catastrophic outcomes' });
        var ret = dm ? _arr(dm.retention) : [];
        if (!ret.length) b.push(P('No catastrophic outcome is reached by this risk on the model.'));
        ret.forEach(function (x) { b.push(P(fcLabel(x.fcId) + ': ' + retentionWords(x.state) + '.')); });
        // 9. conclusion
        b.push({ k: 'part', text: '9. Summary of results' });   // v2.6: what the tool works out; the conclusion itself is the engineer's (part 12)
        b = b.concat(conclusionBlocks(row, rs, dm, zones));
        // simulate, scenarios and model links (on the page only)
        if (zones.length) b.push({ k: 'act', label: 'Simulate this risk on the Cascading Effects page', onclick: 'ccaSimulate(' + JSON.stringify(zones.map(function (z) { return 'zone:' + z; })) + ')' });
        if (root.SLPraScenarios && row.internalId != null) b.push({ k: 'act', label: 'Scenarios for this risk', onclick: 'SLPraScenarios.open(' + JSON.stringify(row.internalId) + ')' });
        if (root.SLModelLinks && row.internalId != null) b.push({ k: 'act', label: 'Model links (zones, items, systems)', onclick: 'SLModelLinks.open(\'pra\',' + JSON.stringify(row.internalId) + ')' });
        return { id: row.praId, title: row.praId + ' ' + (row.threat || ''), tabLabel: { id: row.praId, name: row.threat || '' }, blocks: b };
    }
    function sections(ctx) {
        var out = _rowsSorted().map(function (row) { return section(row, ctx); });
        // a risk the Autopilot found with no PRA record: its own section, ready to be added
        var res = compute(), have = {}; _rowsSorted().forEach(function (r) { have[r.praId] = 1; });
        if (res) res.risks.filter(function (r) { return !r.praId || !have[r.praId]; }).forEach(function (r) {
            out.push({ id: 'ap:' + r.key, title: r.title + ' (found on the CAD model, no PRA record yet)', tabLabel: { id: '', name: r.title + ' (no record yet)' }, edit: false, blocks: [{ k: 'p', text: r.what + ' Use "Add a particular risk" to give it a PRA record so it is assessed like the others.' }] });
        });
        return out;
    }
    function front() {
        return [{ k: 'h', level: 1, text: 'Purpose and scope' },
            { k: 'p', text: 'This report records the particular risk analysis of ' + (_g('projectName') || 'the aircraft') + '. A particular risk is an event outside the systems that is taken as happening (a disc lets go, a tire bursts, a bird hits, lightning attaches): the analysis asks what it reaches and whether the aircraft can still fly and land safely.' },
            { k: 'p', text: 'Each section takes one particular risk and tells its whole story in the same order: the risk and the question the analysis answers; the method (how the danger area is built for that kind of risk and how a part is judged to be reached); the basis (the rule or guidance behind each step, with its paragraph, and the pass criterion); the calculations, for each danger source on its own (each engine, each bogie, each group of surfaces or attachment points), with the inputs, the formulas, the results, one fully worked example and a picture of that source from the 3D model in its own color; the results (the zones reached, the equipment housed and routed there, the functions it performs, what is lost directly and as a knock-on, the failure conditions that trip and the minimum aircraft configuration rules that break); the choices made where one event reaches lanes of the same job together; retention of each catastrophic outcome; and the conclusion.' },
            { k: 'h', level: 1, text: 'Method' },
            { k: 'p', text: 'Where the CAD model allows, the tool works each risk out on it: the rotor burst bands of AC 20-128A around each engine disc, the tire burst and fire volumes, the surfaces a bird can hit and the likely lightning attachment points. Everywhere, the zones are read with what they hold and what is routed through them, the items with the functions they perform, and the systems with their failure conditions. What is lost comes from the availability cascade between systems and the minimum aircraft configuration rules; an engineer makes every choice that is a real choice. Each section gives the method and the numbers for its own risk.' },
            { k: 'p', text: 'In the pictures from the 3D model each danger source has its own color, named in the caption (red, blue, teal and purple, then orange, sky blue, green and olive), chosen to stay apart for readers with the common forms of color blindness and in print. The parts a source reaches are drawn solid in charcoal, a color no source uses, and the rest of the aircraft is drawn faint gray.' }];
    }
    function _hashOf(v) { return _hash(JSON.stringify(v)); }
    var IO = {
        does: 'Takes each particular risk as happening and works out what it reaches, what is lost and what protects against it',
        inputs: [
            { id: 'cad', what: 'The CAD model, its zones and which part belongs to which system', from: 'the CAD Model page', tab: 'cad' },
            { id: 'zones', what: 'The zone list with what each zone houses', from: 'the zonal model and the ZSA', tab: 'zonal' },
            { id: 'routing', what: 'Harness, tube and duct runs and what they carry', from: 'the routing records', tab: 'routing' },
            { id: 'items', what: 'The items and the functions each performs', from: 'the Items page', tab: 'items' },
            { id: 'fha', what: 'The failure conditions and their severities', from: 'the aircraft and system FHAs', tab: 'ac-fha' },
            { id: 'mac', what: 'The minimum aircraft configuration rules', from: 'the PASA MAC model', tab: 'mac' },
            { id: 'rotor', what: 'Disc mass and top speed for each engine', from: 'the engine maker', tab: '' }
        ],
        outputs: [
            { id: 'pra.sections', what: 'A section for every particular risk: what it reaches, what is lost and what protects against it', to: 'the aircraft safety assessment (ASA)', tab: 'asa', role: 'Chief safety engineer',
                accept: 'Every particular risk that applies to the aircraft has its section, with its zones, equipment and functions named',
                fp: function () { return _hashOf(_rowsSorted().map(function (r) { return [r.praId, r.threat, _arr(r.affectedZones).slice().sort(), mitigationOf(r), sourceOf(r, _risksOf(r.praId))]; })); } },
            { id: 'pra.choices', what: 'A recorded choice (protect, move or accept) for every set of lanes one event reaches together', to: 'the design team and the system safety assessments', tab: 'pra', role: 'Aircraft safety lead',
                accept: 'No choice is left undecided, and every design change is closed or carried as an open item',
                fp: function () { var res = compute(); return _hashOf(res ? res.risks.map(function (r) { return r.questions.map(function (q) { var o = optionOf(q); return q.id + '=' + (o ? o.id : ''); }); }) : []); } },
            { id: 'pra.retention', what: 'Each catastrophic outcome carried by an accepted disposition', to: 'the zonal safety analysis (ZSA)', tab: 'zsa', role: 'Chief safety engineer',
                accept: 'Every catastrophic failure condition a particular risk reaches has an accepted zonal disposition',
                fp: function () { return _hashOf(_rowsSorted().map(function (r) { var d = _dyn(r.praId); return [r.praId, d ? d.retention : []]; })); } },
            { id: 'pra.reqs', what: 'Protection requirements for the shields, separation and qualification chosen', to: 'the system requirements and the common mode analysis (CMA)', tab: 'ac-req', role: 'System safety engineer',
                accept: 'Each shield, move or qualification chosen is written as a requirement on the system that carries it',
                fp: function () { return _hashOf(_rowsSorted().map(function (r) { return [r.praId, r.mitigation || '']; })); } }
        ]
    };
    function live(id) {
        var res = compute(), rows = _rowsSorted();
        if (id === 'self') { var q = 0, a = 0; if (res) res.risks.forEach(function (r) { var st = riskStatus(r); q += st.questions; a += st.answered; }); return rows.length + ' PRA records; ' + a + ' of ' + q + ' Autopilot questions answered'; }
        if (id === 'in:cad') { var CZ = C(), cid = CZ && CZ.latestCadId && CZ.latestCadId(); if (!cid) return 'No CAD model yet'; var m = CZ.model(cid) || {}; return ((CZ.partsOf ? CZ.partsOf(cid) : m.parts) || []).length + ' parts, ' + Object.keys(CZ.confirmed ? CZ.confirmed(cid) : {}).length + ' linked to systems'; }
        if (id === 'in:zones') return (root.ZONES ? root.ZONES.all().length : 0) + ' zones; ' + _arr(_g('zsaData')).length + ' zone records';
        if (id === 'in:routing') return _arr(_g('routingData')).length + ' routing records';
        if (id === 'in:items') return _arr(_g('itemsData')).length + ' items';
        if (id === 'in:fha') return _arr(_g('acFhaData')).length + ' aircraft failure conditions';
        if (id === 'in:mac') return _arr((_pc() || {}).macModels).length + ' MAC rules';
        if (id === 'in:rotor') return _arr((_pc() || {}).praRotors).length + ' discs entered';
        if (id === 'out:pra.choices') { var n = 0, d = 0; if (res) res.risks.forEach(function (r) { r.questions.forEach(function (x) { n++; if (optionOf(x)) d++; }); }); return d + ' of ' + n + ' choices made'; }
        if (id === 'out:pra.retention') { var op = 0, tot = 0; rows.forEach(function (r) { var dd = _dyn(r.praId); _arr(dd && dd.retention).forEach(function (x) { tot++; if (x.state !== 'accepted') op++; }); }); return op + ' of ' + tot + ' catastrophic outcomes without an accepted disposition'; }
        if (id === 'out:pra.sections') return rows.length + ' sections';
        if (/^z:/.test(id)) { var ix = _cadIndex(), z = id.slice(2); return ix ? (ix.units[z] || []).length + ' units on the CAD model' : 'No CAD model'; }
        return '';
    }
    function node(id) {
        if (/^z:/.test(id)) { var z = id.slice(2), eq = equipmentOf(z); return { title: zoneLabel(z), does: 'A zone this risk reaches.', inputs: eq.map(function (e) { return e.system + ': ' + (e.housed.concat(e.routed).join('; ') || 'nothing listed'); }), tab: 'zonal' }; }
        if (/^[sk]:/.test(id)) { var sid = id.slice(2), s = _sys(sid); return { title: _sysName(sid), does: id[0] === 's' ? 'Lost directly: equipment of this system is in a zone the risk reaches.' : 'Lost as a knock-on: it depends on a system that is lost.', inputs: _arr(s && s.functions).map(function (f) { return (f.traceIds || []).map(fnLabel).join(', ') + (f.funcName ? ' (' + f.funcName + ')' : ''); }), tab: 'sys-dir' }; }
        if (/^fc:/.test(id)) { var fid = id.slice(3), f = _fc(fid); return { title: fcLabel(fid), does: f ? 'Severity: ' + (f.severity || 'not classified') + '. ' + (f.effAc || '') : 'A failure condition.', outputs: [{ what: 'Retention: a catastrophic outcome needs an accepted zonal disposition', accept: 'An accepted disposition on the ZSA page' }], tab: 'ac-fha' }; }
        return { title: id };
    }
    // ---- Edit and Add: the fields the table held, written to praData with no duplicates ----------------------------------
    function _rowOf(praId) { return _arr(_g('praData')).find(function (r) { return r && r.praId === praId; }) || null; }
    function editFields(praId) {
        var row = praId ? _rowOf(praId) : null, own = _own(row);
        var Z = root.ZONES, zs = Z ? Z.all().filter(function (z) { return z && !z.parentId; }) : [];
        var zopts = zs.map(function (z) { return [z.code, z.code + ' ' + (z.name || '')]; });
        _arr(_g('zsaData')).forEach(function (x) { if (x && x.zoneId && !zopts.some(function (o) { return o[0] === x.zoneId; })) zopts.push([x.zoneId, x.zoneId + ' ' + (x.desc || '')]); });
        _arr(row && row.affectedZones).forEach(function (c) { if (!zopts.some(function (o) { return o[0] === c; })) zopts.push([c, c]); });
        zopts.sort(function (a, b) { return a[0].localeCompare(b[0], undefined, { numeric: true }); });
        var asm = _arr(_g('acAssumptionsData')).filter(function (a) { return a && (a.asmId || a.id); }).map(function (a) { return [a.asmId || a.id, (a.asmId || a.id) + ' ' + String(a.text || a.desc || a.statement || '').slice(0, 70)]; });
        var f = [
            { key: 'praId', label: 'PRA ID', type: 'text', value: row ? row.praId : _nextPraId(), hint: row && _managed(row) ? '(the Autopilot writes this record by its ID, so it stays)' : 'e.g. PRA-020' },
            { key: 'threat', label: 'The particular risk', type: 'text', value: row ? row.threat : '', hint: 'e.g. Tire burst' },
            { key: 'desc', label: 'What happens and where it comes from', type: 'textarea', value: row ? sourceOf(row, _risksOf(row.praId)) : '' },
            { key: 'standard', label: 'Assessed against', type: 'text', value: row && row.standard ? row.standard : '', hint: 'leave empty for: ' + standardOf(row || { threat: '' }) },
            { key: 'affectedZones', label: 'Zones it reaches', type: 'checks', value: row ? (own.affectedZones || row.affectedZones || []) : [], options: zopts },
            { key: 'csfl', label: 'Effect on continued safe flight and landing', type: 'text', value: row ? csflOf(row) : '' },
            { key: 'mitigation', label: 'Mitigation', type: 'textarea', value: row ? mitigationOf(row) : '' },
            { key: 'minimization', label: 'Why the remaining outcome is as small as it can be (needed where a catastrophic outcome cannot be designed out)', type: 'textarea', value: row ? (row.minimization || '') : '' },
            { key: 'systems', label: 'Notes on the systems and parts it reaches', type: 'text', value: row ? (own.systems || (_managed(row) ? (row.praTyped && row.praTyped.systems) || '' : row.systems || '')) : '' }
        ];
        if (asm.length) f.push({ key: 'assumptionIds', label: 'Assumptions this risk relies on', type: 'checks', value: row ? _arr(row.assumptionIds) : [], options: asm });
        return f;
    }
    function _nextPraId() { var mx = 0; _arr(_g('praData')).forEach(function (r) { var m = /^PRA-(\d+)$/.exec((r && r.praId) || ''); if (m) mx = Math.max(mx, +m[1]); }); return 'PRA-' + String(mx + 1).padStart(3, '0'); }
    function saveRisk(praId, v) {
        var rows = _rows(); if (!Array.isArray(rows)) return { ok: false, err: 'The PRA records are not loaded.' };
        var row = praId ? _rowOf(praId) : null; if (praId && !row) return { ok: false, err: praId + ' is no longer in the project.' };
        var id = String(v.praId || '').trim() || (row ? row.praId : _nextPraId()), threat = String(v.threat || '').trim();
        if (!threat) return { ok: false, err: 'Name the particular risk (for example: Tire burst).' };
        if (!/^[A-Za-z0-9][A-Za-z0-9._\-]{0,30}$/.test(id)) return { ok: false, err: 'A PRA ID is letters, digits and hyphens, for example PRA-020.' };
        if (row && _managed(row) && id !== row.praId) return { ok: false, err: 'The Autopilot writes ' + row.praId + ' by its ID, so the ID stays.' };
        var dupId = rows.find(function (r) { return r && r !== row && String(r.praId || '').toUpperCase() === id.toUpperCase(); });
        if (dupId) return { ok: false, err: id + ' is already a particular risk (' + (dupId.threat || '') + '). Edit that one instead.' };
        var dupT = rows.find(function (r) { return r && r !== row && String(r.threat || '').trim().toLowerCase() === threat.toLowerCase(); });
        if (dupT) return { ok: false, err: dupT.praId + ' already covers ' + dupT.threat + '. Edit that one instead.' };
        var zones = _arr(v.affectedZones).map(String).filter(function (z, i, a) { return z && a.indexOf(z) === i; });
        if (!row) { row = { internalId: _nextId(), praId: id, origin: 'pra-report' }; rows.push(row); }
        row.praId = id; row.threat = threat;
        row.standard = String(v.standard || '').trim() || undefined; if (!row.standard) delete row.standard;
        row.minimization = String(v.minimization || '').trim(); if (!row.minimization) delete row.minimization;
        if (v.assumptionIds !== undefined) row.assumptionIds = _arr(v.assumptionIds).map(String);
        var desc = String(v.desc || '').trim(), mit = String(v.mitigation || '').trim(), csfl = String(v.csfl || '').trim(), sysN = String(v.systems || '').trim();
        if (_managed(row) && _risksOf(row.praId).length) {
            row.praOwn = { desc: desc, mitigation: mit, csfl: csfl, systems: sysN, affectedZones: zones, by: U() ? U().who() : '', at: new Date().toISOString() };
            materialize(row.praId);
        } else { row.desc = desc; row.mitigation = mit; row.csfl = csfl; row.systems = sysN; row.affectedZones = zones; }
        forget(); if (U()) U().save();
        try { if (typeof root.renderPRA === 'function') root.renderPRA(); } catch (_) {}
        return { ok: true, id: row.praId };
    }
    function report() { var F = frame(); return F ? F.print() : false; }
    var ui = {
        // v2.1: opening a risk opens its tab (All risks for none), lit up
        risk: function (key) {
            state.risk = key || null; state.step = 0; var res = compute(), r = res && key ? res.byKey[key] : null; var F = frame(); if (!F) return;
            var sec = r ? secOf(r) : null;
            if (F.setTab) F.setTab(sec, { render: false });
            F.answered(sec ? 'sec:' + sec : null);
        },
        step: function (n) { state.step = n; render(); },
        pick: function (qid, opt) { answer(qid, opt); forget(); var F = frame(); if (F) F.answered(qid); },
        sign: function (key) { sign(key); forget(); render(); },
        next: function () { var res = compute(); if (!res) return; var i = res.risks.findIndex(function (r) { return r.key === state.risk; }); var nx = res.risks.slice(i + 1).concat(res.risks.slice(0, i + 1)).find(function (r) { return riskStatus(r).state !== 'done'; }); ui.risk(nx ? nx.key : null); },
        report: report,
        editInputs: function (key) { state.editInputs = key; render(); },
        alternate: function (on) { _store().settings.alternate = !!on; _cache = null; forget(); U().save(); render(); },
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
            state.inputError = null; state.editInputs = null; _cache = null; forget();
            U().save(); materialize(r.praId); state.step = 0; var F = frame(); if (F) F.answered(r.praId ? 'sec:' + r.praId : null); else render();
            return true;
        }
    };
    // the PRA page on the shared frame
    function define() {
        if (!root.SLCcaReport || frame()) return !!frame();
        // the table's filter bar has no table to filter on this page any more
        try { if (typeof document !== 'undefined' && !document.getElementById('pra-page-style')) { var st = document.createElement('style'); st.id = 'pra-page-style'; st.textContent = '#view-pra > .generic-filter-bar{display:none !important}'; document.head.appendChild(st); } } catch (_) {}
        root.SLCcaReport.define({
            key: 'pra', viewId: 'view-pra', leftId: 'pra-auto-host', title: 'Particular Risk Assessment', code: 'PRA', sectionsTitle: 'The particular risks',
            lead: 'Each particular risk has its own report. Pick one in the list below: its Autopilot questions are on the left and its report on the right (what it reaches, the method, the basis, the calculations, what is lost and what protects against it), with its own document number, revisions and Word file. All risks (register) lists every report.',
            front: front, sections: function (ctx) { return sections(ctx); }, renderQuestions: function (R, tab) { return _leftHtml(tab || null); },
            // v2.6 (9 Nov 2026): the parts the engineer writes, or drafts with the AI and accepts (not deterministic)
            authored: [
                { id: 'mitigations', title: '10. Proposed mitigations', purpose: 'Propose the design or installation changes that would protect against what this risk takes out. For each catastrophic outcome or set of lanes still open, say what would separate, shield, move or qualify it, and what that changes. Use only what this report records.' },
                { id: 'compliance', title: '11. Path to compliance', purpose: 'Set out how compliance will be shown for this risk: the rule and guidance it is assessed against (see Basis), the analysis, test or inspection that will show each protection works, the evidence still needed, and who reviews it. Never state that anything is compliant.' },
                { id: 'conclusion', title: '12. Conclusion', purpose: 'State what this assessment concludes: what the risk can take out, whether continued safe flight and landing is shown to survive it with the protections recorded, and what remains open before the risk can be closed.' }
            ],
            aiType: 'PRA',
            tabs: { allLabel: 'All risks (register)', noun: 'risk', nounTitle: 'Particular risk', pickLabel: 'Particular risk', registerTitle: 'Particular risk reports' },
            edit: { addLabel: 'Add a particular risk', fields: editFields, save: saveRisk },
            io: IO, live: live, node: node, onShow: function () { _cache = null; forget(); },
            shots: function (id) { id = String(id || ''); return id.indexOf('ap:') === 0 ? { kind: 'pra', riskKey: id.slice(3) } : { kind: 'pra', praId: id }; }
        });
        return true;
    }
    if (typeof document !== 'undefined') { var tries = 40, t = setInterval(function () { if (define() || --tries <= 0) clearInterval(t); }, 250); define(); }
    root.SLPraAuto = { VERSION: VERSION, FRAG: FRAG, compute: function () { return compute(); }, riskStatus: riskStatus, answer: answer, sign: sign, materialize: materialize, report: report, figures: figures, render: render, ui: ui, state: state,
        reset: function () { _cache = null; forget(); }, sections: function (ctx) { return sections(ctx || { C: root.SLCcaReport ? root.SLCcaReport.LIGHT : {} }); }, saveRisk: saveRisk, editFields: editFields, secOf: secOf, standardOf: standardOf, equipmentOf: equipmentOf, functionsOf: functionsOf, forget: forget,
        prefill: prefill, saveRotor: saveRotor, rotorId: rotorId, mergeRanges: mergeRanges };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLPraAuto;
})(typeof window !== 'undefined' ? window : globalThis);

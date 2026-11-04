// zsa_autopilot.js (SLZsaAuto v1.0, 4 Nov 2026): the ZSA Autopilot on the ZSA page.
//
// Waqas: "Put PRAs in the PRA, ZSAs in the ZSA, with same interface as Sys Lab but make the inputs more intuitive like
// CMAs in safety lab"; "think about it similarly to how we built the planning auto pilot"; "the interface should be so
// intuitive my 10 year old daughter should be able to do it".
//
// The tool works the zonal analysis out from the CAD model first (cad_zonal.js: which part sits in which zone, the
// links from parts to systems, the risk volumes), zone by zone:
//   · what is in the zone (units, harness, tube and duct runs, by system), and how bad losing it is (the worst
//     failure condition of each system, from its FHA);
//   · the real choices only, each one question on its own screen with a picture that lights up the parts:
//       LEAK      a fluid unit or line above an electronic unit of a system whose loss matters;
//       TOGETHER  two lanes of the same function in the same zone (one fire, leak or burst could take both);
//       HOT       a hot duct or unit close to a fuel or hydraulic line or unit;
//       DRAIN     a zone with fuel or hydraulic fluid in it: where a leak goes;
//     every answer says before it is picked what it changes (an open design change, a mitigation that closes the
//     finding, or an acceptance with its reason), and the zone's row in the ZSA table is written from the answers;
//   · particular risks that reach the zone are named and left to the PRA, not asked twice;
//   · the zone is signed when every question is answered; the report is written from the same record.
// Answers: projectConfig.zsaAuto = { v:1, answers: { qid: { pick, by, at } }, signed: { zoneCode: { by, at } } }.
// The ZSA table rows are adopted, never duplicated: the row for a zone code is updated in place (what it said before
// is kept in row.zsaTyped), a zone without a row gets one (origin 'zsa-autopilot').
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var M = 1000;   // millimeters per meter
    function U() { return root.SLAutopilotUI; }
    function C() { return root.SLCadZonal; }
    function Z() { return root.ZONES; }
    function _g(n) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
    function _pc() { return _g('projectConfig') || {}; }
    function _arr(a) { return Array.isArray(a) ? a : []; }
    function _store() { var pc = _pc(); var s = pc.zsaAuto; if (!s || typeof s !== 'object') s = pc.zsaAuto = { v: 1, answers: {}, signed: {} }; s.answers = s.answers || {}; s.signed = s.signed || {}; return s; }
    var SEV = ['No Safety Effect', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];
    function sevRank(s) { var i = SEV.indexOf(String(s || '')); return i < 0 ? -1 : i; }

    // ---- the systems: their worst failure condition --------------------------------------------------------
    function _sys(id) { return _arr(_g('systemsData')).find(function (s) { return s && s.id === id; }) || null; }
    function worstOf(sysIds) {
        var best = null;
        _arr(sysIds).forEach(function (id) {
            var s = _sys(id); if (!s) return;
            _arr(s.fha).forEach(function (f) { if (!best || sevRank(f.severity) > sevRank(best.severity)) best = { severity: f.severity, fc: f.fcDesc || f.fcId || '', fcId: f.fcId || '', sysId: id, sysName: s.name }; });
        });
        return best;
    }

    // ---- what each part is ---------------------------------------------------------------------------------
    var RUN_KIND = { 'WIRING': 'wire', 'HYDRAULIC LINES': 'hydraulic', 'FUEL LINES': 'fuel', 'BLEED DUCTS': 'bleed', 'OXYGEN LINES': 'oxygen', 'WATER LINES': 'water' };
    function classify(p, sysId) {
        var path = _arr(p.path).map(String), name = String(p.name || ''), lname = name.toLowerCase(), sys = String(sysId || '');
        if (path.indexOf('STRUCTURE') >= 0) return { kind: 'structure' };
        var rk = null; path.forEach(function (s) { if (RUN_KIND[s.toUpperCase()]) rk = RUN_KIND[s.toUpperCase()]; });
        if (path.indexOf('ROUTING') >= 0 || /^(harness|tube|duct|pipe|hose)\b/i.test(name)) {
            if (!rk) rk = /duct/i.test(name) ? 'bleed' : /harness|cable/i.test(name) ? 'wire' : 'hydraulic';
            return { kind: 'route', fluid: (rk === 'fuel' || rk === 'hydraulic') ? rk : null, hot: rk === 'bleed', run: path[path.length - 1] || name, routeKind: rk };
        }
        var fluid = null;
        var elec = /computer|\bunit\b|controller|electronics|display|sensor|module|indicat|probe|monitor|detector|panel|switch/.test(lname) && !/pump|motor pump/.test(lname);
        if (!elec && (/fuel/.test(lname) || sys === 'sys-fue')) fluid = /pump|tank|valve|filter|gallery|\bline|fuel/.test(lname) ? 'fuel' : null;
        if (!fluid && !elec && (/^sys-hyd/.test(sys) || /hydraulic/.test(lname))) fluid = /pump|reservoir|accumulator|valve|filter|actuator|hydraulic/.test(lname) ? 'hydraulic' : null;
        if (!fluid && /\boil tank\b|\boil\b/.test(lname)) fluid = 'oil';
        if (!fluid && !elec && /reservoir|accumulator/.test(lname)) fluid = 'hydraulic';
        var hot = /^engine \d|bleed|precooler|\bapu\b|auxiliary power unit|brake unit|heat exchanger|\bpack\b|air turbine starter|start air valve/.test(lname);
        var electronic = !fluid && /computer|\bunit\b|controller|control unit|electronics|display|sensor|module|receiver|transmitter|panel|battery|\bbus\b|contactor|relay|switch|fadec|terminal|monitor|recorder|radio|transceiver|cabinet|camera|probe|indicat|detector|gcu|\bacu\b|\bace\b/.test(lname);
        return { kind: 'unit', fluid: fluid, hot: hot, electronic: electronic };
    }
    // two parts that are lanes, channels or sides of the same thing: the name with the lane taken out is the same
    function laneKey(name) {
        var n = String(name || '').toLowerCase();
        var k = n.replace(/\b(lane|channel|system|side|no\.?)\s*[a-d1-4]\b/g, '#').replace(/\b(left|right|forward|aft|inboard|outboard|upper|lower)\b/g, '#').replace(/\b[a-d]\b|\b[1-4]\b/g, '#').replace(/\s+/g, ' ').trim();
        return k === n ? null : k;
    }
    // what a person calls a unit: its name, and its designator when copies share the name
    function label(u) { return u.designator && u.designator !== u.name ? u.name + ' (' + u.designator + ')' : u.name; }
    function _center(b) { return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; }
    function _xyOverlap(a, b, g) { return a.min[0] - g < b.max[0] && b.min[0] - g < a.max[0] && a.min[1] - g < b.max[1] && b.min[1] - g < a.max[1]; }
    function _dist(a, b) { var D = C() && C().boxDistance; if (D) return D(a, b); var s = 0; for (var i = 0; i < 3; i++) { var g = Math.max(0, a.min[i] - b.max[i], b.min[i] - a.max[i]); s += g * g; } return Math.sqrt(s); }
    function _m(mm) { return (Math.round(mm / 100) / 10).toFixed(1) + ' m'; }
    function _hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

    // ---- the analysis, worked out from the model -----------------------------------------------------------
    // Returns null when there is no CAD model or zone list yet (the page says what to do first).
    var _cache = null;
    function compute() {
        var CZ = C(), ZZ = Z(); if (!CZ || !ZZ) return null;
        var cadId = CZ.latestCadId && CZ.latestCadId(); if (!cadId) return null;
        var m = CZ.model(cadId); if (!m) return null;
        var parts = (CZ.partsOf ? CZ.partsOf(cadId) : m.parts) || [];
        var key = cadId + '|' + parts.length + '|' + JSON.stringify(_pc().cadLinks ? Object.keys(_pc().cadLinks).length : 0) + '|' + ZZ.all().length;
        if (_cache && _cache.key === key) return _cache.res;
        var byPid = {}; parts.forEach(function (p) { byPid[p.pid] = p; });
        var links = CZ.confirmed ? CZ.confirmed(cadId) : {};
        var ct = CZ.containment(cadId);
        var zoneOfPid = {}; ct.parts.forEach(function (r) { if (r.zoneId) zoneOfPid[r.pid] = r.zoneId; });
        // the analysis zones: the top zones (the ZSA table's rows); a part in a side zone counts in its top zone
        var all = ZZ.all().filter(function (z) { return z && z.volume; });
        var top = {}; all.forEach(function (z) { var t = z; var guard = 0; while (t && t.parentId && guard++ < 20) t = ZZ.get(t.parentId); top[z.id] = t ? t.id : z.id; });
        var zones = all.filter(function (z) { return !z.parentId; }).sort(function (a, b) { return String(a.code).localeCompare(String(b.code), undefined, { numeric: true }); });
        var res = { cadId: cadId, zones: [], byCode: {} };
        var vols = CZ.riskVolumes ? CZ.riskVolumes() : [];
        var volHits = {}; vols.forEach(function (v) { (CZ.partsInVolume(v.id, cadId) || []).forEach(function (h) { var z = zoneOfPid[h.pid]; if (!z) return; var t = top[z]; (volHits[t] = volHits[t] || {})[v.id] = v; }); });
        zones.forEach(function (z) {
            var pids = Object.keys(zoneOfPid).filter(function (pid) { return top[zoneOfPid[pid]] === z.id; }).sort();
            var units = [], runs = {}, sysSet = {};
            pids.forEach(function (pid) {
                var p = byPid[pid]; if (!p) return;
                var sysId = links[pid] || null, k = classify(p, sysId);
                if (k.kind === 'structure') return;
                if (sysId) sysSet[sysId] = 1;
                var rec = { pid: pid, name: p.name, designator: p.designator || '', sysId: sysId, sysName: sysId && _sys(sysId) ? _sys(sysId).name : (_arr(p.path)[2] || ''), bbox: p.bbox, k: k, side: zoneOfPid[pid] !== z.id ? (ZZ.get(zoneOfPid[pid]) || {}).code : '' };
                if (k.kind === 'route') { var r = runs[k.run] || (runs[k.run] = { run: k.run, kind: k.routeKind, fluid: k.fluid, hot: k.hot, parts: [], bbox: null }); r.parts.push(rec); r.bbox = r.bbox ? { min: r.bbox.min.map(function (v, i) { return Math.min(v, p.bbox.min[i]); }), max: r.bbox.max.map(function (v, i) { return Math.max(v, p.bbox.max[i]); }) } : { min: p.bbox.min.slice(), max: p.bbox.max.slice() }; }
                else units.push(rec);
            });
            var zr = { id: z.id, code: z.code, name: z.name, box: z.volume && z.volume.kind === 'box' ? { min: z.volume.min, max: z.volume.max } : null, units: units, runs: Object.keys(runs).sort().map(function (k) { return runs[k]; }), systems: Object.keys(sysSet).sort(), questions: [], risks: Object.keys(volHits[z.id] || {}).sort().map(function (id) { return volHits[z.id][id]; }) };
            zr.worst = worstOf(zr.systems);
            _questions(zr);
            res.zones.push(zr); res.byCode[z.code] = zr;
        });
        _cache = { key: key, res: res };
        return res;
    }
    function _mattersSys(sysId) { var w = worstOf([sysId]); return w && sevRank(w.severity) >= 2 ? w : null; }   // Major or worse
    function _questions(z) {
        var Q = z.questions, seen = {};
        var fluidUnits = z.units.filter(function (u) { return u.k.fluid; }), fluidRuns = z.runs.filter(function (r) { return r.fluid; });
        // LEAK: a fluid unit or line above an electronic unit whose system's loss matters (one question per unit)
        z.units.filter(function (v) { return v.k.electronic && v.sysId && _mattersSys(v.sysId); }).forEach(function (v) {
            var src = [];
            fluidUnits.forEach(function (s) { if (s.pid !== v.pid && s.bbox.min[2] >= v.bbox.max[2] - 50 && s.bbox.min[2] - v.bbox.max[2] < 2000 && _xyOverlap(s.bbox, v.bbox, 300)) src.push({ name: s.name, bbox: s.bbox, fluid: s.k.fluid }); });
            fluidRuns.forEach(function (r) { r.parts.forEach(function (s) { if (s.bbox.min[2] >= v.bbox.max[2] - 50 && s.bbox.min[2] - v.bbox.max[2] < 2000 && _xyOverlap(s.bbox, v.bbox, 300) && !src.some(function (x) { return x.run === r.run; })) src.push({ name: (r.fluid === 'fuel' ? 'fuel line ' : 'hydraulic line ') + r.run, bbox: s.bbox, fluid: r.fluid, run: r.run }); }); });
            if (!src.length) return;
            var w = _mattersSys(v.sysId), fl = src[0].fluid, names = src.slice(0, 3).map(function (s) { return s.name; });
            var id = 'leak:' + z.code + ':' + _hash(v.pid);
            if (seen[id]) return; seen[id] = 1;
            Q.push({ id: id, rule: 'LEAK', zone: z.code,
                text: 'Could a ' + fl + ' leak from ' + names.join(', ') + ' drip onto ' + label(v) + '?',
                why: 'The ' + fl + ' ' + (src.length === 1 ? 'source sits' : 'sources sit') + ' above ' + U().E(v.name) + ' (' + U().E(v.sysName) + '). If it stops working, the worst outcome is <b>' + U().E(w.fc) + '</b> (' + U().E(w.severity) + ').',
                marks: [{ min: v.bbox.min, max: v.bbox.max, color: '#2563EB', label: v.name }].concat(src.slice(0, 3).map(function (s) { return { min: s.bbox.min, max: s.bbox.max, color: '#DC2626', label: s.name }; })),
                legend: [['#2563EB', v.name], ['#DC2626', 'the ' + fl + ' above it']],
                options: [
                    { id: 'shield', label: 'Yes, so a drip shield goes over it', status: 'mitigated', mitigation: 'Drip shield over ' + v.name + ' against ' + fl + ' from ' + names.join(', '), impact: 'Adds the drip shield as a mitigation in this zone\'s ZSA row. This finding closes.' },
                    { id: 'move', label: 'Yes, so one of them moves', status: 'open', mitigation: 'Design change: move ' + v.name + ' or the ' + fl + ' source so nothing is above it', impact: 'Records a design change. The finding stays open in the ZSA until the CAD model shows them apart.' },
                    { id: 'sealed', label: 'No, the unit is sealed against fluid', status: 'accepted', mitigation: v.name + ' is drip-proof (DO-160 Section 10, fluid susceptibility); accepted', impact: 'Accepts the finding with that reason. The proof (the unit\'s DO-160 qualification) is listed as needed evidence.' }
                ] });
        });
        // TOGETHER: lanes, channels or copies of the same thing in the same zone (the same system, the same name once the
        // lane is taken out, or the same part under another designator)
        var lanes = {};
        z.units.filter(function (u) { return u.sysId; }).forEach(function (u) { var k = laneKey(u.name) || u.name.toLowerCase(); (lanes[u.sysId + '|' + k] = lanes[u.sysId + '|' + k] || []).push(u); });
        Object.keys(lanes).sort().forEach(function (k) {
            var g = lanes[k].slice().sort(function (a, b) { return String(a.designator || a.name).localeCompare(String(b.designator || b.name), undefined, { numeric: true }); });
            if (g.length < 2) return;
            var w = worstOf([g[0].sysId]); if (!w || sevRank(w.severity) < 2) return;
            var d = Infinity, pa = g[0], pb = g[1];
            for (var i = 0; i < g.length; i++) for (var j = i + 1; j < g.length; j++) { var dd = _dist(g[i].bbox, g[j].bbox); if (dd < d) { d = dd; pa = g[i]; pb = g[j]; } }
            var far = d >= 1000, names = g.map(label), all = g.length === 2 ? 'both ' + names.join(' and ') : 'all ' + g.length + ': ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
            var id = 'together:' + z.code + ':' + _hash(g.map(function (u) { return u.pid; }).join('|'));
            var opts = [];
            if (far) opts.push({ id: 'apart', label: 'Yes, ' + _m(d) + ' apart is enough', status: 'accepted', mitigation: names.join(', ') + ': at least ' + _m(d) + ' apart (measured in the CAD model); separation accepted', impact: 'Accepts the separation measured in the CAD model. The distance is written into the ZSA row as the evidence.' });
            opts.push({ id: 'wall', label: 'Yes, a wall (barrier) is between them', status: 'mitigated', mitigation: 'Barrier between ' + names.join(', '), impact: 'Adds the barrier as a mitigation. The barrier then has to be shown in the design (its substantiation is listed as needed evidence).' });
            opts.push({ id: 'move', label: 'No, one of them moves to another zone', status: 'open', mitigation: 'Design change: move ' + label(pb) + ' out of ' + z.code, impact: 'Records a design change. The finding stays open until the CAD model shows them in different zones.' });
            if (!far) opts.push({ id: 'accept', label: 'Losing ' + (g.length === 2 ? 'both' : 'all of them') + ' is acceptable here', status: sevRank(w.severity) >= 3 ? 'open' : 'accepted', mitigation: 'Loss of ' + (g.length === 2 ? 'both' : 'all') + ' accepted: ' + w.fc + ' (' + w.severity + ')', impact: sevRank(w.severity) >= 3 ? 'Losing them leads to ' + w.fc + ' (' + w.severity + '), so this cannot simply be accepted: the finding stays open for a common mode review (CMA).' : 'Accepts losing them, which leads to ' + w.fc + ' (' + w.severity + ').' });
            var colors = ['#2563EB', '#7C3AED', '#0D9488', '#DB2777'];
            Q.push({ id: id, rule: 'TOGETHER', zone: z.code,
                text: 'One fire, leak or burst here could stop ' + all + '. Are they kept apart?',
                why: 'They do the same job in ' + U().E(z.code) + '; the closest two are ' + _m(d) + ' apart. Losing them: <b>' + U().E(w.fc) + '</b> (' + U().E(w.severity) + ').',
                marks: g.slice(0, 4).map(function (u, i) { return { min: u.bbox.min, max: u.bbox.max, color: colors[i], label: label(u) }; }),
                legend: g.slice(0, 4).map(function (u, i) { return [colors[i], label(u)]; }),
                options: opts });
        });
        // HOT: a hot duct or unit close to fuel or hydraulic fluid
        var hot = z.units.filter(function (u) { return u.k.hot; }).map(function (u) { return { name: u.name, bbox: u.bbox, key: u.pid }; })
            .concat((function () {   // the bleed ducts in the zone count as one hot source
                var hr = z.runs.filter(function (r) { return r.hot; }); if (!hr.length) return [];
                var ps = [].concat.apply([], hr.map(function (r) { return r.parts; }));
                return [{ name: 'bleed ' + (hr.length === 1 ? 'duct ' + hr[0].run : 'ducts (' + hr.map(function (r) { return r.run; }).join(', ') + ')'), bbox: hr[0].bbox, key: 'bleed|' + hr.map(function (r) { return r.run; }).join('|'), parts: ps }];
            })());
        var wet = fluidUnits.map(function (u) { return { name: u.name, bbox: u.bbox, key: u.pid, fluid: u.k.fluid }; })
            .concat(fluidRuns.map(function (r) { return { name: r.fluid + ' line ' + r.run, bbox: r.bbox, key: r.run, fluid: r.fluid, parts: r.parts }; }));
        // one question per hot source, naming the fuel and hydraulic parts within 0.3 m of it
        hot.forEach(function (h) {
            var near = [];
            wet.forEach(function (f) {
                if (h.key === f.key || (f.fluid !== 'fuel' && f.fluid !== 'hydraulic')) return;
                var d = Infinity, pa = h.bbox, pb = f.bbox;
                (h.parts || [{ bbox: h.bbox }]).forEach(function (x) { (f.parts || [{ bbox: f.bbox }]).forEach(function (y) { var dd = _dist(x.bbox, y.bbox); if (dd < d) { d = dd; pa = x.bbox; pb = y.bbox; } }); });
                if (d <= 300) near.push({ f: f, d: d, pa: pa, pb: pb });
            });
            if (!near.length) return;
            near.sort(function (a, b) { return a.d - b.d || String(a.f.name).localeCompare(String(b.f.name)); });
            var id = 'hot:' + z.code + ':' + _hash(h.key);
            if (seen[id]) return; seen[id] = 1;
            var fls = {}; near.forEach(function (n) { fls[n.f.fluid] = 1; }); var flTxt = Object.keys(fls).sort().join(' and ');
            var names = near.slice(0, 3).map(function (n) { return n.f.name; }), more = near.length > 3 ? ' and ' + (near.length - 3) + ' more' : '';
            Q.push({ id: id, rule: 'HOT', zone: z.code,
                text: 'The ' + h.name + ' is close to ' + flTxt + ' (' + names.join(', ') + more + '). What stops its heat reaching the ' + flTxt + '?',
                why: 'The nearest is ' + _m(near[0].d) + ' away. Hot air or a hot surface next to ' + U().E(flTxt) + ' is how a leak becomes a fire.',
                marks: [{ min: near[0].pa.min, max: near[0].pa.max, color: '#EA580C', label: h.name }].concat(near.slice(0, 3).map(function (n) { return { min: n.pb.min, max: n.pb.max, color: '#DC2626', label: n.f.name }; })),
                legend: [['#EA580C', h.name], ['#DC2626', flTxt + ' near it']],
                options: [
                    { id: 'insulate', label: 'Insulation and a leak or overheat detector', status: 'mitigated', mitigation: 'Insulation on ' + h.name + ' and overheat (duct leak) detection next to the ' + flTxt, impact: 'Adds both as mitigations in the ZSA row. This finding closes.' },
                    { id: 'move', label: 'Move them further apart', status: 'open', mitigation: 'Design change: separate ' + h.name + ' from the ' + flTxt, impact: 'Records a design change. The finding stays open until the CAD model shows more distance.' },
                    { id: 'cool', label: 'It never gets hot enough to ignite ' + flTxt, status: 'accepted', mitigation: h.name + ' surface temperature stays below the ' + flTxt + ' autoignition temperature; accepted', impact: 'Accepts the finding. The temperature proof (test or analysis) is listed as needed evidence.' }
                ] });
        });
        // DRAIN: fuel or hydraulic fluid in the zone
        var fl = {}; fluidUnits.forEach(function (u) { fl[u.k.fluid] = 1; }); fluidRuns.forEach(function (r) { fl[r.fluid] = 1; });
        var kinds = Object.keys(fl).filter(function (k) { return k === 'fuel' || k === 'hydraulic'; }).sort();
        if (kinds.length && z.box) {
            Q.push({ id: 'drain:' + z.code, rule: 'DRAIN', zone: z.code,
                text: 'If ' + kinds.join(' or ') + ' leaks in this zone, where does it go?',
                why: 'There is ' + kinds.join(' and ') + ' in ' + U().E(z.code) + ' (' + (fluidUnits.length + fluidRuns.length) + ' units and lines). A leak that pools can reach a hot or electrical part.',
                marks: fluidUnits.slice(0, 8).map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: '#DC2626', label: u.name }; }),
                legend: [['#DC2626', 'fluid units in the zone']],
                options: [
                    { id: 'drain', label: 'It drains overboard through a drain path', status: 'mitigated', mitigation: 'Zone drainage overboard for ' + kinds.join(' and '), impact: 'Adds zone drainage as a mitigation. The drain path is listed as needed evidence (drawing or test).' },
                    { id: 'shroud', label: 'The lines have a shroud that catches it', status: 'mitigated', mitigation: 'Shrouded ' + kinds.join(' and ') + ' lines with a drain to a safe place', impact: 'Adds the shroud as a mitigation.' },
                    { id: 'pools', label: 'It would pool in the zone', status: 'open', mitigation: 'Design change: add drainage or ventilation in ' + z.code, impact: 'Records a design change. The finding stays open.' }
                ] });
        }
    }

    // ---- answers and status --------------------------------------------------------------------------------
    function answerOf(qid) { return _store().answers[qid] || null; }
    function optionOf(q) { var a = answerOf(q.id); if (!a) return null; return q.options.find(function (o) { return o.id === a.pick; }) || null; }
    function zoneStatus(z) {
        var n = z.questions.length, answered = 0, open = 0;
        z.questions.forEach(function (q) { var o = optionOf(q); if (o) { answered++; if (o.status === 'open') open++; } });
        var signed = _store().signed[z.code] || null;
        var state = answered < n ? 'todo' : (open ? 'open' : (signed ? 'done' : 'ready'));
        return { questions: n, answered: answered, open: open, signed: signed, state: state };
    }
    function answer(qid, pick) {
        var res = compute(); if (!res) return false;
        var q = null; res.zones.some(function (z) { q = z.questions.find(function (x) { return x.id === qid; }) || null; return !!q; });
        if (!q || !q.options.some(function (o) { return o.id === pick; })) return false;
        _store().answers[qid] = { pick: pick, by: U().who(), at: new Date().toISOString() };
        // a changed answer reopens a signed zone
        if (_store().signed[q.zone]) delete _store().signed[q.zone];
        materialize(q.zone);
        U().save();
        return true;
    }
    function sign(code) {
        var res = compute(); var z = res && res.byCode[code]; if (!z) return false;
        var st = zoneStatus(z); if (st.state !== 'ready') return false;
        _store().signed[code] = { by: U().who(), at: new Date().toISOString() };
        materialize(code); U().save();
        return true;
    }

    // ---- the ZSA table: one row per zone, adopted --------------------------------------------------------
    function _rows() { return _g('zsaData'); }
    function _nextId() { try { if (typeof root.generateId === 'function') return root.generateId(); } catch (_) {} var mx = 0; _arr(_rows()).forEach(function (r) { mx = Math.max(mx, Number(r.internalId) || 0); }); return mx + 1; }
    function materialize(code) {
        var res = compute(); var z = res && res.byCode[code]; var rows = _rows(); if (!z || !Array.isArray(rows)) return null;
        var row = rows.find(function (r) { return r && r.zoneId === code; });
        if (!row) { row = { internalId: _nextId(), zoneId: code, origin: 'zsa-autopilot' }; rows.push(row); }
        if (!row.zsaTyped && row.origin !== 'zsa-autopilot') row.zsaTyped = { desc: row.desc || '', equip: row.equip || '', interference: row.interference || '', mitigation: row.mitigation || '', severity: row.severity || '' };
        var st = zoneStatus(z);
        var unitNames = z.units.filter(function (u) { return u.sysId; }).map(function (u) { return u.designator || u.name; });
        row.desc = row.desc || z.name;
        row.equip = (unitNames.slice(0, 14).join(', ') + (unitNames.length > 14 ? ' and ' + (unitNames.length - 14) + ' more' : '')) + (z.runs.length ? '; ' + z.runs.length + ' harness, tube and duct runs' : '');
        row.severity = z.worst ? z.worst.severity : (row.severity || '');
        var lines = [], mit = [];
        z.questions.forEach(function (q) { var o = optionOf(q); lines.push(q.text + (o ? ' -> ' + o.label : ' (not answered yet)')); if (o && o.mitigation) mit.push(o.mitigation); });
        if (z.risks.length) lines.push('Particular risks reaching this zone (analyzed in the PRA): ' + z.risks.map(function (v) { return v.label; }).join('; '));
        row.interference = lines.join('\n') || 'No interference found in the CAD model';
        row.mitigation = mit.join('; ');
        row.zsaFindings = z.questions.map(function (q) { var o = optionOf(q), a = answerOf(q.id); return { id: q.id, rule: q.rule, text: q.text, pick: o ? o.label : null, status: o ? o.status : 'unanswered', by: a ? a.by : null, at: a ? a.at : null }; });
        row.findingStatus = st.state === 'done' ? 'Closed' : (st.state === 'ready' ? 'Mitigated' : 'Open');
        row.assessMethod = 'ZSA Autopilot: worked out from the CAD model and the zone list, choices by the engineer';
        if (st.signed) { row.assessedBy = st.signed.by; row.assessedOn = String(st.signed.at).slice(0, 10); }
        return row;
    }
    function materializeAll() { var res = compute(); if (!res) return 0; res.zones.forEach(function (z) { materialize(z.code); }); U().save(); return res.zones.length; }

    // ---- the page ------------------------------------------------------------------------------------------
    var state = { zone: null, step: 0 };
    function _outline(res) { return Z().all().filter(function (z) { return z && z.volume && z.volume.kind === 'box' && !z.parentId; }).map(function (z) { return { min: z.volume.min, max: z.volume.max }; }); }
    function _host() { return typeof document !== 'undefined' ? document.getElementById('zsa-auto-host') : null; }
    function render() {
        var h = _host(); if (!h || !U()) return;
        U().style();
        // the Autopilot is the first thing under the ZSA heading; the computed analysis panel (zsa_engine_ui.js) follows it
        try { var hd = h.parentNode && h.parentNode.querySelector('.header-with-export'); if (hd && hd.nextSibling !== h) h.parentNode.insertBefore(h, hd.nextSibling); } catch (_) {}
        var res = compute();
        if (!res) { h.innerHTML = '<div class="slap slap-card"><div class="slap-head"><span class="slap-title">ZSA Autopilot</span></div><div class="slap-sub">The ZSA Autopilot works the zonal analysis out from the CAD model. Import the CAD model and the zone list first (Common cause, ZSA, CAD Model). The table below still works by hand.</div></div>'; return; }
        var tot = { q: 0, a: 0, open: 0, done: 0 };
        res.zones.forEach(function (z) { var s = zoneStatus(z); tot.q += s.questions; tot.a += s.answered; tot.open += s.open; if (s.state === 'done') tot.done++; });
        var items = res.zones.map(function (z) { var s = zoneStatus(z); return { key: z.code, label: z.code + ' ' + z.name, sub: s.questions ? (s.answered + ' of ' + s.questions + ' answered' + (s.open ? ', ' + s.open + ' open' : '') + (s.state === 'done' ? ', signed' : '')) : (s.state === 'done' ? 'nothing to ask, signed' : 'nothing to ask'), state: s.state === 'done' ? 'done' : (s.open ? 'open' : 'todo'), on: state.zone === z.code }; });
        var body = state.zone && res.byCode[state.zone] ? _zoneHtml(res, res.byCode[state.zone]) : _overviewHtml(res, tot);
        h.innerHTML = '<div class="slap slap-card" data-zsa-auto="1">' +
            '<div class="slap-head"><span class="slap-title">ZSA Autopilot</span><span class="slap-sub">' + res.zones.length + ' zones, ' + tot.q + ' questions, ' + tot.a + ' answered, ' + tot.open + ' open, ' + tot.done + ' zones signed</span>' + U().progress(tot.a, tot.q) +
            '<button type="button" class="slap-btn" onclick="SLZsaAuto.ui.report()">Write the ZSA report</button></div>' +
            '<div class="slap-grid"><div>' + U().rail(items, 'SLZsaAuto.ui.zone') + '</div><div data-zsa-auto-body="1">' + body + '</div></div></div>';
    }
    function _overviewHtml(res, tot) {
        var first = res.zones.find(function (z) { return zoneStatus(z).state !== 'done'; });
        return '<div class="slap-q">The tool has worked the zonal analysis out from the CAD model.</div>' +
            '<div class="slap-why">It placed every part in its zone, found what could hurt what, and kept only the questions that need an engineer\'s choice: ' + tot.q + ' of them across ' + res.zones.length + ' zones. Pick a zone on the left, or start with the next one.</div>' +
            U().picture({ outline: _outline(res) }, {}) +
            '<div class="slap-nav">' + (first ? '<button type="button" class="slap-btn p" onclick="SLZsaAuto.ui.zone(' + U().E(JSON.stringify(first.code)) + ')">Start with ' + U().E(first.code + ' ' + first.name) + '</button>' : '<span class="slap-pill ok">Every zone is signed</span>') + '</div>';
    }
    function _zoneHtml(res, z) {
        var st = zoneStatus(z), n = z.questions.length, step = Math.max(0, Math.min(state.step, n + 1));
        var head = '<div class="slap-head"><button type="button" class="slap-btn" onclick="SLZsaAuto.ui.zone(null)">All zones</button><b>' + U().E(z.code + ' ' + z.name) + '</b>' +
            U().pill(st.state === 'done' ? 'ok' : (st.open ? 'open' : (st.state === 'ready' ? 'info' : 'todo')), st.state === 'done' ? 'Signed' : (st.open ? st.open + ' open' : (st.state === 'ready' ? 'Ready to sign' : st.answered + ' of ' + n + ' answered'))) +
            '<span class="slap-sub">Step ' + (step + 1) + ' of ' + (n + 2) + '</span></div>';
        var lit = { outline: _outline(res), zone: z.box, volumes: [] };
        if (step === 0) {
            var bySys = {}; z.units.forEach(function (u) { var k = u.sysName || 'Not in this project'; (bySys[k] = bySys[k] || []).push(u); });
            return head + '<div class="slap-q">What is in ' + U().E(z.code) + '</div>' +
                '<div class="slap-why">' + z.units.length + ' units and ' + z.runs.length + ' harness, tube and duct runs, from the CAD model. ' + (z.worst ? 'The worst thing that can come from losing them: <b>' + U().E(z.worst.fc) + '</b> (' + U().E(z.worst.severity) + ').' : 'None of them belongs to a system with a failure condition in this project.') + '</div>' +
                U().picture({ outline: lit.outline, zone: z.box, marks: z.units.map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: u.k.fluid ? '#DC2626' : (u.k.hot ? '#EA580C' : '#2563EB'), label: u.name }; }) }, { legend: [['#2563EB', 'units'], ['#DC2626', 'fuel or hydraulic'], ['#EA580C', 'hot']], focus: z.box }) +
                '<table class="slap-tbl"><tr><th>System</th><th>Units</th></tr>' + Object.keys(bySys).sort().map(function (k) { return '<tr><td>' + U().E(k) + '</td><td>' + bySys[k].map(function (u) { return U().E(u.name); }).join(', ') + '</td></tr>'; }).join('') + '</table>' +
                (z.risks.length ? '<div class="slap-note">Particular risks that reach this zone are analyzed in the PRA: ' + z.risks.map(function (v) { return U().E(v.label); }).join('; ') + '.</div>' : '') +
                '<div class="slap-nav"><button type="button" class="slap-btn p" onclick="SLZsaAuto.ui.step(1)">' + (n ? 'Looks right, ask the ' + n + ' question' + (n === 1 ? '' : 's') : 'Looks right, nothing to ask') + '</button></div>';
        }
        if (step <= n) {
            var q = z.questions[step - 1], o = optionOf(q);
            lit.marks = q.marks;
            return head + U().picture(lit, { legend: q.legend, focus: z.box }) + U().question({ id: q.id, text: q.text, why: q.why, options: q.options, picked: o ? o.id : null }, 'SLZsaAuto.ui.pick') +
                (answerOf(q.id) ? '<div class="slap-note">Answered by ' + U().E(answerOf(q.id).by) + ' on ' + U().E(String(answerOf(q.id).at).slice(0, 10)) + '.</div>' : '') +
                '<div class="slap-nav"><button type="button" class="slap-btn" onclick="SLZsaAuto.ui.step(' + (step - 1) + ')">Back</button><button type="button" class="slap-btn p" ' + (o ? '' : 'disabled') + ' onclick="SLZsaAuto.ui.step(' + (step + 1) + ')">Next</button></div>';
        }
        // summary and sign
        return head + '<div class="slap-q">' + U().E(z.code) + ': the result</div>' +
            '<table class="slap-tbl"><tr><th>Question</th><th>Answer</th><th>Status</th></tr>' + (z.questions.map(function (q) { var o = optionOf(q); return '<tr><td>' + U().E(q.text) + '</td><td>' + (o ? U().E(o.label) : '<i>not answered</i>') + '</td><td>' + U().pill(!o ? 'todo' : (o.status === 'open' ? 'open' : 'ok'), !o ? 'To answer' : (o.status === 'open' ? 'Open' : (o.status === 'mitigated' ? 'Mitigated' : 'Accepted'))) + '</td></tr>'; }).join('') || '<tr><td colspan="3">Nothing to ask in this zone.</td></tr>') + '</table>' +
            '<div class="slap-why">' + (st.state === 'todo' ? 'Answer every question to sign the zone.' : (st.open ? 'Open design changes stay in the ZSA table as open findings. The zone can be signed once they are closed.' : (st.signed ? 'Signed by ' + U().E(st.signed.by) + ' on ' + U().E(String(st.signed.at).slice(0, 10)) + '. Changing an answer reopens it.' : 'Every finding is mitigated or accepted. Sign the zone to close it.'))) + '</div>' +
            '<div class="slap-nav"><button type="button" class="slap-btn" onclick="SLZsaAuto.ui.step(' + n + ')">Back</button>' +
            (st.state === 'ready' ? '<button type="button" class="slap-btn p" onclick="SLZsaAuto.ui.sign(' + U().E(JSON.stringify(z.code)) + ')">Sign this zone</button>' : '') +
            '<button type="button" class="slap-btn" onclick="SLZsaAuto.ui.next()">Next zone</button></div>';
    }
    function report() {
        var res = compute(); if (!res) return false;
        var E = U().E, html = '<h1>Zonal Safety Analysis</h1><p class="muted">' + E(_g('projectName') || '') + '. Worked out by the ZSA Autopilot from the CAD model ' + E((C().model(res.cadId) || {}).fileName || '') + ' and the zone list; every choice made by an engineer, with who and when. ' + new Date().toISOString().slice(0, 10) + '.</p>';
        html += '<table><tr><th>Zone</th><th>Worst failure condition</th><th>Questions</th><th>Open</th><th>Signed</th></tr>' + res.zones.map(function (z) { var s = zoneStatus(z); return '<tr><td>' + E(z.code + ' ' + z.name) + '</td><td>' + E(z.worst ? z.worst.fc + ' (' + z.worst.severity + ')' : '-') + '</td><td>' + s.answered + ' of ' + s.questions + '</td><td class="' + (s.open ? 'open' : 'ok') + '">' + s.open + '</td><td>' + (s.signed ? E(s.signed.by + ', ' + String(s.signed.at).slice(0, 10)) : '-') + '</td></tr>'; }).join('') + '</table>';
        res.zones.forEach(function (z) {
            html += '<h2>' + E(z.code + ' ' + z.name) + '</h2>' + U().picture({ outline: _outline(res), zone: z.box, marks: z.units.map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: u.k.fluid ? '#DC2626' : (u.k.hot ? '#EA580C' : '#2563EB') }; }) }, { width: 460 }) +
                '<p>' + z.units.length + ' units, ' + z.runs.length + ' runs. Systems: ' + E(z.systems.map(function (s) { return (_sys(s) || {}).name || s; }).join(', ') || 'none in this project') + '.</p>';
            if (z.questions.length) html += '<table><tr><th>Finding</th><th>Answer</th><th>Mitigation or reason</th><th>Status</th><th>By</th></tr>' + z.questions.map(function (q) { var o = optionOf(q), a = answerOf(q.id); return '<tr><td>' + E(q.text) + '</td><td>' + (o ? E(o.label) : '<i>not answered</i>') + '</td><td>' + E(o ? o.mitigation : '') + '</td><td class="' + (o && o.status !== 'open' ? 'ok' : 'open') + '">' + E(o ? o.status : 'unanswered') + '</td><td>' + E(a ? a.by + ', ' + String(a.at).slice(0, 10) : '') + '</td></tr>'; }).join('') + '</table>';
            else html += '<p class="muted">No interference found in the CAD model for this zone.</p>';
            if (z.risks.length) html += '<p class="muted">Particular risks reaching this zone (see the PRA): ' + E(z.risks.map(function (v) { return v.label; }).join('; ')) + '.</p>';
        });
        return U().openReport('Zonal Safety Analysis', html);
    }
    var ui = {
        zone: function (code) { state.zone = code || null; state.step = 0; if (code) materialize(code), U().save(); render(); },
        step: function (n) { state.step = n; render(); },
        pick: function (qid, opt) { answer(qid, opt); render(); },
        sign: function (code) { sign(code); render(); },
        next: function () { var res = compute(); if (!res) return; var i = res.zones.findIndex(function (z) { return z.code === state.zone; }); var nx = res.zones.slice(i + 1).concat(res.zones.slice(0, i + 1)).find(function (z) { return zoneStatus(z).state !== 'done'; }); ui.zone(nx ? nx.code : null); },
        report: report
    };
    function mount() {
        if (typeof document === 'undefined') return false;
        var v = document.getElementById('view-zsa'); if (!v) return false;
        var host = document.getElementById('zsa-auto-host');
        if (!host) { host = document.createElement('div'); host.id = 'zsa-auto-host'; var head = v.querySelector('.header-with-export'); if (head && head.nextSibling) v.insertBefore(host, head.nextSibling); else v.insertBefore(host, v.firstChild); }
        if (!v._zsaAutoObs && typeof MutationObserver === 'function') {
            var shown = v.style.display !== 'none';
            v._zsaAutoObs = new MutationObserver(function () { var now = v.style.display !== 'none'; if (now && !shown) { _cache = null; try { render(); } catch (e) { try { console.warn('[zsa-autopilot]', e); } catch (_) {} } } shown = now; });
            v._zsaAutoObs.observe(v, { attributes: true, attributeFilter: ['style', 'class'] });
            if (shown) { try { render(); } catch (_) {} }
        }
        return true;
    }
    if (typeof document !== 'undefined') { var tries = 40, t = setInterval(function () { if (mount() || --tries <= 0) clearInterval(t); }, 250); }
    root.SLZsaAuto = { VERSION: VERSION, compute: compute, classify: classify, laneKey: laneKey, worstOf: worstOf, zoneStatus: zoneStatus, answer: answer, sign: sign, materialize: materialize, materializeAll: materializeAll, report: report, render: render, ui: ui, state: state, reset: function () { _cache = null; } };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLZsaAuto;
})(typeof window !== 'undefined' ? window : globalThis);

// zsa_autopilot.js (SLZsaAuto v1.9, 10 Nov 2026: what each kind of equipment and material in a zone brings, and what that does to the equipment around it and the aircraft; v1.8 9 Nov 2026; v1.7 v1.6 v1.5 9 Nov 2026; v1.4 8 Nov 2026; v1.0 4 Nov 2026): the ZSA Autopilot on the ZSA page.
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
//
// v1.3 (8 Nov 2026). Waqas: "PRA build and ZSA similar to the planing autopilot, ability to see the reports etc.";
// confirmed: the ZSA table goes, with an inline Edit per report section and an "Add a zone" button so no data entry is
// lost. This version:
//   · the questions to the Plan Autopilot standard: a short intro per question, every answer card says what it means
//     and what it changes before it is picked (cards left aligned), and a follow-up indented under its parent only
//     where one exists (the proof behind "the unit is sealed" and "it never gets hot enough"). Follow-up ids are
//     '<parent id>>proof'; the stored answers keep the same shape (v:1), so nothing needs migrating.
//   · the ZSA report's content as pure data: reportSections() (one section per zone: what is in it, the functions that
//     equipment performs, what one event there loses, each finding with its decision, the particular risks pointed to
//     the PRA, the worst outcome reconciled), reportIO() (what the ZSA needs and produces), reportOutputs() (outputs to
//     accept, each with the questions behind it), editFields() and saveZone() (the fields the table held, written to
//     zsaData without duplicates). The shared report frame (cca_report.js) draws them.
//   · TABLE_RETIRED: the one switch that hides the ZSA table and the "Zone models" panel (cca_models.js) once the
//     report frame is in. false until then, so the page keeps working.
//   · v1.4 (8 Nov 2026, phase 2): the ZSA page is the shared report frame (cca_report.js, SLCcaReport.define key 'zsa'):
//     the Autopilot on the left (its own pane, leftId 'zsa-auto-host'), the ZSA report on the right with Edit per zone
//     and "Add a zone", inputs and outputs with a clickable figure, a "what one event loses" figure per zone with
//     clickable boxes, acceptance, Word and print. TABLE_RETIRED is on. PRA pointers open the PRA report at the
//     risk's section ('sec:<PRA id>').
//   · the Autopilot adopts the zone's own row only (a zonal walkthrough finding row with zsaCheckpoint is never taken
//     over), and keeps a severity an engineer set in the report's Edit (row.severityBy === 'engineer').
(function (root) {
    'use strict';
    var VERSION = '1.9';   // 1.9 10 Nov 2026: each zone says what its kinds of equipment and its materials bring (zsa_type_hazards.js);   // 1.8 9 Nov 2026: the loss figure drawn with squared connectors in their own lanes (SLCcaReport.flow);   // 1.7 9 Nov 2026: proposed mitigations, path to compliance and conclusion per zone, written or AI drafted and accepted;   // 1.6 9 Nov 2026: every zone its own report, picked from a dropdown, with a register   // 1.5 9 Nov 2026: 3D model pictures per zone, picked beside its questions (spec.shots)
    // PHASE 2 SWITCH (8 Nov 2026): true hides the ZSA table, its entry form and the "Zone models" panel, because the
    // ZSA report (cca_report.js) holds every field with its own Edit and "Add a zone". Flip it when the report frame is wired.
    var TABLE_RETIRED = true;   // 8 Nov 2026 (v1.4): the report frame is wired, the table is retired
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
    // v1.3: the short intro each kind of question opens with (Plan Autopilot standard), and its name in the report
    var INTRO = {
        LEAK: 'Fluid dripping onto electronics can stop them working. This checks whether a leak above this unit can reach it, and what stops it.',
        TOGETHER: 'Units that do the same job are there so one carries on when another is lost. In one zone, one event can take them all.',
        HOT: 'A leak becomes a fire when the fluid meets something hot enough. This checks what keeps the heat away from the fluid.',
        DRAIN: 'Leaked fluid has to go somewhere. Fluid that collects in a zone can reach a hot or electrical part later.'
    };
    function _fluidWord(f) { return f === 'hydraulic' ? 'hydraulic fluid' : String(f || ''); }
    var RULE_NAME = { LEAK: 'Leak onto equipment', TOGETHER: 'Units of one job in one zone', HOT: 'Heat near fuel or hydraulic fluid', DRAIN: 'Where a leak goes' };

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
            Q.push({ id: id, rule: 'LEAK', zone: z.code, intro: INTRO.LEAK,
                text: 'Could a ' + fl + ' leak from ' + names.join(', ') + ' drip onto ' + label(v) + '?',
                why: 'The ' + fl + ' ' + (src.length === 1 ? 'source sits' : 'sources sit') + ' above ' + U().E(v.name) + ' (' + U().E(v.sysName) + '). If it stops working, the worst outcome is <b>' + U().E(w.fc) + '</b> (' + U().E(w.severity) + ').',
                whyText: 'The ' + fl + ' ' + (src.length === 1 ? 'source sits' : 'sources sit') + ' above ' + v.name + ' (' + v.sysName + '). If it stops working, the worst outcome is ' + w.fc + ' (' + w.severity + ').',
                subject: { pids: [v.pid], sources: names, fluid: fl },
                marks: [{ min: v.bbox.min, max: v.bbox.max, color: '#2563EB', label: v.name }].concat(src.slice(0, 3).map(function (s) { return { min: s.bbox.min, max: s.bbox.max, color: '#DC2626', label: s.name }; })),
                legend: [['#2563EB', v.name], ['#DC2626', 'the ' + fl + ' above it']],
                options: [
                    { id: 'shield', label: 'Yes, so a drip shield goes over it', status: 'mitigated', mitigation: 'Drip shield over ' + v.name + ' against ' + fl + ' from ' + names.join(', '), means: 'A shield over the unit catches anything that drips, so a leak never reaches it.', impact: 'Adds the drip shield as a mitigation in this zone\'s ZSA row. This finding closes.' },
                    { id: 'move', label: 'Yes, so one of them moves', status: 'open', mitigation: 'Design change: move ' + v.name + ' or the ' + fl + ' source so nothing is above it', means: 'The layout changes so nothing that carries fluid sits above the unit.', impact: 'Records a design change. The finding stays open in the ZSA until the CAD model shows them apart.' },
                    { id: 'sealed', label: 'No, the unit is sealed against fluid', status: 'accepted', mitigation: v.name + ' is drip-proof (DO-160 Section 10, fluid susceptibility); accepted', means: 'The unit keeps working when fluid drips on it, so a drip onto it is accepted.', impact: 'Accepts the finding with that reason. The proof (the unit\'s DO-160 qualification) is listed as needed evidence.' }
                ],
                followups: [{ id: id + '>proof', parent: id, when: ['sealed'], rule: 'LEAK', zone: z.code, intro: 'An acceptance rests on its proof. This records where the proof that the unit is sealed comes from.',
                    text: 'What shows that ' + label(v) + ' keeps working when ' + fl + ' drips on it?',
                    options: [
                        { id: 'qualified', label: 'It has passed its fluid test', status: 'accepted', mitigation: 'Evidence: the DO-160 Section 10 (fluid susceptibility) qualification report of ' + v.name, means: 'The unit has been tested against fluid dripping and spraying on it, and the test report exists.', impact: 'Names the qualification report as the evidence for the acceptance in the ZSA row.' },
                        { id: 'similar', label: 'It is the same as a unit that passed', status: 'accepted', mitigation: 'Evidence: qualification by similarity to a unit that passed DO-160 Section 10 (fluid susceptibility)', means: 'The proof comes from an identical unit that has already passed the fluid test.', impact: 'Names the similarity analysis as the evidence. It has to show the two units are the same where it matters.' },
                        { id: 'planned', label: 'Its fluid test is still to come', status: 'open', mitigation: 'Evidence needed: the DO-160 Section 10 (fluid susceptibility) test of ' + v.name + ', not yet run', means: 'The unit is expected to pass, but nothing shows it yet.', impact: 'The finding stays open until the test is passed; then this answer changes to "It has passed its fluid test".' }
                    ] }] });
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
            if (far) opts.push({ id: 'apart', label: 'Yes, ' + _m(d) + ' apart is enough', status: 'accepted', mitigation: names.join(', ') + ': at least ' + _m(d) + ' apart (measured in the CAD model); separation accepted', means: 'The distance between them is enough that one event in this zone cannot reach them all.', impact: 'Accepts the separation measured in the CAD model. The distance is written into the ZSA row as the evidence.' });
            opts.push({ id: 'wall', label: 'Yes, a wall (barrier) is between them', status: 'mitigated', mitigation: 'Barrier between ' + names.join(', '), means: 'A barrier between them stops one event reaching them all.', impact: 'Adds the barrier as a mitigation. The barrier then has to be shown in the design (its substantiation is listed as needed evidence).' });
            opts.push({ id: 'move', label: 'No, one of them moves to another zone', status: 'open', mitigation: 'Design change: move ' + label(pb) + ' out of ' + z.code, means: 'One of them goes to a different zone, so one event here can only take one.', impact: 'Records a design change. The finding stays open until the CAD model shows them in different zones.' });
            if (!far) opts.push({ id: 'accept', label: 'Losing ' + (g.length === 2 ? 'both' : 'all of them') + ' is acceptable here', status: sevRank(w.severity) >= 3 ? 'open' : 'accepted', mitigation: 'Loss of ' + (g.length === 2 ? 'both' : 'all') + ' accepted: ' + w.fc + ' (' + w.severity + ')', means: 'Losing ' + (g.length === 2 ? 'both' : 'all of them') + ' together is judged acceptable for this zone.', impact: sevRank(w.severity) >= 3 ? 'Losing them leads to ' + w.fc + ' (' + w.severity + '), so this cannot simply be accepted: the finding stays open for a common mode review (CMA).' : 'Accepts losing them, which leads to ' + w.fc + ' (' + w.severity + ').' });
            var colors = ['#2563EB', '#7C3AED', '#0D9488', '#DB2777'];
            Q.push({ id: id, rule: 'TOGETHER', zone: z.code, intro: INTRO.TOGETHER,
                text: 'One fire, leak or burst here could stop ' + all + '. Are they kept apart?',
                reportText: 'One fire, leak or burst here could stop ' + (g.length === 2 ? all : 'all of ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]) + '. Are they kept apart?',
                why: 'They do the same job in ' + U().E(z.code) + '; the closest two are ' + _m(d) + ' apart. Losing them: <b>' + U().E(w.fc) + '</b> (' + U().E(w.severity) + ').',
                whyText: 'They do the same job in ' + z.code + '; the closest two are ' + _m(d) + ' apart. Losing them: ' + w.fc + ' (' + w.severity + ').',
                subject: { pids: g.map(function (u) { return u.pid; }), names: names, gap: d },
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
            var fls = {}; near.forEach(function (n) { fls[n.f.fluid] = 1; }); var flTxt = Object.keys(fls).sort().map(_fluidWord).join(' and ');
            var names = near.slice(0, 3).map(function (n) { return n.f.name; }), more = near.length > 3 ? ' and ' + (near.length - 3) + ' more' : '';
            var isAre = /^bleed ducts/.test(h.name) ? ' are' : ' is', gapTxt = near[0].d < 50 ? 'They touch or overlap in the CAD model.' : 'The nearest is ' + _m(near[0].d) + ' away.';
            Q.push({ id: id, rule: 'HOT', zone: z.code, intro: INTRO.HOT,
                text: 'The ' + h.name + isAre + ' close to ' + flTxt + ' (' + names.join(', ') + more + '). What stops its heat reaching the ' + flTxt + '?',
                // the report names every one (no "and N more")
                reportText: 'The ' + h.name + isAre + ' close to ' + flTxt + ' (' + near.map(function (n) { return n.f.name; }).join(', ') + '). What stops its heat reaching the ' + flTxt + '?',
                why: gapTxt + ' Hot air or a hot surface next to ' + U().E(flTxt) + ' is how a leak becomes a fire.',
                whyText: gapTxt + ' Hot air or a hot surface next to ' + flTxt + ' is how a leak becomes a fire.',
                subject: { hot: h.name, near: near.map(function (n) { return n.f.name; }), fluid: flTxt, gap: near[0].d },
                marks: [{ min: near[0].pa.min, max: near[0].pa.max, color: '#EA580C', label: h.name }].concat(near.slice(0, 3).map(function (n) { return { min: n.pb.min, max: n.pb.max, color: '#DC2626', label: n.f.name }; })),
                legend: [['#EA580C', h.name], ['#DC2626', flTxt + ' near it']],
                options: [
                    { id: 'insulate', label: 'Insulation and a leak or overheat detector', status: 'mitigated', mitigation: 'Insulation on ' + h.name + ' and overheat (duct leak) detection next to the ' + flTxt, means: 'Insulation keeps the heat in, and a detector warns the crew if hot air leaks.', impact: 'Adds both as mitigations in the ZSA row. This finding closes.' },
                    { id: 'move', label: 'Move them further apart', status: 'open', mitigation: 'Design change: separate ' + h.name + ' from the ' + flTxt, means: 'The layout changes to put more distance between the heat and the fluid.', impact: 'Records a design change. The finding stays open until the CAD model shows more distance.' },
                    { id: 'cool', label: 'It never gets hot enough to ignite ' + flTxt, status: 'accepted', mitigation: h.name + ' surface temperature stays below the ' + flTxt + ' autoignition temperature; accepted', means: 'The hot part never gets hot enough to set the fluid alight, so nothing more is needed.', impact: 'Accepts the finding. The temperature proof (test or analysis) is listed as needed evidence.' }
                ],
                followups: [{ id: id + '>proof', parent: id, when: ['cool'], rule: 'HOT', zone: z.code, intro: 'An acceptance rests on its proof. This records how the temperature is shown to stay low enough.',
                    text: 'How is it shown that the ' + h.name + ' stays below the temperature at which ' + flTxt + ' ignites?',
                    options: [
                        { id: 'test', label: 'Measured in a test', status: 'accepted', mitigation: 'Evidence: a temperature survey test of ' + h.name + ' at its hottest operating condition', means: 'The surface temperature was measured at the hottest it runs, with margin to the ignition temperature.', impact: 'Names the test report as the evidence for the acceptance in the ZSA row.' },
                        { id: 'analysis', label: 'Worked out by a thermal analysis', status: 'accepted', mitigation: 'Evidence: a thermal analysis of ' + h.name + ' at its hottest operating condition', means: 'A calculation shows the hottest surface stays below the ignition temperature, with margin.', impact: 'Names the analysis as the evidence. It is usually confirmed by a test later.' },
                        { id: 'planned', label: 'Not shown yet', status: 'open', mitigation: 'Evidence needed: the surface temperature of ' + h.name + ' against the ' + flTxt + ' ignition temperature, not yet shown', means: 'The temperature is expected to be low enough, but nothing shows it yet.', impact: 'The finding stays open until the test or analysis is done; then this answer changes.' }
                    ] }] });
        });
        // DRAIN: fuel or hydraulic fluid in the zone
        var fl = {}; fluidUnits.forEach(function (u) { fl[u.k.fluid] = 1; }); fluidRuns.forEach(function (r) { fl[r.fluid] = 1; });
        var kinds = Object.keys(fl).filter(function (k) { return k === 'fuel' || k === 'hydraulic'; }).sort();
        if (kinds.length && z.box) {
            Q.push({ id: 'drain:' + z.code, rule: 'DRAIN', zone: z.code, intro: INTRO.DRAIN,
                text: 'If ' + kinds.map(_fluidWord).join(' or ') + ' leaks in this zone, where does it go?',
                why: 'There is ' + kinds.join(' and ') + ' in ' + U().E(z.code) + ' (' + (fluidUnits.length + fluidRuns.length) + ' units and lines). A leak that pools can reach a hot or electrical part.',
                whyText: 'There is ' + kinds.map(_fluidWord).join(' and ') + ' in ' + z.code + '. A leak that pools can reach a hot or electrical part.',
                subject: { fluids: kinds },
                marks: fluidUnits.slice(0, 8).map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: '#DC2626', label: u.name }; }),
                legend: [['#DC2626', 'fluid units in the zone']],
                options: [
                    { id: 'drain', label: 'It drains overboard through a drain path', status: 'mitigated', mitigation: 'Zone drainage overboard for ' + kinds.join(' and '), means: 'A drain path takes any leak out of the aircraft before it can collect.', impact: 'Adds zone drainage as a mitigation. The drain path is listed as needed evidence (drawing or test).' },
                    { id: 'shroud', label: 'The lines have a shroud that catches it', status: 'mitigated', mitigation: 'Shrouded ' + kinds.join(' and ') + ' lines with a drain to a safe place', means: 'A sleeve around the lines catches a leak and leads it to a safe place.', impact: 'Adds the shroud as a mitigation.' },
                    { id: 'pools', label: 'It would pool in the zone', status: 'open', mitigation: 'Design change: add drainage or ventilation in ' + z.code, means: 'Nothing takes the fluid away today, so the design has to change.', impact: 'Records a design change. The finding stays open.' }
                ] });
        }
    }

    // ---- answers and status --------------------------------------------------------------------------------
    // v1.3: a follow-up counts only while its parent carries the answer it follows from
    // reading never creates the store (a report or a status look writes nothing into the project)
    function _peek() { var s = _pc().zsaAuto; return s && typeof s === 'object' ? s : { answers: {}, signed: {} }; }
    function answerOf(qid) { return (_peek().answers || {})[qid] || null; }
    function optionOf(q) { var a = answerOf(q.id); if (!a) return null; return q.options.find(function (o) { return o.id === a.pick; }) || null; }
    function followupsOn(q) { var o = optionOf(q); return o ? _arr(q.followups).filter(function (f) { return f.when.indexOf(o.id) >= 0; }) : []; }
    // the questions that count, in order: each question, then its follow-ups that apply
    function activeQuestions(z) { var out = []; z.questions.forEach(function (q) { out.push(q); followupsOn(q).forEach(function (f) { out.push(f); }); }); return out; }
    function _findQ(qid) {
        var res = compute(); if (!res) return null; var hit = null;
        res.zones.some(function (z) { return z.questions.some(function (q) { if (q.id === qid) { hit = { q: q, parent: null, z: z }; return true; } return _arr(q.followups).some(function (f) { if (f.id === qid) { hit = { q: f, parent: q, z: z }; return true; } return false; }); }); });
        return hit;
    }
    function zoneStatus(z) {
        var act = activeQuestions(z), n = act.length, answered = 0, open = 0;
        act.forEach(function (q) { var o = optionOf(q); if (o) { answered++; if (o.status === 'open') open++; } });
        var signed = (_peek().signed || {})[z.code] || null;
        var state = answered < n ? 'todo' : (open ? 'open' : (signed ? 'done' : 'ready'));
        return { questions: n, answered: answered, open: open, signed: signed, state: state };
    }
    function answer(qid, pick) {
        var hit = _findQ(qid); if (!hit) return false;
        var q = hit.q;
        if (!q.options.some(function (o) { return o.id === pick; })) return false;
        // a follow-up is answered only under the answer it follows from
        if (hit.parent && followupsOn(hit.parent).indexOf(q) < 0) return false;
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
    // the zone's own row: a zonal walkthrough finding (zsaCheckpoint) is a separate record and is never taken over
    function _zoneRow(code, rows) { return _arr(rows || _rows()).find(function (r) { return r && r.zoneId === code && !r.zsaCheckpoint; }) || null; }
    function materialize(code) {
        var res = compute(); var z = res && res.byCode[code]; var rows = _rows(); if (!z || !Array.isArray(rows)) return null;
        var row = _zoneRow(code, rows);
        if (!row) { row = { internalId: _nextId(), zoneId: code, origin: 'zsa-autopilot', housedFunctions: [], assumptionIds: [] }; rows.push(row); }
        if (!row.zsaTyped && row.origin !== 'zsa-autopilot') row.zsaTyped = { desc: row.desc || '', equip: row.equip || '', interference: row.interference || '', mitigation: row.mitigation || '', severity: row.severity || '' };
        var st = zoneStatus(z), act = activeQuestions(z);
        var unitNames = z.units.filter(function (u) { return u.sysId; }).map(function (u) { return u.designator || u.name; });
        row.desc = row.desc || z.name;
        row.equip = (unitNames.slice(0, 14).join(', ') + (unitNames.length > 14 ? ' and ' + (unitNames.length - 14) + ' more' : '')) + (z.runs.length ? '; ' + z.runs.length + ' harness, tube and duct runs' : '');
        // v1.3: a severity an engineer set in the report's Edit is kept; otherwise the worst from the systems' FHA
        if (row.severityBy !== 'engineer') row.severity = z.worst ? z.worst.severity : (row.severity || '');
        var lines = [], mit = [];
        act.forEach(function (q) { var o = optionOf(q); lines.push((q.parent ? '  ' : '') + q.text + (o ? ' -> ' + o.label : ' (not answered yet)')); if (o && o.mitigation) mit.push(o.mitigation); });
        if (z.risks.length) lines.push('Particular risks reaching this zone (analyzed in the PRA): ' + z.risks.map(function (v) { return v.label; }).join('; '));
        row.interference = lines.join('\n') || 'No interference found in the CAD model';
        row.mitigation = mit.join('; ');
        row.zsaFindings = act.map(function (q) { var o = optionOf(q), a = answerOf(q.id); return { id: q.id, parent: q.parent || null, rule: q.rule, text: q.text, pick: o ? o.label : null, status: o ? o.status : 'unanswered', by: a ? a.by : null, at: a ? a.at : null }; });
        // v1.3: the record fields in the shape the ZSA record (zsa_record.js), its check and every export read:
        // open or closed, a method from its list. (1.0 to 1.2 wrote 'Open', 'Mitigated', 'Closed' and a sentence as the
        // method, which the record read as "Not set" and an invalid method.) The finer state is zsaState.
        row.zsaState = st.state;
        row.findingStatus = st.state === 'done' ? 'closed' : 'open';
        row.assessMethod = 'drawing-review';
        row.assessBasis = 'ZSA Autopilot: worked out from the CAD model and the zone list, choices by the engineer';
        if (st.signed) { row.assessedBy = st.signed.by; row.assessedOn = String(st.signed.at).slice(0, 10); }
        if (!Array.isArray(row.housedFunctions)) row.housedFunctions = [];
        return row;
    }
    function materializeAll() { var res = compute(); if (!res) return 0; res.zones.forEach(function (z) { materialize(z.code); }); U().save(); return res.zones.length; }

    // ---- the page ------------------------------------------------------------------------------------------
    var state = { zone: null, step: 0 };
    function _outline(res) { return Z().all().filter(function (z) { return z && z.volume && z.volume.kind === 'box' && !z.parentId; }).map(function (z) { return { min: z.volume.min, max: z.volume.max }; }); }
    function _host() { return typeof document !== 'undefined' ? document.getElementById('zsa-auto-host') : null; }
    function frame() { return root.SLCcaReport ? root.SLCcaReport.get('zsa') : null; }
    function render() {
        var F = frame(); if (F) { try { applyTableSwitch(); } catch (_) {} return F.render(); }
        var h = _host(); if (!h || !U()) return;
        U().style();
        try { applyTableSwitch(); } catch (_) {}
        // the Autopilot is the first thing under the ZSA heading; the computed analysis panel (zsa_engine_ui.js) follows it
        try { var hd = h.parentNode && h.parentNode.querySelector('.header-with-export'); if (hd && hd.nextSibling !== h) h.parentNode.insertBefore(h, hd.nextSibling); } catch (_) {}
        var res = compute();
        if (!res) { h.innerHTML = U().emptyCard('ZSA Autopilot', 'The ZSA Autopilot works the zonal analysis out from the CAD model.'); return; }
        var tot = { q: 0, a: 0, open: 0, done: 0 };
        res.zones.forEach(function (z) { var s = zoneStatus(z); tot.q += s.questions; tot.a += s.answered; tot.open += s.open; if (s.state === 'done') tot.done++; });
        var items = res.zones.map(function (z) { var s = zoneStatus(z); return { key: z.code, label: z.code + ' ' + z.name, sub: s.questions ? (s.answered + ' of ' + s.questions + ' answered' + (s.open ? ', ' + s.open + ' open' : '') + (s.state === 'done' ? ', signed' : '')) : (s.state === 'done' ? 'nothing to ask, signed' : 'nothing to ask'), state: s.state === 'done' ? 'done' : (s.open ? 'open' : 'todo'), on: state.zone === z.code }; });
        var body = state.zone && res.byCode[state.zone] ? _zoneHtml(res, res.byCode[state.zone]) : _overviewHtml(res, tot);
        h.innerHTML = '<div class="slap slap-card" data-zsa-auto="1">' +
            '<div class="slap-head"><span class="slap-title">ZSA Autopilot</span><span class="slap-sub">' + res.zones.length + ' zones, ' + tot.q + ' questions, ' + tot.a + ' answered, ' + tot.open + ' open, ' + tot.done + ' zones signed</span>' + U().progress(tot.a, tot.q) +
            '<button type="button" class="slap-btn" onclick="SLZsaAuto.ui.report()">Write the ZSA report</button>' + U().importButtons(true) + '</div>' +
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
            var q = z.questions[step - 1], o = optionOf(q), fus = followupsOn(q);
            var done = !!o && fus.every(function (f) { return !!optionOf(f); });
            lit.marks = q.marks;
            return head + U().picture(lit, { legend: q.legend, focus: z.box }) +
                '<div class="zsq">' + qCard(q, 0) + fus.map(function (f) { return qCard(f, 1); }).join('') + '</div>' +
                '<div class="slap-nav"><button type="button" class="slap-btn" onclick="SLZsaAuto.ui.step(' + (step - 1) + ')">Back</button><button type="button" class="slap-btn p" ' + (done ? '' : 'disabled') + ' onclick="SLZsaAuto.ui.step(' + (step + 1) + ')">Next</button></div>';
        }
        // summary and sign
        return head + '<div class="slap-q">' + U().E(z.code) + ': the result</div>' +
            '<table class="slap-tbl"><tr><th>Question</th><th>Answer</th><th>Status</th></tr>' + (activeQuestions(z).map(function (q) { var o = optionOf(q); return '<tr><td' + (q.parent ? ' style="padding-left:26px"' : '') + '>' + U().E(q.text) + '</td><td>' + (o ? U().E(o.label) : '<i>not answered</i>') + '</td><td>' + U().pill(!o ? 'todo' : (o.status === 'open' ? 'open' : 'ok'), !o ? 'To answer' : (o.status === 'open' ? 'Open' : (o.status === 'mitigated' ? 'Mitigated' : 'Accepted'))) + '</td></tr>'; }).join('') || '<tr><td colspan="3">Nothing to ask in this zone.</td></tr>') + '</table>' +
            '<div class="slap-why">' + (st.state === 'todo' ? 'Answer every question to sign the zone.' : (st.open ? 'Open design changes stay in the ZSA table as open findings. The zone can be signed once they are closed.' : (st.signed ? 'Signed by ' + U().E(st.signed.by) + ' on ' + U().E(String(st.signed.at).slice(0, 10)) + '. Changing an answer reopens it.' : 'Every finding is mitigated or accepted. Sign the zone to close it.'))) + '</div>' +
            '<div class="slap-nav"><button type="button" class="slap-btn" onclick="SLZsaAuto.ui.step(' + n + ')">Back</button>' +
            (st.state === 'ready' ? '<button type="button" class="slap-btn p" onclick="SLZsaAuto.ui.sign(' + U().E(JSON.stringify(z.code)) + ')">Sign this zone</button>' : '') +
            '<button type="button" class="slap-btn" onclick="SLZsaAuto.ui.next()">Next zone</button></div>';
    }
    // v1.3: a question card to the Plan Autopilot standard: the question, a short intro, what the model found, then one
    // left-aligned card per answer saying what it means and what it changes before it is picked. A follow-up sits
    // indented under its parent with a thin connector line. The classes slap-opt, picked and data-slap-q/-o stay, so
    // older tests and the shared look still find them.
    var QCSS = '.zsq-q{border:1px solid var(--color-border,#e3e5e8);border-left-width:3px;border-radius:10px;padding:10px 12px;margin:0 0 10px;background:var(--color-surface-1,#fff)}'
        + '.zsq-q.gap{border-left-color:#B26A00}.zsq-q.sub{position:relative;margin-left:26px}.zsq-q.sub::before{content:"";position:absolute;left:-16px;top:-11px;width:12px;height:30px;border-left:2px solid var(--color-border-strong,#c7cbd1);border-bottom:2px solid var(--color-border-strong,#c7cbd1);border-bottom-left-radius:7px}'
        + '.zsq-qt{font-weight:700;font-size:15px;margin:0 0 4px}.zsq-intro,.zsq .slap-why,.zsq .slap-oi,.zsq-om,.zsq-by{color:var(--color-text-primary,#101216)}.zsq-intro{font-size:13px;margin:0 0 6px}.zsq .slap-why{margin:0 0 8px}'
        + '.slap .zsq-opt{display:flex;justify-content:flex-start;align-items:flex-start;gap:10px;padding:10px 12px;border-width:1.5px;border-radius:10px}'
        + '.zsq-mk{flex:none;width:16px;height:16px;border-radius:50%;border:2px solid #6b7280;margin-top:3px;box-sizing:border-box}.zsq-opt.picked .zsq-mk{border-color:#1A6EF2;background:#1A6EF2;box-shadow:inset 0 0 0 2.5px #fff}'
        + '.zsq-ob{flex:1 1 auto;display:flex;flex-direction:column;gap:3px;min-width:0}.zsq .slap-ol{font-size:14px}.zsq-om{font-size:13px;line-height:1.45}.zsq .slap-oi{margin-top:2px}'
        + '.zsq-acts{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px;font-size:12.5px}.zsq-jump{font:inherit;font-size:12.5px;border:none;background:none;color:#1A6EF2;cursor:pointer;padding:0}'
        + 'body.theme-dark .zsq-mk{border-color:#9AA1AD}body.theme-dark .zsq-opt.picked .zsq-mk{border-color:#6AA6FF;background:#6AA6FF;box-shadow:inset 0 0 0 2.5px #15181E}body.theme-dark .zsq-jump{color:#8DBBFF}body.theme-dark .zsq-q.gap{border-left-color:#F2BE6E}';
    function _qStyle() { if (typeof document === 'undefined' || document.getElementById('zsq-style')) return; var st = document.createElement('style'); st.id = 'zsq-style'; st.textContent = QCSS; document.head.appendChild(st); }
    function qCard(q, depth) {
        _qStyle();
        var E = U().E, o = optionOf(q), a = answerOf(q.id), picked = o ? o.id : null;
        var cards = q.options.map(function (op) {
            var on = picked === op.id;
            return '<button type="button" role="radio" aria-checked="' + on + '" class="slap-opt zsq-opt' + (on ? ' picked' : '') + '" data-slap-q="' + E(q.id) + '" data-slap-o="' + E(op.id) + '" onclick="SLZsaAuto.ui.pick(' + E(JSON.stringify(q.id)) + ',' + E(JSON.stringify(op.id)) + ')">'
                + '<span class="zsq-mk"></span><span class="zsq-ob"><span class="slap-ol">' + E(op.label) + '</span>'
                + (op.means ? '<span class="zsq-om">' + E(op.means) + '</span>' : '')
                + (op.impact ? '<span class="slap-oi"><b>What this changes:</b> ' + E(op.impact) + '</span>' : '') + '</span></button>';
        }).join('');
        return '<div class="zsq-q' + (depth ? ' sub' : '') + (o ? '' : ' gap') + '" data-zsq="' + E(q.id) + '" data-zsq-depth="' + (depth || 0) + '">'
            + (depth ? '<div class="zsq-qt">' + E(q.text) + '</div>' : '<div class="slap-q">' + E(q.text) + '</div>')
            + (q.intro ? '<div class="zsq-intro">' + E(q.intro) + '</div>' : '')
            + (q.why ? '<div class="slap-why">' + q.why + '</div>' : '')
            + '<div class="slap-opts" role="radiogroup">' + cards + '</div>'
            + '<div class="zsq-acts">' + (a ? '<span class="zsq-by">Answered by ' + E(a.by) + ' on ' + E(String(a.at).slice(0, 10)) + '.</span>' : '')
            + (a && (frame() || typeof api.onJump === 'function') ? '<button type="button" class="zsq-jump" data-zsq-jump="' + E(q.id) + '" onclick="SLZsaAuto.ui.jump(' + E(JSON.stringify(q.id)) + ')">See where it goes &rarr;</button>' : '') + '</div></div>';
    }

    // 6 Nov 2026 (report_ai.js rebuild): the zone pictures as figures for the ZSA report, {{figure:zsa_zones}}
    function figures() {
        var res = compute(); if (!res) return [];
        return res.zones.map(function (z) {
            var f = U().figure({ outline: _outline(res), zone: z.box, marks: z.units.map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: u.k.fluid ? '#DC2626' : (u.k.hot ? '#EA580C' : '#2563EB') }; }) }, { width: 460 });
            if (!f) return null; var svg = f.svg, w = f.w, h = f.h;
            return { title: z.code + ' ' + z.name, caption: 'Zone ' + z.code + ' ' + z.name + ': ' + z.units.length + ' units and ' + z.runs.length + ' runs from the CAD model (red: fluid carrying, orange: hot, blue: other equipment)', svg: svg, w: w, h: h };
        }).filter(Boolean);
    }
    // =================================================================================================================
    // v1.3 (8 Nov 2026): THE ZSA REPORT CONTENT, as pure data for the shared report frame (cca_report.js).
    // One section per zone; every paragraph an answer wrote carries that question's id (q) so the frame can light it up.
    // Plain words, every id with its name, no live counts and no status words (that belongs to a status report).
    // Block types: { type:'h', text } a sub-heading; { type:'p', text, q? }; { type:'table', id, title, columns, rows,
    // rowQ? }; { type:'figure', id, title, svg, w, h }; { type:'list', items: [{ text, q?, ref? }] }.
    // =================================================================================================================
    function _clean(t) { return String(t == null ? '' : t).replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim(); }
    function _uniq(a) { var o = {}, r = []; _arr(a).forEach(function (x) { if (!o[x]) { o[x] = 1; r.push(x); } }); return r; }
    function _join(a) { a = _arr(a).filter(Boolean); return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    function _nat(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); }
    function _anchor(code) { return 'zsa-zone-' + String(code).replace(/[^A-Za-z0-9_-]+/g, '-'); }
    function _sysName(id) { var s = _sys(id); return s ? (s.name || String(id)) : null; }
    function _fcName(fcId) {
        var f = _arr(_g('acFhaData')).find(function (x) { return x && x.fcId === fcId; });
        if (!f) _arr(_g('systemsData')).some(function (s) { f = _arr(s && s.fha).find(function (x) { return x && x.fcId === fcId; }) || null; return !!f; });
        return f ? (f.fcDesc || '') : '';
    }
    function _fcLabel(fcId) { var n = _fcName(fcId); return n ? fcId + ' ' + n : fcId; }
    function _sfName(subId) {
        var f = _arr(_g('acFunctionsData')).find(function (x) { return x && String(x.subId) === String(subId); });
        if (f) return f.subName || f.funcName || '';
        var n = ''; _arr(_g('systemsData')).some(function (s) { var g = _arr(s && s.functions).find(function (x) { return _arr(x.traceIds).indexOf(subId) >= 0; }); if (g) n = g.funcName || ''; return !!g; });
        return n;
    }
    function _sfLabel(subId) { var n = _sfName(subId); return n ? subId + ' ' + n : String(subId); }
    function _owners(subId) { return _arr(_g('systemsData')).filter(function (s) { return s && _arr(s.functions).some(function (f) { return (Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : [])).indexOf(subId) >= 0; }); }); }
    function _items() { return _arr(_g('itemsData')); }
    function _itemOf(u) { var n = String(u.name || '').toLowerCase().trim(), d = String(u.designator || '').trim(); return _items().find(function (i) { return i && ((d && (i.itemId === d)) || (n && String(i.name || '').toLowerCase().trim() === n)); }) || null; }
    function _rank(sev) { var R = _g('SEVERITY_RANK'); return (R && R[sev]) || 0; }
    // the same rule as zsaZoneModel (cca_models.js, INV-18), worked here so the report does not pay for every zone's
    // zonal findings once per zone
    function _reconcile(elicited, computed) {
        if (computed && elicited && _rank(computed) > _rank(elicited)) return 'conflict';
        if (computed && elicited && _rank(computed) < _rank(elicited)) return 'conservative';
        if (computed && !elicited) return 'unclassified';
        return 'agree';
    }
    var RUN_WORDS = { wire: ['Wiring', 'Electrical power and signals (wiring harness)'], hydraulic: ['Hydraulic lines', 'Hydraulic fluid (tube run)'], fuel: ['Fuel lines', 'Fuel (tube run)'], bleed: ['Bleed air ducts', 'Hot bleed air (duct run)'], oxygen: ['Oxygen lines', 'Oxygen (tube run)'], water: ['Water lines', 'Water (tube run)'] };
    function _unitWhat(u) {
        var k = u.k || {}, w = [];
        if (k.fluid) w.push('Holds or carries ' + _fluidWord(k.fluid));
        if (k.hot) w.push('Runs hot');
        if (k.electronic) w.push('Electronics');
        return w.length ? w.join('; ') : 'Equipment';
    }
    // the zones of the report: every zone of the CAD model, and every zone with a record that the model does not have
    function _zoneList() {
        var res = compute(), out = [], seen = {};
        if (res) res.zones.forEach(function (z) { seen[z.code] = 1; out.push({ code: z.code, z: z }); });
        _arr(_rows()).forEach(function (r) { if (r && r.zoneId && !r.zsaCheckpoint && !seen[r.zoneId]) { seen[r.zoneId] = 1; out.push({ code: r.zoneId, z: null }); } });
        return out.sort(function (a, b) { return _nat(a.code, b.code); });
    }
    var _secMemo = null;
    function _memoKey() {
        var res = compute(), pc = _pc();
        try { return _hash(JSON.stringify([res ? res.cadId + '|' + res.zones.length : '', _peek().answers, _rows(), _g('routingData'), pc.macModels, pc.zonalAccepted, _items().length, _arr(_g('acFhaData')).length, _arr(_g('praData')).map(function (p) { return [p.praId, p.threat, p.affectedZones]; }), _arr(_g('systemsData')).length, root.SLZsaTypeHazards ? root.SLZsaTypeHazards.memoPart() : ''])); } catch (_) { return String(Math.random()); }
    }
    function reportSections() {
        var key = _memoKey();
        if (_secMemo && _secMemo.key === key) return _secMemo.val;
        var res = compute(), val = _zoneList().map(function (e) { return _section(e.code, e.z, res); });
        _secMemo = { key: key, val: val };
        return val;
    }
    function _section(code, z, res) {
        var row = _zoneRow(code), name = z ? z.name : _clean((row && row.desc) || ''), title = _clean(code + (name ? ' ' + name : '')), where = title;
        var B = [], P = function (t, q) { B.push(q ? { type: 'p', text: _clean(t), q: q } : { type: 'p', text: _clean(t) }); }, H = function (t) { B.push({ type: 'h', text: t }); };
        var T = function (id, ttl, cols, rows, rowQ) { var t = { type: 'table', id: id, title: _clean(ttl), columns: cols, rows: rows.map(function (r) { return r.map(_clean); }) }; if (rowQ) t.rowQ = rowQ; B.push(t); };
        var tid = function (s) { return 'zsa-' + String(code).replace(/[^A-Za-z0-9_-]+/g, '-') + '-' + s; };
        var act = z ? activeQuestions(z) : [];

        // 1. what is in the zone ----------------------------------------------------------------------------------
        H('What is in the zone');
        var rts = _arr(_g('routingData')).filter(function (rt) { return rt && _arr(rt.routesThroughZones).indexOf(code) >= 0; });
        if (z) {
            P('Zone ' + where + '. The equipment below is placed in the zone from the CAD model' + ((C().model(res.cadId) || {}).fileName ? ' (' + C().model(res.cadId).fileName + ')' : '') + ' and the zone list; the runs are the harness, tube and duct stretches that pass through it.');
            try { var f = U().figure({ outline: _outline(res), zone: z.box, marks: z.units.map(function (u) { return { min: u.bbox.min, max: u.bbox.max, color: u.k.fluid ? '#DC2626' : (u.k.hot ? '#EA580C' : '#2563EB') }; }) }, { width: 460 }); if (f) B.push({ type: 'figure', id: tid('fig'), title: 'Zone ' + title + ' in the CAD model (red: holds or carries fuel or hydraulic fluid; orange: runs hot; blue: other equipment)', svg: f.svg, w: f.w, h: f.h }); } catch (_) {}
            var us = z.units.slice().sort(function (a, b) { return _nat(a.sysName || '~', b.sysName || '~') || _nat(a.name, b.name); });
            if (us.length) T(tid('equip'), 'Equipment housed in ' + title + ', by system', ['System', 'Equipment', 'Designator', 'What it is'], us.map(function (u) { return [u.sysName || 'Not linked to a system', u.name, u.designator || '', _unitWhat(u)]; }));
            else P('The CAD model places no equipment unit in this zone.');
            if (z.runs.length) {
                var rr = z.runs.map(function (r) { var sy = {}; r.parts.forEach(function (p) { if (p.sysId && _sysName(p.sysId)) sy[_sysName(p.sysId)] = 1; }); var g = Object.keys(sy).sort(); var w = RUN_WORDS[r.kind] || ['Other runs', r.kind || 'Not known']; return [g.length ? g.join(', ') : w[0], r.run, w[1]]; })
                    .sort(function (a, b) { return _nat(a[0], b[0]) || _nat(a[1], b[1]); });
                T(tid('runs'), 'Runs routed through ' + title + ', by system', ['System', 'Run', 'What it carries'], rr);
            }
        } else {
            P('Zone ' + where + '. This zone is not in the CAD model, so what is in it comes from its record' + (rts.length ? ' and the routing record' : '') + '.');
            if (row && row.equip) P('Equipment and routing noted in the zone record: ' + row.equip + '.');
        }
        if (rts.length) T(tid('routing'), 'Routing paths through ' + title + ' from the routing record', ['Routing path', 'Equipment it carries', 'Functions it carries'], rts.map(function (rt) {
            return [(rt.routingId ? rt.routingId + ' ' : '') + (rt.name || ''), _arr(rt.carriesItems).map(function (id) { var it = _items().find(function (i) { return i && i.itemId === id; }); return it ? id + ' ' + it.name : id; }).join('; ') || 'None recorded', _arr(rt.carriesFunctions).map(_sfLabel).join('; ') || 'None recorded'];
        }));

        // 2. functions the equipment performs ---------------------------------------------------------------------
        H('Functions the equipment performs');
        var fn = {}, add = function (sf, owner, by, src) { if (!sf) return; var r = fn[sf] || (fn[sf] = { o: {}, b: {}, s: {} }); if (owner) r.o[owner] = 1; if (by) r.b[by] = 1; if (src) r.s[src] = 1; };
        var noSys = [], bySys = [];
        if (z) z.units.forEach(function (u) {
            var it = _itemOf(u);
            if (it) { _arr(it.traceIds).forEach(function (sf) { add(sf, _sysName(it.owningSystemId) || _sysName(u.sysId), u.name, 'Items list (' + it.itemId + ')'); }); return; }
            var s = u.sysId && _sys(u.sysId);
            if (s && _arr(s.functions).length) { var labs = _uniq([].concat.apply([], _arr(s.functions).map(function (g) { var t = _arr(g.traceIds); return t.length ? t.map(_sfLabel) : (g.funcName ? [g.funcName] : []); }))).sort(_nat);
                if (labs.length) { bySys.push([u.name, s.name, labs.join('; ')]); return; } }
            noSys.push(u.name);
        });
        rts.forEach(function (rt) {
            var rn = (rt.routingId ? rt.routingId + ' ' : '') + (rt.name || '');
            _arr(rt.carriesItems).forEach(function (id) { var it = _items().find(function (i) { return i && i.itemId === id; }); if (it) _arr(it.traceIds).forEach(function (sf) { add(sf, _sysName(it.owningSystemId), it.name + ' (on ' + rn + ')', 'Routing record'); }); });
            _arr(rt.carriesFunctions).forEach(function (sf) { var ow = _owners(sf); if (!ow.length) add(sf, null, rn, 'Routing record'); ow.forEach(function (s) { add(sf, s.name, rn, 'Routing record'); }); });
        });
        _arr(row && row.housedFunctions).forEach(function (sf) { var ow = _owners(sf); if (!ow.length) add(sf, null, null, 'Zone record'); ow.forEach(function (s) { add(sf, s.name, null, 'Zone record'); }); });
        var fk = Object.keys(fn).sort(_nat);
        if (fk.length) T(tid('functions'), 'Functions performed by the equipment in ' + title, ['Function', 'Owning system', 'Performed here by', 'Where this comes from'], fk.map(function (sf) { var r = fn[sf]; return [_sfLabel(sf), Object.keys(r.o).sort().join(', ') || 'No owning system recorded', Object.keys(r.b).sort(_nat).join(', ') || 'Housed here, from the zone record', Object.keys(r.s).sort().join('; ')]; }));
        else P(bySys.length ? 'None of the equipment in this zone is on the items list or recorded in the routing or zone record with a function; what it takes part in is known only through its system, below.' : 'No function is tied to the equipment in this zone: none of it is on the items list, linked to a system with functions, or recorded as housed here.');
        if (bySys.length) T(tid('sysfunctions'), 'Equipment in ' + title + ' that is not on the items list, with the functions of its system', ['Equipment', 'System', 'Functions of that system'], bySys.sort(function (a, b) { return _nat(a[1], b[1]) || _nat(a[0], b[0]); }));
        if (noSys.length) P('Equipment in the zone that is not linked to a system in this project, so the functions it performs are not known here: ' + _join(noSys.slice().sort(_nat)) + '.');

        // 2b. what the equipment and materials in the zone bring (v1.9, 10 Nov 2026, zsa_type_hazards.js) ------------
        if (z && root.SLZsaTypeHazards) { try { root.SLZsaTypeHazards.section(z, res.cadId, { title: title }).blocks.forEach(function (b) { if (b.type === 'table') T(b.id, b.title, b.columns, b.rows); else if (b.type === 'h') H(b.text); else P(b.text); }); } catch (e) { try { console.warn('[zsa] type hazards', e); } catch (_) {} } }

        // 3. what one event in the zone loses ---------------------------------------------------------------------
        H('What one event in the zone loses');
        var ev = null; try { if (typeof root.fsEvaluate === 'function') ev = root.fsEvaluate(['zone:' + code]); } catch (_) { ev = null; }
        var direct = ev && ev.zoneNotes && ev.zoneNotes[0] ? _arr(ev.zoneNotes[0].systems) : [];
        var dn = direct.map(function (id) { return _sysName(id) || id; }).sort(_nat);
        if (!ev) P('The aircraft model (the cascade engine) is not loaded, so what one event here loses is not worked out in this view.');
        else {
            P(dn.length ? 'If one event (a fire, a leak, a burst or a broken part) took out everything in ' + where + ', these systems would be lost directly: ' + _join(dn) + '.' : 'In the aircraft model, one event here takes out no system directly: nothing recorded as housed or routed here is tied to a system the model can count as lost.');
            var cadSys = z ? z.systems.filter(function (id) { return direct.indexOf(id) < 0 && _sysName(id); }).map(_sysName).sort(_nat) : [];
            if (cadSys.length) P('The CAD model also places equipment of ' + _join(cadSys) + ' in this zone, which the aircraft model does not count as lost with it. Recording the functions housed here or the routing through the zone lets the model count them.');
            var knock = _arr(ev.closure).filter(function (c) { return c && c.kind === 'system' && c.down && direct.indexOf(c.id) < 0; });
            if (knock.length) {
                var kt = knock.map(function (c) { var chain = String(c.path || '').split(' ; ').map(function (seg) { var m = /^(.*?) \u2014\w+\([^)]*\)\u2192 (.*)$/.exec(seg); return m ? [m[1], m[2]] : null; }).filter(Boolean); var via = chain.map(function (x) { return x[0]; }); return c.name + (via.length ? ', through ' + _join(via) : ''); });
                P('As a knock-on, these systems stop because they depend on what is lost: ' + kt.join('; ') + '.');
            } else if (dn.length) P('Nothing else stops as a knock-on: no other system depends on what is lost here.');
            var refs = {}; _arr(row && row.housedFunctions).forEach(function (sf) { refs[sf] = 1; }); rts.forEach(function (rt) { _arr(rt.carriesFunctions).forEach(function (sf) { refs[sf] = 1; }); });
            Object.keys(refs).sort(_nat).forEach(function (sf) { var ow = _owners(sf); if (ow.length > 1) P('Function ' + _sfLabel(sf) + ' is shared by ' + _join(ow.map(function (s) { return s.name; })) + ', so the model does not count it lost with this zone alone. Recording which items that perform it pass through the zone settles which of them are here.'); });
            var mac = _arr(_pc().macModels), down = {}; _arr(ev.downSystems).forEach(function (id) { down[id] = 1; });
            var brs = _arr(ev.breaches);
            if (brs.length) {
                T(tid('mac'), 'Minimum aircraft configuration rules that one event in ' + title + ' breaks', ['Function that needs it', 'Flight phases', 'What the rule needs', 'What is left', 'Failure conditions it leads to'], brs.map(function (b) {
                    var rule = mac.find(function (r) { return r && r.id === b.ruleId; }) || { clauses: [] };
                    var cl = _arr(rule.clauses).filter(function (c) { var mem = _arr(c.of), left = mem.filter(function (m) { return !down[m]; }); return left.length < (c.min || 1) || (c.floor != null); });
                    if (!cl.length) cl = _arr(rule.clauses);
                    var need = cl.map(function (c) { var mem = _arr(c.of).map(function (m) { return _sysName(m) || m; }); return (c.floor != null ? 'enough working capacity from ' : 'at least ' + (c.min || 1) + ' of ') + _join(mem); }).join('; and ');
                    var left = cl.map(function (c) { var l = _arr(c.of).filter(function (m) { return !down[m]; }).map(function (m) { return _sysName(m) || m; }); return l.length ? 'Only ' + _join(l) : 'None of them'; }).join('; ');
                    var ph = !rule.phase || /^all$/i.test(String(b.phase || rule.phase)) ? 'All flight phases' : String(b.phase || rule.phase);
                    return [_sfLabel(b.subId), ph, need, left, _arr(b.fcs).map(function (x) { return _fcLabel(x.fcId) + ' (' + x.severity + ')'; }).join('; ') || 'None recorded'];
                }));
            }
            var tr = _arr(ev.trippedFcs);
            if (tr.length) T(tid('fcs'), 'Failure conditions one event in ' + title + ' can cause', ['Failure condition', 'Severity', 'Through the function'], tr.map(function (fc) {
                var through = {}; brs.forEach(function (b) { if (_arr(b.fcs).some(function (x) { return x.fcId === fc.fcId; })) through[_sfLabel(b.subId)] = 1; });
                return [_fcLabel(fc.fcId), fc.severity || 'Not classified', Object.keys(through).sort(_nat).join('; ')];
            }));
            if (!brs.length && !tr.length) P('One event in this zone breaks no minimum aircraft configuration rule, so it causes no failure condition in the aircraft model.');
        }

        // 4. findings and the decision for each ------------------------------------------------------------------
        H('Findings and the decision made for each');
        if (z) {
            if (!act.length) P('The CAD model shows nothing in this zone that needs a decision: no fluid above electronics whose loss matters, no units of one job together, no heat next to fuel or hydraulic fluid, and no fuel or hydraulic fluid that could collect.');
            act.forEach(function (q) {
                var o = optionOf(q);
                if (q.parent) P('Proof behind that decision: ' + q.text + ' ' + (o ? 'Answer: ' + o.label + '. ' + (o.means || '') + ' Recorded as: ' + o.mitigation + '.' : 'To be decided.'), q.id);
                else P(RULE_NAME[q.rule] + ': ' + (q.reportText || q.text) + ' ' + (q.whyText || '') + ' ' + (o ? 'Decision: ' + o.label + '. ' + (o.means || '') + ' Recorded in the zone record as: ' + o.mitigation + '.' : 'To be decided.'), q.id);
            });
        } else {
            if (row && (row.interference || row.mitigation)) { if (row.interference) P('What could hurt what, from the zone record: ' + row.interference); if (row.mitigation) P('Separation and mitigations, from the zone record: ' + row.mitigation); }
            else P('The zone record names no interference and no mitigation yet.');
        }
        var ty = row && row.zsaTyped;
        if (ty && (ty.equip || ty.interference || ty.mitigation)) P('Before the Autopilot wrote this zone\'s record, it said' + [ty.equip ? ' equipment: ' + ty.equip : '', ty.interference ? ' what could hurt what: ' + ty.interference : '', ty.mitigation ? ' mitigations: ' + ty.mitigation : ''].filter(Boolean).join(';') + '.');
        var wk = _arr(_rows()).filter(function (r) { return r && r.zoneId === code && r.zsaCheckpoint; });
        if (wk.length) B.push({ type: 'list', items: wk.map(function (r) { return { text: _clean('Walkthrough finding (' + r.zsaCheckpoint + '): ' + (r.interference || r.desc || '') + (r.mitigation ? ' Mitigation: ' + r.mitigation : '')) }; }) });

        // 5. particular risks that reach the zone ----------------------------------------------------------------
        H('Particular risks that reach the zone');
        var pr = {}, order = [];
        _arr(_g('praData')).forEach(function (p) { if (p && p.praId && _arr(p.affectedZones).indexOf(code) >= 0) { if (!pr[p.praId]) order.push(p.praId); pr[p.praId] = pr[p.praId] || { threat: p.threat || '', vols: [] }; } });
        (z ? z.risks : []).forEach(function (v) { var k = v.praId || ('vol:' + v.id); if (!pr[k]) { order.push(k); pr[k] = { threat: v.praId ? ((_arr(_g('praData')).find(function (p) { return p && p.praId === v.praId; }) || {}).threat || v.label) : v.label, vols: [] }; } pr[k].vols.push(v); });
        if (order.length) B.push({ type: 'list', items: order.sort(_nat).map(function (k) {
            var e = pr[k], isPra = k.indexOf('vol:') !== 0, vl = e.vols.map(function (v) { return v.label; }).filter(function (l) { return l && l !== e.threat; });
            return { text: _clean((isPra ? k + ' ' : '') + e.threat + (vl.length ? ': ' + _join(vl) + ' reach this zone in the CAD model' : '') + '. Assessed in the PRA report' + (isPra ? ', section ' + k : '') + ', not asked again here.'), ref: { report: 'pra', praId: isPra ? k : null, volumeIds: e.vols.map(function (v) { return v.id; }) } };
        }) });
        else P('No particular risk in the PRA reaches this zone.');

        // 6. the worst outcome: the zone record and the aircraft model -------------------------------------------
        H('Worst outcome: the zone record and the aircraft model');
        var el = row ? (row.severity || '') : '', worstFc = ev && _arr(ev.trippedFcs)[0], cw = worstFc ? worstFc.severity : null, rc = _reconcile(el, cw);
        var cwTxt = worstFc ? _fcLabel(worstFc.fcId) + ' (' + cw + ')' : '';
        if (!row) P('This zone has no record yet, so it carries no classification of its own.' + (cw ? ' In the aircraft model, the worst one event here can cause is ' + cwTxt + '; the zone\'s record takes that classification when it is written.' : ''));
        else if (!cw) P('The zone record classifies the worst outcome of losing this zone as ' + (el || 'not yet classified') + '. In the aircraft model, one event here causes no failure condition, so there is nothing to set against the record.');
        else if (rc === 'agree') P('The zone record classifies the worst outcome of losing this zone as ' + el + '. The aircraft model gives the same: the worst one event here can cause is ' + cwTxt + '.');
        else if (rc === 'conservative') P('The zone record classifies the worst outcome of losing this zone as ' + el + '. In the aircraft model the worst one event here can cause is ' + cwTxt + ', which is less severe. The record is the stricter of the two and stands.');
        else if (rc === 'unclassified') P('The zone record carries no classification. In the aircraft model the worst one event here can cause is ' + cwTxt + '; the zone needs that classification.');
        else P('The zone record classifies the worst outcome of losing this zone as ' + el + ', but in the aircraft model one event here can cause ' + cwTxt + ', which is worse. The zone\'s classification needs review against the model.');
        if (z && z.worst) P('From the systems\' own hazard assessments, the worst failure condition of the equipment placed here is ' + (z.worst.fcId ? z.worst.fcId + ' ' : '') + z.worst.fc + ' (' + z.worst.severity + '), of ' + z.worst.sysName + '.');

        var loss = ev ? { direct: direct.slice(), knock: _arr(ev.closure).filter(function (c) { return c && c.kind === 'system' && c.down && direct.indexOf(c.id) < 0; }).map(function (c) { return { id: c.id, name: c.name, from: c.from }; }), fcs: _arr(ev.trippedFcs).map(function (f) { return { fcId: f.fcId, severity: f.severity }; }), breaches: _arr(ev.breaches).map(function (b) { return { ruleId: b.ruleId, subId: b.subId, fcs: _arr(b.fcs).map(function (f) { return f.fcId; }) }; }) } : null;
        return { id: _anchor(code), key: code, code: code, name: name, title: title, inModel: !!z, row: row ? row.internalId : null, qids: act.map(function (q) { return q.id; }), simulate: ['zone:' + code], loss: loss, blocks: B };
    }

    // ---- inputs and outputs of the ZSA ------------------------------------------------------------------------------
    var DEST = {
        ssa: { id: 'ssa', name: 'System safety assessments (SSA)', tab: 'sys-dir' },
        design: { id: 'design', name: 'The design team, through the CAD model', tab: 'cad' },
        reqs: { id: 'reqs', name: 'Requirements', tab: 'reqs-repo' },
        verification: { id: 'verification', name: 'Verification', tab: 'validation' },
        cma: { id: 'cma', name: 'Common Mode Analysis (CMA)', tab: 'cma' },
        pra: { id: 'pra', name: 'Particular Risk Analysis (PRA)', tab: 'pra' }
    };
    function _fp(qids, extra) { var a = _peek().answers || {}; return _hash(JSON.stringify([qids.slice().sort().map(function (id) { return [id, a[id] ? a[id].pick : null]; }), extra || null])); }
    function _allActive() { var res = compute(); return res ? [].concat.apply([], res.zones.map(activeQuestions)) : []; }
    function reportOutputs() {
        var all = _allActive(), has = function (q, ids) { return q.options.some(function (o) { return ids.indexOf(o.id) >= 0; }); };
        var ids = function (f) { return all.filter(f).map(function (q) { return q.id; }); };
        var sev = _zoneList().map(function (e) { var r = _zoneRow(e.code); return [e.code, r ? r.severity || '' : '']; });
        var mk = function (id, what, to, accept, qids, extra) { return { id: id, what: what, to: to.map(function (k) { return DEST[k]; }), accept: accept, qids: qids, fingerprint: _fp(qids, extra) }; };
        return [
            mk('zsa.findings', 'Zonal findings, each with the decision made for it', ['ssa'], 'Every question in every zone decided; each zone reviewed and signed', ids(function () { return true; })),
            mk('zsa.changes', 'Design changes the zonal analysis asks for: units to move, drainage to add', ['design'], 'Each change carried into the CAD model and the zone checked again', ids(function (q) { return !q.parent && has(q, ['move', 'pools']); })),
            mk('zsa.reqs', 'Installation requirements: the shields, barriers, insulation, detectors and drains the decisions call for', ['reqs'], 'Each one written as a requirement on the installation and traced to its zone', ids(function (q) { return !q.parent && q.options.some(function (o) { return o.status === 'mitigated'; }); })),
            mk('zsa.evidence', 'Evidence the decisions rest on: fluid tests, temperature proof, measured distances, drain paths', ['verification'], 'Each piece of evidence named, and supplied before its zone is closed', ids(function (q) { return !!q.parent || q.options.some(function (o) { return o.status === 'accepted'; }); })),
            mk('zsa.cma', 'Units of one job kept in one zone, passed to the common mode analysis', ['cma'], 'Every case a zone cannot accept on its own carried into a CMA', ids(function (q) { return q.rule === 'TOGETHER'; })),
            mk('zsa.severity', 'The worst outcome of losing each zone, set against the aircraft model', ['pra', 'ssa'], 'Each zone\'s classification agrees with the model, or the difference is explained', [], sev)
        ];
    }
    function reportIO() {
        return {
            id: 'zsa', name: 'Zonal Safety Analysis',
            does: 'Checks zone by zone that the installation does not let one event take out what the design keeps apart, and records a decision for each finding.',
            inputs: [
                { id: 'cad', what: 'The CAD model and the zone list: which part sits in which zone', from: { id: 'cad', name: 'CAD Model page', tab: 'cad' } },
                { id: 'links', what: 'Which system each part belongs to', from: { id: 'cad', name: 'CAD Model page', tab: 'cad' } },
                { id: 'items', what: 'The items list: which item performs which function, in which system', from: { id: 'items', name: 'Items', tab: 'items' } },
                { id: 'routing', what: 'The routing record: harness, tube and duct paths, the zones they pass and what they carry', from: { id: 'routing', name: 'Routing', tab: 'routing' } },
                { id: 'fha', what: 'The failure conditions of the aircraft and of each system, with their severities', from: { id: 'fha', name: 'Aircraft and system FHA', tab: 'ac-fha' } },
                { id: 'mac', what: 'The minimum aircraft configuration rules: which systems each function needs', from: { id: 'mac', name: 'Minimum aircraft configuration', tab: 'mac' } },
                { id: 'cea', what: 'How the systems depend on each other: what feeds what', from: { id: 'cea', name: 'Cascading Effects', tab: 'cea' } },
                { id: 'pra', what: 'The particular risks and the zones they reach', from: { id: 'pra', name: 'Particular Risk Analysis (PRA)', tab: 'pra' } }
            ],
            outputs: reportOutputs()
        };
    }

    // ---- inline Edit and "Add a zone": the fields the ZSA table held --------------------------------------------
    var ADJ = [['forwardOfEngines', 'Forward of which engines (item ids)', 'list'], ['aftOfEngines', 'Aft of which engines', 'list'], ['withinRotorPlaneOf', 'Within the rotor plane of which engines', 'list'], ['sameSideAsEngines', 'On the same side as which engines', 'list'], ['shieldedBy', 'Shielded by', 'text'], ['adjacentZones', 'Next to which zones', 'list'], ['pressurized', 'Pressurized zone', 'check'], ['aboveCabinFloor', 'Above the cabin floor', 'check'], ['forwardOfPressureBhd', 'Forward of the pressure bulkhead', 'check']];
    var METHOD_OPTS = [['', 'Not set'], ['drawing-review', 'Drawing or 3D model review'], ['mockup', 'Mock-up inspection'], ['aircraft', 'Aircraft inspection'], ['analysis', 'Analysis'], ['other', 'Other (say which in the mitigation)']];
    function _rowFor(x) {
        if (x && typeof x === 'object') return x;
        if (x == null || x === '') return null;
        return _arr(_rows()).find(function (r) { return r && !r.zsaCheckpoint && (String(r.internalId) === String(x) || r.zoneId === x); }) || null;
    }
    function _inModel(code) { var res = compute(); return !!(res && code && res.byCode[code]); }
    function editFields(zoneRow) {
        var row = _rowFor(zoneRow), code = row ? row.zoneId : '', auto = _inModel(code);
        var why = 'Written from the decisions in the ZSA Autopilot; change a decision to change it.';
        var adj = (row && row.adjacency) || {};
        var sevOpts = [['', 'Not classified']].concat(SEV.map(function (s) { return [s, s]; }));
        if (row && row.severity && !sevOpts.some(function (o) { return o[0] === row.severity; })) sevOpts.push([row.severity, row.severity]);
        var f = [
            { key: 'zoneId', label: 'Zone', type: 'text', value: code, required: true, readOnly: auto, why: auto ? 'The zone is in the CAD model; its code comes from the zone list.' : '', help: 'The zone code as on the zone list, for example Z-MLGW.' },
            { key: 'desc', label: 'What the zone is and where its boundaries are', type: 'text', value: row ? row.desc || '' : '' },
            { key: 'severity', label: 'Worst outcome of losing the zone', type: 'select', options: sevOpts, value: row ? row.severity || '' : '', help: auto ? 'Set from the systems\' hazard assessments until you choose here; your choice is kept.' : '' },
            { key: 'equip', label: 'Equipment and routing notes', type: 'textarea', value: row ? row.equip || '' : '', readOnly: auto, why: auto ? 'Written from the CAD model.' : '' },
            { key: 'interference', label: 'What could hurt what (heat, fluids, moving parts)', type: 'textarea', value: row ? row.interference || '' : '', readOnly: auto, why: auto ? why : '' },
            { key: 'mitigation', label: 'Separation and mitigations', type: 'textarea', value: row ? row.mitigation || '' : '', readOnly: auto, why: auto ? why : '' },
            { key: 'housedFunctions', label: 'Aircraft functions housed in the zone', type: 'multi', options: _arr(_g('acFunctionsData')).filter(function (x) { return x && x.subId; }).map(function (x) { return [x.subId, x.subId + ' ' + (x.subName || x.funcName || '')]; }), value: _arr(row && row.housedFunctions).slice() },
            { key: 'assumptionIds', label: 'Aircraft assumptions this zone relies on', type: 'multi', options: _arr(_g('acAssumptionsData')).filter(Boolean).map(function (a) { return [a.internalId, (a.asmId || a.id || '') + ' ' + (a.text || a.statement || a.desc || '')]; }), value: _arr(row && row.assumptionIds).slice() },
            { key: 'assessedBy', label: 'Assessed by (name or role)', type: 'text', value: row ? row.assessedBy || '' : '', readOnly: auto, why: auto ? 'Recorded when the zone is signed in the ZSA Autopilot.' : '' },
            { key: 'assessMethod', label: 'How it was assessed', type: 'select', options: METHOD_OPTS, value: row ? row.assessMethod || '' : '', readOnly: auto, why: auto ? 'Worked out from the CAD model.' : '' },
            { key: 'assessedOn', label: 'Assessed on', type: 'date', value: row ? row.assessedOn || '' : '', readOnly: auto, why: auto ? 'Recorded when the zone is signed in the ZSA Autopilot.' : '' },
            { key: 'findingStatus', label: 'Finding', type: 'select', options: [['open', 'Open'], ['closed', 'Closed (needs who, how, when and a mitigation)']], value: row ? row.findingStatus || 'open' : 'open', readOnly: auto, why: auto ? 'Closed when every decision is in and the zone is signed.' : '' }
        ].concat(ADJ.map(function (a) { var v = adj[a[0]]; return { key: 'adjacency.' + a[0], label: a[1], type: a[2], group: 'Where the zone sits (used when reasoning about particular risks)', value: a[2] === 'check' ? !!v : (Array.isArray(v) ? v.join(', ') : (v || '')) }; }));
        // v1.9: what each unit in the zone is and what it is made of (zsa_type_hazards.js reads these first)
        var TH = root.SLZsaTypeHazards, rz = auto && TH ? (compute() || { byCode: {} }).byCode[code] : null;
        if (rz) {
            var kopts = [['', 'Worked out by the tool']].concat(TH.kinds().map(function (k) { return [k.type, k.label]; })), G = 'What each piece of equipment is, and what it is made of';
            rz.units.slice().sort(function (a, b) { return _nat(a.name, b.name); }).forEach(function (u) {
                var fx = TH.facts(u.pid) || {}, wt = TH.unitType(Object.assign({}, u, { pid: null })), mt = TH.unitMaterial(Object.assign({}, u, { pid: null }), (compute() || {}).cadId);
                var cadMat = TH.unitMaterial({ pid: u.pid, sysId: null }, (compute() || {}).cadId);
                f.push({ key: 'unit.kind.' + u.pid, label: u.name + (u.designator ? ' (' + u.designator + '): what it is' : ': what it is'), type: 'select', group: G, options: kopts, value: fx.kind || '', help: wt ? 'The tool reads it as ' + TH.typeLabel(wt.type) + ', from ' + wt.from + '.' : 'The tool cannot tell what it is from its name or the CAD model.' });
                f.push({ key: 'unit.material.' + u.pid, label: u.name + ': what it is made of', type: 'text', group: G, value: fx.material || '', help: (cadMat && !fx.material ? 'The CAD model records ' + cadMat.name + '.' : (mt && !fx.material ? 'Recorded: ' + mt.name + ' (' + mt.from + ').' : 'For example aluminum alloy, titanium, carbon fiber composite, magnesium.')) });
            });
        }
        return { zoneId: code, row: row ? row.internalId : null, inModel: auto, title: row ? _clean(code + ' ' + (row.desc || '')) : 'Add a zone', fields: f };
    }
    function _today() { return new Date().toISOString().slice(0, 10); }
    // writes the zone's record; returns { ok, row } or { ok:false, err, existing }. Never makes a second record for a zone.
    function saveZone(values, opts) {
        values = values || {}; opts = opts || {};
        var rows = _rows(); if (!Array.isArray(rows)) return { ok: false, err: 'The project is not loaded.' };
        var row = opts.internalId != null ? _rowFor(opts.internalId) : null;
        if (opts.internalId != null && !row) return { ok: false, err: 'That zone record is no longer in the project.' };
        var fields = editFields(row).fields, byKey = {}; fields.forEach(function (f) { byKey[f.key] = f; });
        var code = String(values.zoneId != null && !(row && byKey.zoneId.readOnly) ? values.zoneId : (row ? row.zoneId : '')).trim();
        if (!code) return { ok: false, err: 'Give the zone its code first.' };
        var norm = function (s) { return String(s || '').trim().toLowerCase(); };
        var dup = rows.find(function (r) { return r && !r.zsaCheckpoint && r !== row && norm(r.zoneId) === norm(code); });
        if (dup) return { ok: false, err: 'Zone ' + dup.zoneId + ' already has its record. Edit that one instead.', existing: dup.internalId };
        var next = Object.assign({}, row || {});
        next.zoneId = code;
        // v1.9: what each unit is and is made of goes to its own store, never into the zone row
        var TH = root.SLZsaTypeHazards, unitVals = {};
        Object.keys(values).forEach(function (k) { var m = /^unit\.(kind|material)\.(.+)$/.exec(k); if (m && byKey[k]) { (unitVals[m[2]] = unitVals[m[2]] || {})[m[1]] = values[k]; } });
        if (TH) Object.keys(unitVals).forEach(function (pid) { var fx = TH.facts(pid) || {}, v = unitVals[pid]; TH.setFacts(pid, 'kind' in v ? v.kind : fx.kind, 'material' in v ? v.material : fx.material, U() ? U().who() : 'Engineer'); });
        Object.keys(values).forEach(function (k) {
            if (/^unit\.(kind|material)\./.test(k)) return;
            var f = byKey[k]; if (!f || f.readOnly || k === 'zoneId') return;
            var v = values[k];
            if (k.indexOf('adjacency.') === 0) {
                var a = k.slice(10); next.adjacency = Object.assign({}, next.adjacency || {});
                next.adjacency[a] = f.type === 'check' ? !!v : f.type === 'list' ? (Array.isArray(v) ? v : String(v || '').split(',')).map(function (x) { return String(x).trim(); }).filter(Boolean) : String(v || '').trim();
                return;
            }
            if (f.type === 'multi') next[k] = _arr(v).slice(); else next[k] = typeof v === 'string' ? v.trim() : v;
        });
        if (values.adjacency && typeof values.adjacency === 'object') next.adjacency = Object.assign({}, next.adjacency || {}, values.adjacency);
        if (byKey.severity && Object.prototype.hasOwnProperty.call(values, 'severity') && _inModel(code) && values.severity !== (row ? row.severity : undefined)) next.severityBy = 'engineer';
        var rec = root.SLZsaRecord;
        if (next.findingStatus !== 'closed') next.findingStatus = 'open';
        var bad = rec && rec.validate ? rec.validate(next) : null;
        if (bad) return { ok: false, err: bad };
        if (row) { Object.keys(next).forEach(function (k) { row[k] = next[k]; }); }
        else {
            row = Object.assign({ internalId: _nextId(), zoneId: code, origin: 'zsa-report', desc: '', equip: '', severity: '', interference: '', mitigation: '', housedFunctions: [], assumptionIds: [], adjacency: {}, assessedBy: '', assessMethod: '', assessedOn: _today(), findingStatus: 'open' }, next);
            rows.push(row);
        }
        if (_inModel(code)) materialize(code);
        _secMemo = null;
        U().save();
        try { if (typeof root.renderZSA === 'function') root.renderZSA(); } catch (_) {}
        try { if (typeof root.populatePraAffectedZonesDropdown === 'function') root.populatePraAffectedZonesDropdown(); } catch (_) {}
        return { ok: true, row: row };
    }

    // ---- the phase 2 switch ---------------------------------------------------------------------------------------
    // Hides (never deletes) the table, its entry form and the "Zone models" panel: other code still writes zsa-body.
    function applyTableSwitch() {
        if (typeof document === 'undefined') return false;
        var v = document.getElementById('view-zsa'); if (!v) return false;
        if (!document.getElementById('zsa-retire-style')) { var st = document.createElement('style'); st.id = 'zsa-retire-style'; st.textContent = '#view-zsa.zsa-table-retired > [data-zsa-retire],#view-zsa.zsa-table-retired #zsa-models-host{display:none !important}'; document.head.appendChild(st); }
        // the page's own pieces of the table, marked where they sit (direct children of the view): the entry form and
        // its collapse bar, the table and its filter bar, the model links banner
        var top = function (el) { while (el && el.parentNode && el.parentNode !== v) el = el.parentNode; return el && el.parentNode === v ? el : null; };
        var form = top(document.getElementById('btn-submit-zsa')), mark = function (el) { if (el && el !== v && el.id !== 'zsa-auto-host') el.setAttribute('data-zsa-retire', '1'); };
        mark(form); if (form && form.previousElementSibling && /collapsible-form-bar/.test(form.previousElementSibling.className || '')) mark(form.previousElementSibling);
        mark(top(document.getElementById('zsa-table'))); mark(v.querySelector(':scope > [data-ml-banner-for="zsa"]')); mark(v.querySelector(':scope > .generic-filter-bar'));
        var on = !!api.TABLE_RETIRED;
        if (v.classList) v.classList.toggle('zsa-table-retired', on);
        if (on) { var mh = document.getElementById('zsa-models-host'); if (mh) mh.innerHTML = ''; }
        return on;
    }
    // ---- the printable report from the same content (until the shared report frame draws it) -------------------
    function _sectionsHtml(secs) {
        var E = U().E;
        return secs.map(function (s) {
            return '<h2 id="' + E(s.id) + '">' + E(s.title) + '</h2>' + s.blocks.map(function (b) {
                if (b.type === 'h') return '<h3>' + E(b.text) + '</h3>';
                if (b.type === 'p') return '<p' + (b.q ? ' data-zsa-q="' + E(b.q) + '"' : '') + '>' + E(b.text) + '</p>';
                if (b.type === 'figure') return '<figure>' + b.svg + '<figcaption>' + E(b.title) + '</figcaption></figure>';
                if (b.type === 'list') return '<ul>' + b.items.map(function (i) { return '<li>' + E(i.text) + '</li>'; }).join('') + '</ul>';
                if (b.type === 'table') return '<p class="muted"><b>' + E(b.title) + '</b></p><table><tr>' + b.columns.map(function (c) { return '<th>' + E(c) + '</th>'; }).join('') + '</tr>' + b.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + E(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
                return '';
            }).join('');
        }).join('');
    }
    function report() {
        var secs = reportSections(); if (!secs.length) return false;
        var E = U().E, html = '<h1>Zonal Safety Analysis</h1><p class="muted">' + E(_g('projectName') || '') + '. Worked out by the ZSA Autopilot from the CAD model and the zone list; every decision made by an engineer.</p>' + _sectionsHtml(secs);
        return U().openReport('Zonal Safety Analysis', html);
    }
    // after an answer or a move, the frame redraws and lights up what changed (or the page redraws itself without one)
    function _redraw(flashKey) { var F = frame(); if (F) F.answered(flashKey || null); else render(); }
    var ui = {
        zone: function (code) { state.zone = code || null; state.step = 0; if (code) materialize(code), U().save(); _secMemo = null; if (!code) { var F0 = frame(); if (F0 && F0.setTab) { F0.setTab(null); return; } } _redraw(code ? 'sec:' + code : null); },
        step: function (n) { state.step = n; _redraw(null); },
        pick: function (qid, opt) { answer(qid, opt); _secMemo = null; _redraw(qid); },
        sign: function (code) { sign(code); _secMemo = null; _redraw('sec:' + code); },
        next: function () { var res = compute(); if (!res) return; var i = res.zones.findIndex(function (z) { return z.code === state.zone; }); var nx = res.zones.slice(i + 1).concat(res.zones.slice(0, i + 1)).find(function (z) { return zoneStatus(z).state !== 'done'; }); ui.zone(nx ? nx.code : null); },
        report: report,
        // "See where it goes": the frame scrolls to and lights up what the answer wrote
        jump: function (qid) { try { if (frame()) root.SLCcaReport.act('zsa', 'see', qid); else if (typeof api.onJump === 'function') api.onJump(qid); } catch (_) {} },
        // a particular risk named in a zone: open the PRA report at its section
        toPra: function (praId) {
            try { if (typeof root.switchTab === 'function') root.switchTab('pra'); } catch (_) {}
            var n = 0, t = setInterval(function () { var P = root.SLCcaReport && root.SLCcaReport.get('pra'); if ((P && P.flash('sec:' + praId)) || ++n > 40) clearInterval(t); }, 150);
        }
    };
    // =================================================================================================================
    // v1.4 (8 Nov 2026): the ZSA page on the shared report frame (cca_report.js). The Autopilot draws the left pane; the
    // frame draws the report from reportSections(), mapped onto its blocks, with this module's figures in its palette.
    // =================================================================================================================
    function _leftHtml() {
        if (!U()) return '';
        var res = compute();
        if (!res) return U().emptyCard('ZSA Autopilot', 'The ZSA Autopilot works the zonal analysis out from the CAD model.').replace('The table below still works by hand.', 'The report on the right still works by hand: Edit a zone or add one.');
        var tot = { q: 0, a: 0, open: 0, done: 0 };
        res.zones.forEach(function (z) { var s = zoneStatus(z); tot.q += s.questions; tot.a += s.answered; tot.open += s.open; if (s.state === 'done') tot.done++; });
        var items = res.zones.map(function (z) { var s = zoneStatus(z); return { key: z.code, label: z.code + ' ' + z.name, sub: s.questions ? (s.answered + ' of ' + s.questions + ' answered' + (s.open ? ', ' + s.open + ' open' : '') + (s.state === 'done' ? ', signed' : '')) : (s.state === 'done' ? 'nothing to ask, signed' : 'nothing to ask'), state: s.state === 'done' ? 'done' : (s.open ? 'open' : 'todo'), on: state.zone === z.code }; });
        var body = state.zone && res.byCode[state.zone] ? _zoneHtml(res, res.byCode[state.zone]) : _overviewHtml(res, tot);
        return '<div class="slap slap-card" data-zsa-auto="1"><div class="slap-head"><span class="slap-title">ZSA Autopilot</span><span class="slap-sub">' + res.zones.length + ' zones, ' + tot.q + ' questions, ' + tot.a + ' answered, ' + tot.open + ' open, ' + tot.done + ' zones signed</span>' + U().progress(tot.a, tot.q) + '</div>'
            + '<div class="slap-nav" style="margin:0 0 8px">' + U().importButtons(true) + '</div>'
            + '<div class="slap-grid"><div>' + U().rail(items, 'SLZsaAuto.ui.zone') + '</div><div data-zsa-auto-body="1">' + body + '</div></div></div>';
    }
    // the CAD picture in the page's palette (the figure helper draws on white)
    function _figIn(svg, C) { return C && C.paper && C.paper !== '#ffffff' ? String(svg).replace(/fill="#ffffff"/g, 'fill="' + C.paper + '"').replace(/fill="#5b6270"/g, 'fill="' + C.sub + '"') : svg; }
    function _sevKind(s) { return sevRank(s) >= 4 ? 'bad' : sevRank(s) >= 3 ? 'warn' : 'plain'; }
    // what one event in the zone takes out, drawn: the zone, the systems lost directly, the knock-on, the failure conditions
    function _lossFigure(sec, C) {
        var F = root.SLCcaReport, L = sec.loss; if (!F || !L || (!L.direct.length && !L.fcs.length)) return null;
        var pos = {}, colsN = [[], [], [], []], edges = [], C0 = C;
        var col = function (ci, list, mk) { list.forEach(function (x) { var b = mk(x); colsN[ci].push({ id: b.id, t: b.t, s: b.s, k: b.k }); pos[b.id] = 1; }); return 0; };
        var h1 = col(0, [sec.code], function (c) { return { id: 'z:' + c, t: sec.title, s: 'The zone', k: 'on' }; });
        var h2 = col(1, L.direct, function (id) { return { id: 's:' + id, t: _sysName(id) || id, s: 'Lost directly', k: 'warn' }; });
        var h3 = col(2, L.knock, function (k) { return { id: 'k:' + k.id, t: k.name || _sysName(k.id) || k.id, s: 'Lost as a knock-on, through ' + (k.from || 'what it depends on'), k: 'off' }; });
        var h4 = col(3, L.fcs, function (f) { return { id: 'fc:' + f.fcId, t: _fcLabel(f.fcId), s: (f.severity || 'Not classified') + ' failure condition', k: _sevKind(f.severity) }; });
        var line = function (a, b) { if (pos[a] && pos[b]) edges.push([a, b]); };
        L.direct.forEach(function (id) { line('z:' + sec.code, 's:' + id); });
        L.knock.forEach(function (k) { var from = L.direct.find(function (id) { return _sysName(id) === k.from; }); line(from ? 's:' + from : 'z:' + sec.code, 'k:' + k.id); });
        var mac = _arr(_pc().macModels);
        L.breaches.forEach(function (b) { var rule = mac.find(function (r) { return r && r.id === b.ruleId; }); var mem = rule ? [].concat.apply([], _arr(rule.clauses).map(function (c) { return _arr(c.of); })) : []; b.fcs.forEach(function (fc) { mem.forEach(function (id) { if (pos['s:' + id]) line('s:' + id, 'fc:' + fc); else if (pos['k:' + id]) line('k:' + id, 'fc:' + fc); }); }); });
        var title = 'What one event in ' + sec.title + ' takes out';
        // v1.x 9 Nov 2026: drawn by the shared column diagram (squared connectors in their own lanes, never through a box)
        var heads = ['ZONE', 'LOST DIRECTLY', 'KNOCK-ON', 'FAILURE CONDITIONS'], fl = F.flow('zsa', { title: title, sub: 'The systems lost directly and as a knock-on, and the failure conditions that trip. Click a box for more.', cols: colsN.map(function (n, i) { return { head: heads[i], nodes: n }; }).filter(function (c) { return c.nodes.length; }), edges: edges });
        return { k: 'fig', name: 'loss-' + sec.code, title: title, svg: fl.svg, w: fl.w, h: fl.h, lead: '{N} draws what one event in the zone takes out.' };
    }
    // reportSections() mapped onto the frame's blocks: sub-headings numbered, tables as rows of named columns, the
    // particular risks as a table with a link into the PRA report for each
    function frameSections(ctx) {
        var C0 = (ctx && ctx.C) || (root.SLCcaReport ? root.SLCcaReport.LIGHT : {});
        return reportSections().map(function (sec) {
            var out = [], n = 0, lossDone = false;
            sec.blocks.forEach(function (b, i) {
                if (b.type === 'h') {
                    // the loss figure closes "what one event loses", before the findings
                    if (/^Findings/.test(b.text) && !lossDone) { var lf = _lossFigure(sec, C0); if (lf) out.push(lf); lossDone = true; }
                    n++; out.push({ k: 'part', text: n + '. ' + b.text }); return;
                }
                if (b.type === 'p') { out.push(b.q ? { k: 'p', text: b.text, q: b.q } : { k: 'p', text: b.text }); return; }
                if (b.type === 'figure') { out.push({ k: 'fig', name: b.id, title: b.title, svg: _figIn(b.svg, C0), w: b.w, h: b.h, lead: '{N} shows the zone on the CAD model.' }); return; }
                if (b.type === 'table') { out.push({ k: 'table', name: b.id, title: b.title, rows: b.rows.map(function (r) { var o = {}; b.columns.forEach(function (c, j) { o[c] = r[j]; }); return o; }) }); return; }
                if (b.type === 'list') {
                    var risks = b.items.filter(function (it) { return it.ref && it.ref.report === 'pra'; });
                    if (risks.length) {
                        out.push({ k: 'table', name: 'zsa-' + sec.code + '-pra', title: 'Particular risks that reach ' + sec.title, rows: risks.map(function (it) { var m = /^(.*?)(?:: (.*) reach this zone in the CAD model)?\. Assessed in the PRA report/.exec(it.text) || []; return { 'Particular risk': m[1] || it.text, 'What reaches this zone': m[2] || 'Recorded in its PRA record', 'Where it is assessed': it.ref.praId ? 'PRA report, section ' + it.ref.praId : 'PRA report' }; }), lead: '{N} names them; each is assessed in the PRA report and not asked again here.' });
                        risks.forEach(function (it) { if (it.ref.praId) out.push({ k: 'act', label: 'Open ' + it.ref.praId + ' in the PRA report', onclick: 'SLZsaAuto.ui.toPra(' + JSON.stringify(it.ref.praId) + ')' }); });
                    }
                    b.items.filter(function (it) { return !(it.ref && it.ref.report === 'pra'); }).forEach(function (it) { out.push({ k: 'p', text: it.text }); });
                }
            });
            out.push({ k: 'act', label: 'Simulate one event in this zone on the Cascading Effects page', onclick: 'ccaSimulate(' + JSON.stringify('zone:' + sec.code) + ')' });
            return { id: sec.code, title: sec.title, blocks: out, edit: true };
        });
    }
    function frameFront() {
        return [
            { k: 'h', level: 1, text: 'Purpose and scope' },
            { k: 'p', text: 'This analysis checks, zone by zone, that the way the aircraft is installed does not let one event (a fire, a leak, a burst or a broken part) take out what the design keeps apart. It covers every zone of the CAD model and every zone with a record of its own.' },
            { k: 'h', level: 1, text: 'Method' },
            { k: 'p', text: 'Each part of the CAD model is placed in its zone and tied to its system. The tool then looks for fluid above electronics whose loss matters, units of one job sitting together, heat close to fuel or hydraulic fluid, and fluid with nowhere to drain, and an engineer decides each case. What one event in a zone loses is worked out from the aircraft model: the systems tied to the zone, what depends on them, and the minimum configuration rules and failure conditions that follow. Particular risks are assessed in the PRA report and named here where they reach a zone.' }
        ];
    }
    var ROLE_OF = { 'zsa.findings': 'Chief safety engineer', 'zsa.changes': 'Design engineering lead', 'zsa.reqs': 'System safety engineer', 'zsa.evidence': 'Installation and zonal lead', 'zsa.cma': 'Aircraft safety lead', 'zsa.severity': 'Chief safety engineer' };
    function _frameIO() {
        var io = reportIO();
        return {
            does: io.does,
            inputs: io.inputs.map(function (i) { return { id: i.id, what: i.what, from: 'the ' + i.from.name, tab: i.from.tab }; }),
            outputs: io.outputs.map(function (o) { return { id: o.id, what: o.what, to: _join(o.to.map(function (t) { return 'the ' + t.name.charAt(0).toLowerCase() + t.name.slice(1); })), tab: o.to[0] ? o.to[0].tab : '', accept: o.accept, role: ROLE_OF[o.id] || 'Chief safety engineer',
                fp: function () { var x = reportOutputs().find(function (y) { return y.id === o.id; }); return x ? x.fingerprint : ''; } }; })
        };
    }
    function _live(id) {
        var res = compute(), secs = reportSections();
        var qs = res ? [].concat.apply([], res.zones.map(activeQuestions)) : [], done = qs.filter(function (q) { return !!optionOf(q); }).length;
        if (id === 'self') return secs.length + ' zones; ' + done + ' of ' + qs.length + ' Autopilot questions answered';
        if (id === 'in:cad') { var CZ = C(), cid = CZ && CZ.latestCadId && CZ.latestCadId(); return cid ? (((CZ.partsOf ? CZ.partsOf(cid) : (CZ.model(cid) || {}).parts) || []).length + ' parts in the CAD model') : 'No CAD model yet'; }
        if (id === 'in:items') return _items().length + ' items';
        if (id === 'in:routing') return _arr(_g('routingData')).length + ' routing records';
        if (id === 'in:fha') return _arr(_g('acFhaData')).length + ' aircraft failure conditions';
        if (id === 'in:mac') return _arr(_pc().macModels).length + ' MAC rules';
        if (id === 'in:pra') return _arr(_g('praData')).length + ' PRA records';
        if (/^out:/.test(id)) { var o = reportOutputs().find(function (x) { return 'out:' + x.id === id; }); if (!o) return ''; var d = o.qids.filter(function (q) { return !!answerOf(q); }).length; return o.qids.length ? d + ' of ' + o.qids.length + ' questions behind it answered' : 'Worked out from the zone records and the model'; }
        if (/^z:/.test(id)) { var z = res && res.byCode[id.slice(2)]; return z ? z.units.length + ' units and ' + z.runs.length + ' runs on the CAD model' : 'Not in the CAD model'; }
        return '';
    }
    function _node(id) {
        if (/^z:/.test(id)) { var code = id.slice(2), sec = reportSections().find(function (s) { return s.code === code; }); var eq = sec ? sec.blocks.find(function (b) { return b.type === 'table' && /-equip$/.test(b.id); }) : null; return { title: sec ? sec.title : code, does: 'The zone. Its section of this report lists everything in it.', inputs: eq ? eq.rows.map(function (r) { return r[1] + ' (' + r[0] + ')'; }) : [], tab: 'cad' }; }
        if (/^[sk]:/.test(id)) { var sid = id.slice(2), s = _sys(sid); return { title: _sysName(sid) || sid, does: id[0] === 's' ? 'Lost directly: something it needs is housed in or routed through the zone.' : 'Lost as a knock-on: it depends on a system that is lost.', inputs: _uniq([].concat.apply([], _arr(s && s.functions).map(function (g) { var t = _arr(g.traceIds); return t.length ? t.map(_sfLabel) : (g.funcName ? [g.funcName] : []); }))), tab: 'sys-dir' }; }
        if (/^fc:/.test(id)) { var fid = id.slice(3), f = _arr(_g('acFhaData')).find(function (x) { return x && x.fcId === fid; }); return { title: _fcLabel(fid), does: f ? 'Severity: ' + (f.severity || 'not classified') + '. ' + (f.effAc || '') : 'A failure condition.', outputs: [{ what: 'A catastrophic outcome of one zonal event needs an accepted zonal disposition', accept: 'Accepted on the Cascading Effects page with who, when and why' }], tab: 'ac-fha' }; }
        return { title: id };
    }
    // Edit and "Add a zone" in the frame's field types; the fields the Autopilot writes stay out of the form
    function _frameFields(code) {
        var ef = editFields(code || null), out = [];
        ef.fields.forEach(function (f) {
            if (f.readOnly) return;
            var x = { key: f.key, label: f.label, hint: f.help || '' };
            if (f.type === 'multi') { x.type = 'checks'; x.options = f.options.map(function (o) { return [String(o[0]), o[1]]; }); x.value = _arr(f.value).map(String); }
            else if (f.type === 'check') { x.type = 'select'; x.options = [['no', 'No'], ['yes', 'Yes']]; x.value = f.value ? 'yes' : 'no'; }
            else if (f.type === 'date') { x.type = 'text'; x.value = f.value || ''; x.hint = 'YYYY-MM-DD'; }
            else if (f.type === 'list') { x.type = 'text'; x.value = f.value || ''; x.hint = 'separate them with commas'; }
            else { x.type = f.type; x.options = f.options; x.value = f.value; }
            if (f.group && !out.some(function (y) { return y.group === f.group; })) x.label = f.group + ': ' + x.label;
            x.group = f.group; out.push(x);
        });
        if (ef.inModel && out[0]) out[0].hint = (out[0].hint ? out[0].hint + ' ' : '') + '(the equipment, what could hurt what and the mitigations are written from the CAD model and the decisions on the left)';
        return out;
    }
    function _frameSave(code, vals) {
        var ef = editFields(code || null), byKey = {}; ef.fields.forEach(function (f) { byKey[f.key] = f; });
        var v = {};
        Object.keys(vals || {}).forEach(function (k) {
            var f = byKey[k]; if (!f || f.readOnly) return; var x = vals[k];
            if (f.type === 'multi') v[k] = _arr(x).map(function (s) { var o = f.options.find(function (oo) { return String(oo[0]) === String(s); }); return o ? o[0] : s; });
            else if (f.type === 'check') v[k] = x === 'yes' || x === true;
            else v[k] = x;
        });
        if (code && byKey.zoneId && byKey.zoneId.readOnly) delete v.zoneId;
        var r = saveZone(v, code ? { internalId: ef.row } : {});
        return r.ok ? { ok: true, id: r.row.zoneId } : { ok: false, err: r.err };
    }
    function defineFrame() {
        if (!root.SLCcaReport || typeof document === 'undefined') return false;
        if (frame()) return true;
        root.SLCcaReport.define({
            key: 'zsa', viewId: 'view-zsa', leftId: 'zsa-auto-host', title: 'Zonal Safety Analysis', code: 'ZSA',
            lead: 'Each zone has its own report. Pick one in the list below: the ZSA Autopilot asks only the real choices for that zone on the left, and its report is written on the right as you answer, with its own document number, revisions and Word file. All zones (register) lists every report.',
            sectionsTitle: 'The zones', front: frameFront, sections: function (ctx) { return frameSections(ctx); },
            // v1.6 (9 Nov 2026): every zone its own report, picked from a dropdown; the questions beside it are that zone's
            renderQuestions: function (R, tab) { if (!tab && state.zone) { state.zone = null; state.step = 0; } if (tab && state.zone !== tab) { state.zone = tab; state.step = 0; _secMemo = null; try { materialize(tab); } catch (_) {} } return _leftHtml(); },
            // v1.7 (9 Nov 2026): the parts the engineer writes for each zone, or drafts with the AI and accepts
            authored: [
                { id: 'mitigations', title: 'Proposed mitigations', purpose: 'Propose the installation changes that would close what is still open in this zone: for each finding, say what would separate, shield, drain, insulate or move the equipment involved, and what that changes. Use only what this report records.' },
                { id: 'compliance', title: 'Path to compliance', purpose: 'Set out how compliance will be shown for this zone: the rules and guidance it is assessed against, the inspection, analysis or test that will show each protection works, the evidence still needed, and who reviews it. Never state that anything is compliant.' },
                { id: 'conclusion', title: 'Conclusion', purpose: 'State what the analysis of this zone concludes: what one event in the zone can take out, whether the separation the design relies on holds with the protections recorded, and what remains open before the zone can be closed.' }
            ],
            aiType: 'ZSA',
            // v1.9: the AI drafts a zone's parts only once every question for that zone is answered
            aiReady: function (sid) { var res = compute(), z = res && res.byCode[sid]; if (!z) return { ready: true, left: [] }; var left = activeQuestions(z).filter(function (q) { return !optionOf(q); }).map(function (q) { return _clean(q.text); }); return { ready: !left.length, left: left }; },
            tabs: { allLabel: 'All zones (register)', noun: 'zone', nounTitle: 'Zone', pickLabel: 'Zone', registerTitle: 'Zonal safety reports' },
            edit: { addLabel: 'Add a zone', fields: _frameFields, save: _frameSave },
            io: _frameIO(), live: _live, node: _node,
            shots: function (id) { return id ? { kind: 'zsa', zone: String(id) } : null; }, shotsFocus: function () { return state.zone || null; },
            onShow: function () { _cache = null; _secMemo = null; try { applyTableSwitch(); } catch (_) {} }
        });
        return true;
    }
    function mount() {
        if (typeof document === 'undefined') return false;
        var v = document.getElementById('view-zsa'); if (!v) return false;
        if (defineFrame()) { try { applyTableSwitch(); } catch (_) {} return true; }
        var host = document.getElementById('zsa-auto-host');
        if (!host) { host = document.createElement('div'); host.id = 'zsa-auto-host'; var head = v.querySelector('.header-with-export'); if (head && head.nextSibling) v.insertBefore(host, head.nextSibling); else v.insertBefore(host, v.firstChild); }
        try { applyTableSwitch(); } catch (_) {}
        if (!v._zsaAutoObs && typeof MutationObserver === 'function') {
            var shown = v.style.display !== 'none';
            v._zsaAutoObs = new MutationObserver(function () { var now = v.style.display !== 'none'; if (now && !shown) { _cache = null; _secMemo = null; try { applyTableSwitch(); render(); } catch (e) { try { console.warn('[zsa-autopilot]', e); } catch (_) {} } } shown = now; });
            v._zsaAutoObs.observe(v, { attributes: true, attributeFilter: ['style', 'class'] });
            if (shown) { try { render(); } catch (_) {} }
        }
        return true;
    }
    if (typeof document !== 'undefined') { var tries = 40, t = setInterval(function () { if (mount() || --tries <= 0) clearInterval(t); }, 250); }
    var api = { VERSION: VERSION, TABLE_RETIRED: TABLE_RETIRED, compute: compute, classify: classify, laneKey: laneKey, worstOf: worstOf, zoneStatus: zoneStatus, activeQuestions: activeQuestions, answer: answer, sign: sign, materialize: materialize, materializeAll: materializeAll, report: report, figures: figures, render: render, ui: ui, state: state,
        reportSections: reportSections, frameSections: frameSections, defineFrame: defineFrame, reportIO: reportIO, reportOutputs: reportOutputs, editFields: editFields, saveZone: saveZone, applyTableSwitch: applyTableSwitch, qCard: qCard, INTRO: INTRO, RULE_NAME: RULE_NAME, onJump: null,
        reset: function () { _cache = null; _secMemo = null; } };
    root.SLZsaAuto = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLZsaAuto;
})(typeof window !== 'undefined' ? window : globalThis);

// ============================================================================
// zsa_engine.js, v1.0, 19 Oct 2026 (build 7): the zonal safety analysis, built from the model.
//
// THE REQUIREMENT (Waqas, 19 Oct 2026, scope confirmed point by point; Safety Lab owns the ZSA): the ZSA fills itself
// in, zone by zone, instead of being a table typed by hand. For every zone:
//   1. what is in it: the equipment the zone model places there (CAD containment or by hand) and every route passing
//      through it (wiring, data bus, hydraulic, fuel, oxygen, bleed air and the rest), with its type and what it serves;
//   2. functional hazards: for each item of equipment, the failure conditions it reaches and the worst severity,
//      through function > FHA > fault tree > equipment (SLCadZonal.impactOfEquipment, the real fault tree engine);
//   3. physical hazards: the PRAs that reach the zone (their footprints), the CAD particular-risk volumes, and the
//      hazards defined for what is in the zone (equipment by its type, routes by theirs); never FMEAs;
//   4. route against route: the separation findings Sys Lab measured on the exact surfaces;
//   5. route against zone hazard: what each hazard can reach in the zone and what losing all of it does;
//   6. one event taking out both sides: redundant channels in the same zone or in the same hazard's reach;
//   7. barriers: no credit without material data; credit only once a requirement on the material is verified;
//   8. every finding is dispositioned by a person (accepted with a reason, mitigated by a requirement, or reopened when
//      what it rests on changes), and it sits on the Golden Thread through the ZSA row of its zone.
//
// HOW A HAZARD'S CONSEQUENCE IS FOUND (no guessing, over-allocated where data is missing):
//   reach = every item in the zone (and in its sub-zones) that the hazard's mechanism can damage, the hazard's own
//   source excepted. Fire, heat, fluid and contamination carry over into a neighbouring zone (sibling, parent or child)
//   unless a CREDITED barrier stands between them (ARP4761A K.4.5.2). An item with no susceptibility on record is taken
//   as susceptible to everything. The consequence of losing the reach is the worse of:
//     the equipment in it, through the fault trees (BDD, exact; non-monotone trees as SLCadZonal handles them), and
//     the functions the routes in it serve: a function with redundant channels (Sys Lab's architecture) is lost when
//     every channel has a route in the reach; a function with one path is lost when a route serving it is reached. Its
//     severity is Safety Lab's own FHA row for each failure condition Sys Lab names (by FC id), else Sys Lab's.
//   A Catastrophic consequence is a violation (a single zonal event must not lead to it); Hazardous and Major are
//   advisories a person dispositions; below Major is shown in the zone and needs no disposition.
//
// Inputs, all already in the project: ZONES (zonal_model.js, zones-3, barriers), SLCadZonal (CAD links, risk volumes,
// containment, the fault tree impact, the one independence check), praData[].affectedZones, EQUIP_HAZARDS
// (equipment type), projectConfig.zoneThreats (per-item emits / susceptible), projectConfig.sysLabPhysical (Sys Lab's
// elements, the equipment they map to, and version 3 routing: routes, clearances, route findings, functions),
// routingData (routes typed in Safety Lab, without geometry), requirements (acReqData, systemsData[].req).
// Dispositions: projectConfig.zsaDispositions[findingId]. Pure: compute() writes nothing; dispose() and
// materialize() write through the change funnel. window.SLZsaEngine + module.exports.
// See tests/regression_zsa_engine_20261019.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';

    // ---- mechanisms (ARP4761A K.1, K.3.1: what an installation can do to its neighbours) ----------------------------
    var MECH = ['fire', 'heat', 'fluid', 'debris', 'pressure', 'mechanical', 'vibration', 'em', 'contamination', 'stored-energy'];
    var MECH_LABEL = { fire: 'fire', heat: 'heat', fluid: 'fluid', debris: 'debris and fragments', pressure: 'pressure release', mechanical: 'mechanical damage', vibration: 'vibration', em: 'electromagnetic interference', contamination: 'contamination', 'stored-energy': 'stored-energy release' };
    var CARRIES_OVER = { fire: 1, heat: 1, fluid: 1, contamination: 1 };   // into a neighbouring zone without a credited barrier
    // what a route of each type can release into its zone (the route's own failure)
    var ROUTE_EMITS = {
        power: [{ id: 'arc', name: 'arcing or a short on power wiring', mechanism: 'fire' }, { id: 'em', name: 'emission from power wiring', mechanism: 'em' }],
        rf: [{ id: 'em', name: 'RF emission', mechanism: 'em' }],
        hydraulic: [{ id: 'leak', name: 'hydraulic fluid leak or spray', mechanism: 'fluid' }, { id: 'fire', name: 'ignition of leaked hydraulic fluid', mechanism: 'fire' }, { id: 'whip', name: 'line burst or pipe whip', mechanism: 'pressure' }],
        fuel: [{ id: 'leak', name: 'fuel leak', mechanism: 'fluid' }, { id: 'fire', name: 'fuel fire or vapor ignition', mechanism: 'fire' }],
        oil: [{ id: 'leak', name: 'oil leak', mechanism: 'fluid' }, { id: 'fire', name: 'oil fire', mechanism: 'fire' }],
        oxygen: [{ id: 'fire', name: 'oxygen-enriched fire', mechanism: 'fire' }, { id: 'burst', name: 'oxygen line burst', mechanism: 'pressure' }],
        water: [{ id: 'leak', name: 'water leak', mechanism: 'fluid' }],
        waste: [{ id: 'leak', name: 'waste leak', mechanism: 'fluid' }, { id: 'contam', name: 'waste contamination and corrosion', mechanism: 'contamination' }],
        bleed: [{ id: 'heat', name: 'hot bleed air or a hot duct surface', mechanism: 'heat' }, { id: 'burst', name: 'bleed duct burst', mechanism: 'pressure' }],
        control: [{ id: 'flail', name: 'a flailing or jammed control cable or rod', mechanism: 'mechanical' }]
    };
    // what a route of each type can be damaged by
    var WIRING_SUSC = ['fire', 'heat', 'fluid', 'debris', 'pressure', 'mechanical', 'vibration', 'contamination'];
    var FLUID_SUSC = ['fire', 'heat', 'debris', 'pressure', 'mechanical', 'vibration'];
    var ROUTE_SUSC = {
        power: WIRING_SUSC, signal: WIRING_SUSC.concat(['em']), data: WIRING_SUSC.concat(['em']), rf: WIRING_SUSC.concat(['em']),
        fiber: ['fire', 'heat', 'debris', 'mechanical'],
        hydraulic: FLUID_SUSC, fuel: FLUID_SUSC, oil: FLUID_SUSC, water: FLUID_SUSC, waste: FLUID_SUSC, oxygen: FLUID_SUSC.concat(['fluid', 'contamination']),
        bleed: ['fire', 'debris', 'pressure', 'mechanical'], air: ['fire', 'debris', 'mechanical'],
        control: ['fire', 'heat', 'debris', 'mechanical', 'fluid']
    };
    var VOLUME_MECH = { rotorBurst: ['debris'], tireBurst: ['debris'], birdStrike: ['debris'], iceShedding: ['debris'], fire: ['fire', 'heat'], fluidLeak: ['fluid'], lightning: ['em', 'heat'], generic: MECH.slice() };
    var PRA_WORDS = [[/rotor|fragment|tire|tyre|wheel|bird|hail|ice|debris|propeller|blade|burst/i, 'debris'], [/fire|thermal runaway|battery|ignit|overheat/i, 'fire'], [/fire|thermal runaway|duct|overheat|hot/i, 'heat'],
                     [/leak|fluid|fuel|hydraul|water/i, 'fluid'], [/decompress|duct rupture|pressure|burst|rupture|container/i, 'pressure'], [/lightning|hirf|emi|electromagnetic/i, 'em'], [/payload|shift|cargo|flail/i, 'mechanical']];
    var THREAT_TO_MECH = { heat: 'heat', fluid: 'fluid', debris: 'debris', emi: 'em', vibration: 'vibration' };
    var SEV = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Safety Effect': 0 };
    function sevRank(s) { var C = _C(); if (C && C.sevRank) { var r = C.sevRank(s); if (r != null && !isNaN(r)) return r; } return SEV[s] != null ? SEV[s] : -1; }
    function sevClass(s) { var r = sevRank(s); return r >= 5 ? 'violation' : r >= 3 ? 'advisory' : 'info'; }

    // ---- reading the project -------------------------------------------------------------------------------------
    function _g(name) {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {}
        try {
            switch (name) {
                case 'projectConfig': return typeof projectConfig !== 'undefined' ? projectConfig : root.projectConfig;
                case 'systemsData': return typeof systemsData !== 'undefined' ? systemsData : root.systemsData;
                case 'praData': return typeof praData !== 'undefined' ? praData : root.praData;
                case 'zsaData': return typeof zsaData !== 'undefined' ? zsaData : root.zsaData;
                case 'routingData': return typeof routingData !== 'undefined' ? routingData : root.routingData;
                case 'acReqData': return typeof acReqData !== 'undefined' ? acReqData : root.acReqData;
                case 'acFhaData': return typeof acFhaData !== 'undefined' ? acFhaData : root.acFhaData;
            }
        } catch (_) {}
        return root[name];
    }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _s(v) { return v == null ? '' : String(v).trim(); }
    function _pc() { var p = _g('projectConfig'); if (p && typeof p === 'object') return p; root.projectConfig = root.projectConfig || {}; return root.projectConfig; }
    function _Z() { return root.ZONES || null; }
    function _C() { return root.SLCadZonal || null; }
    function _H() { return root.EQUIP_HAZARDS || null; }
    function _cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
    function _nat(a, b) { return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'en', { numeric: true, sensitivity: 'base' }) || _cmp(String(a), String(b)); }
    function _uniq(a) { var s = {}, o = []; _arr(a).forEach(function (x) { var k = String(x); if (!s[k]) { s[k] = 1; o.push(x); } }); return o; }
    function _sys() { return _arr(_g('systemsData')); }
    function _sysById(id) { var s = _sys(); for (var i = 0; i < s.length; i++) if (s[i] && String(s[i].id) === String(id)) return s[i]; return null; }
    function _sysName(id) { var s = _sysById(id); return s ? (s.name || String(id)) : String(id); }
    function _fp(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
    function _zl(z) { return z ? (z.code || z.name || z.id) : ''; }

    // ---- requirements and barriers (rule 7) ------------------------------------------------------------------------
    // requirements and the barrier credit rule live in the zone model (zonal_model.js), so every check uses one rule
    var VERIFIED = { 'Verified': 1, 'Passed': 1 };
    function requirement(ref) { var Z = _Z(); return Z && Z.requirement ? Z.requirement(ref) : null; }
    function reqVerified(ref) { var x = requirement(ref); return !!(x && VERIFIED[_s(x.verifStatus || x.vvStatus)]); }
    function barrierCredit(bar) { var Z = _Z(); return Z && Z.barrierCredit ? Z.barrierCredit(bar) : { credit: false, state: 'no-material', text: 'the zone model is not loaded, so no credit' }; }
    function _creditedBetween(a, b) { var Z = _Z(); if (!Z || !Z.barrierBetween) return null; var bar = Z.barrierBetween(a, b); if (!bar) return null; var c = barrierCredit(bar); return c.credit ? { bar: bar, credit: c } : null; }
    // the zones a hazard carries over into: parent, children and siblings, each unless a credited barrier stands between
    function neighbours(zoneId) {
        var Z = _Z(), z = Z && Z.get(zoneId); if (!z) return [];
        var out = [];
        if (z.parentId != null) { out.push(z.parentId); Z.children(z.parentId).forEach(function (c) { if (c.id !== z.id) out.push(c.id); }); }
        Z.children(z.id).forEach(function (c) { out.push(c.id); });
        return _uniq(out);
    }

    // ---- Sys Lab's architecture: routes, elements placed in zones, functions and their declared redundancy ----------
    function routing() { var r = _pc().sysLabPhysical; return r && r.routing && Array.isArray(r.routing.routes) ? r.routing : null; }
    function _phys() { var r = _pc().sysLabPhysical; return r && typeof r === 'object' ? r : null; }
    // a Sys Lab element (by tag or ident) to Safety Lab equipment: the mapping a person confirmed, else the one Sys Lab sent
    function elementEquipment(el) {
        if (!el) return null;
        var rec = _phys() || {}, map = rec.map || {};
        var e = _arr(rec.elements).find(function (x) { return x && ((el.tag && x.tag === el.tag) || (!el.tag && el.ident && x.ident === el.ident)); });
        if (e && map[e.key] && map[e.key].sysId && _sysById(map[e.key].sysId)) return String(map[e.key].sysId);
        if (e && e.slEquipment && _sysById(e.slEquipment)) return String(e.slEquipment);
        return null;
    }
    // the key an element goes by here: its tag, else its ident
    function _ek(el) { return el ? (el.tag || el.ident || null) : null; }
    var TYPED_KIND = { HV: 'power', LV: 'signal', Electrical: 'power', Data: 'data', Fuel: 'fuel', Hydraulic: 'hydraulic', Pneumatic: 'bleed', Mechanical: 'control' };
    // the architecture as the ZSA needs it: { routes, elements, functions } (all from Sys Lab, plus Safety Lab's typed routes)
    function architecture() {
        var Z = _Z(), rec = _phys(), R = routing();
        var res = function (c) { var z = Z && Z.resolve ? Z.resolve(c) : null; return z ? z.id : null; };
        var routes = [], elements = {}, functions = {};
        // elements placed in zones (the installed units), with the functions they perform and the channels they are
        _arr(rec && rec.elements).forEach(function (e) {
            var k = e.tag || e.ident; if (!k) return;
            var zid = res(e.zoneId) || res(e.zone);
            elements[k] = { key: k, tag: e.tag || null, ident: e.ident || null, name: e.name || '', zoneId: zid, performs: _arr(e.performs).slice(), channels: [], equipment: elementEquipment(e), feeds: [] };
        });
        if (R) _arr(R.elements).forEach(function (e) { var k = e.tag || e.ident; if (!k) return; var x = elements[k] || (elements[k] = { key: k, tag: e.tag || null, ident: e.ident || null, name: '', zoneId: null, performs: [], channels: [], equipment: elementEquipment(e), feeds: [] }); x.channels = _arr(e.channels).slice(); });
        if (R) Object.keys(R.functions || {}).forEach(function (f) { functions[f] = Object.assign({ funcId: f }, R.functions[f]); });
        if (R) R.routes.forEach(function (r) {
            var zones = _uniq(_arr(r.zones).map(res).filter(Boolean)), ends = [], to = [], unmapped = [];
            _arr(r.connections).forEach(function (c) { ['from', 'to'].forEach(function (k) { var el = c[k]; if (!el) return; var key = _ek(el); if (key && k === 'to' && to.indexOf(key) < 0) to.push(key); var sid = elementEquipment(el); if (sid) { if (ends.indexOf(sid) < 0) ends.push(sid); } else if (!elements[key] && unmapped.indexOf(key) < 0) unmapped.push(key); }); });
            to.forEach(function (k) { if (elements[k]) elements[k].feeds.push(r.line); });
            routes.push({ key: 'R:' + r.line, line: r.line, source: 'syslab', type: r.type || null, typeName: r.typeName || '', family: r.family || null, lengthMm: r.lengthMm, zones: zones, zoneCodes: _arr(r.zones).slice(),
                          parts: _arr(r.parts), ends: ends.sort(_cmp), to: to.sort(_nat), unmapped: unmapped.sort(_nat), functions: _arr(r.functions).filter(function (f) { return f.ends.indexOf('to') >= 0; }).map(function (f) { return f.funcId; }), channels: _arr(r.channels), connections: _arr(r.connections).map(function (c) { return c.ident; }).filter(Boolean) });
        });
        _arr(_g('routingData')).forEach(function (r) {
            if (!r) return;
            routes.push({ key: 'T:' + (r.routingId || r.internalId), line: _s(r.routingId) || _s(r.name), name: _s(r.name), source: 'typed', type: TYPED_KIND[r.kind] || null, typeName: _s(r.kind), family: null, lengthMm: null,
                          zones: _uniq(_arr(r.routesThroughZones).map(res).filter(Boolean)), zoneCodes: _arr(r.routesThroughZones).slice(), parts: [], ends: [], to: [], unmapped: [], functions: [], safetyFunctions: _arr(r.carriesFunctions).map(String), channels: [], connections: [] });
        });
        // each function: who performs it, the channels it has (declared), and the routes that feed it
        Object.keys(elements).forEach(function (k) { var e = elements[k]; e.performs.forEach(function (f) { var F = functions[f] || (functions[f] = { funcId: f, name: '', severity: null, fcs: [], redundancy: null }); (F.performers = F.performers || []).push(k); }); e.channels.forEach(function (c) { var F = functions[c.funcId] || (functions[c.funcId] = { funcId: c.funcId, name: '', severity: null, fcs: [], redundancy: null }); var ch = F.channelsOf = F.channelsOf || {}; (ch[c.channel] = ch[c.channel] || []).push(k); }); });
        routes.forEach(function (r) { r.functions.forEach(function (f) { var F = functions[f]; if (F) (F.routes = F.routes || []).push(r.line); }); });
        return { routes: routes, elements: elements, functions: functions };
    }

    // ---- consequences --------------------------------------------------------------------------------------------
    function _fhaByFc(fcId) {
        var f = _s(fcId).toUpperCase(); if (!f) return null;
        var hit = null;
        _arr(_g('acFhaData')).forEach(function (r) { if (!hit && r && _s(r.fcId).toUpperCase() === f) hit = r; });
        if (!hit) _sys().forEach(function (s) { _arr(s && s.fha).forEach(function (r) { if (!hit && r && _s(r.fcId).toUpperCase() === f) hit = r; }); });
        // 26 Oct 2026 (Waqas: "we just need the most conservative instances"): an FC written as several rows (one per
        // flight phase) answers with its governing row (SLFcTrees: worst severity, ties longest exposure), never the
        // first row found. SLFcTrees loads late: without it, the first row as before.
        var FT = root.SLFcTrees;
        if (hit && FT && typeof FT.governingOf === 'function') { try { hit = FT.governingOf(hit) || hit; } catch (_) {} }
        return hit;
    }
    // a Sys Lab function's worst consequence: Safety Lab's FHA rows for the FCs Sys Lab names, else Sys Lab's criticality
    function functionSeverity(F) {
        if (!F) return { severity: null, from: 'not known', fcs: [], name: '' };
        var fcs = [], best = null, from = '';
        _arr(F.fcs).forEach(function (x) { var h = _fhaByFc(x.fcId); fcs.push({ fcId: x.fcId, severity: (h && h.severity) || x.severity || null, from: h ? 'Safety Lab FHA' : 'Sys Lab' }); });
        fcs.forEach(function (x) { if (x.severity && (best == null || sevRank(x.severity) > sevRank(best))) { best = x.severity; from = x.from + ', ' + x.fcId; } });
        if (best == null && F.severity) { best = F.severity; from = 'Sys Lab criticality'; }
        return { severity: best, from: from || 'not known', fcs: fcs, name: F.name || '' };
    }
    // The consequence of losing equipment (Safety Lab's), elements (Sys Lab's installed units) and routes, together.
    // An element is lost when it is reached or a route feeding it is. A function is lost FOR CERTAIN when: its declared
    // channels fall below what it needs; or its one performer (or its one feeding route) is lost; or every one of its
    // several performers is. When some but not all of several performers are lost and Sys Lab declares no redundancy for
    // it, whether it is lost depends on how they combine: that is reported (possible), never silently decided.
    var SUPPLY = { power: 'power', hydraulic: 'hydraulic supply', fuel: 'fuel supply', bleed: 'bleed air' };
    function makeImpact(A) {
        var memo = {}, C = _C(), byLine = {}; A.routes.forEach(function (r) { byLine[r.line] = r; });
        function equipImpact(eq) {
            var key = eq.slice().sort(_cmp).join('|'); if (memo[key]) return memo[key];
            var r = C && C.impactOfEquipment ? C.impactOfEquipment(eq) : null;
            memo[key] = r ? { worst: r.worst, conditions: _arr(r.conditions).map(function (c) { return { id: c.fcId || c.id, severity: c.severity }; }), notEvaluated: r.notEvaluated || null } : { worst: null, conditions: [], notEvaluated: 'the zonal engine is not loaded' };
            return memo[key];
        }
        return function (eq, els, lines) {
            eq = _uniq(eq).filter(Boolean); lines = _uniq(lines);
            // A unit is lost for certain when it is reached, or when every route SUPPLYING it with one kind of supply is
            // (all its power, all its hydraulic pressure, all its fuel or all its bleed air: a unit stops without its supply).
            // A lost signal, data or other input may only degrade it: that is a possible loss, said as such.
            var lost = {}, maybe = {}; _uniq(els).forEach(function (k) { lost[k] = 'reached'; });
            var lset = {}; lines.forEach(function (l) { lset[l] = 1; });
            Object.keys(A.elements).forEach(function (k) {
                if (lost[k]) return; var fd = _uniq(A.elements[k].feeds), g = fd.filter(function (l) { return lset[l]; });
                if (!g.length) return;
                var bySupply = {}; fd.forEach(function (l) { var t = byLine[l] && byLine[l].type; if (SUPPLY[t]) (bySupply[t] = bySupply[t] || []).push(l); });
                var cut = Object.keys(bySupply).filter(function (t) { return bySupply[t].every(function (l) { return lset[l]; }); });
                if (cut.length) lost[k] = 'all its ' + cut.map(function (t) { return SUPPLY[t]; }).join(' and ') + ' (' + cut.map(function (t) { return bySupply[t].join(', '); }).join('; ') + ') lost';
                else maybe[k] = g.length + ' of its ' + fd.length + ' inputs (' + g.join(', ') + ') lost';
            });
            var L = function (k) { return lost[k] ? 2 : maybe[k] ? 1 : 0; }, say = function (k) { return k + ' (' + (lost[k] || maybe[k]) + ')'; };
            var E = eq.length ? equipImpact(eq) : { worst: null, conditions: [], notEvaluated: null };
            var certain = [], possible = [];
            Object.keys(A.functions).sort(_nat).forEach(function (f) {
                var F = A.functions[f], why = null, mb = null;
                var ch = F.channelsOf || {}, ns = Object.keys(ch);
                if (ns.length >= 2) {
                    var need = (F.redundancy && F.redundancy.need) || 1, allow = ns.length - need;
                    var cg = ns.filter(function (n) { return ch[n].some(function (k) { return L(k) === 2; }); }), mg = ns.filter(function (n) { return ch[n].some(function (k) { return L(k) >= 1; }); });
                    var txt = function (set) { return set.map(function (n) { return 'channel ' + n + ': ' + ch[n].filter(function (k) { return L(k) >= 1; }).map(say).join(', '); }).join('; '); };
                    if (cg.length > allow) why = cg.length + ' of its ' + ns.length + ' channels lost (' + txt(cg) + ')';
                    else if (mg.length > allow) mb = mg.length + ' of its ' + ns.length + ' channels hit, some only partly (' + txt(mg) + ')';
                } else {
                    var P = _uniq(F.performers || []), Rt = _uniq(F.routes || []);
                    if (P.length) {
                        var gc = P.filter(function (k) { return L(k) === 2; }), gm = P.filter(function (k) { return L(k) >= 1; });
                        if (gc.length === P.length) why = (P.length === 1 ? 'its one performer ' : 'all ' + P.length + ' of its performers ') + gc.map(say).join(', ');
                        else if (gm.length) mb = gm.length + ' of its ' + P.length + ' performers hit (' + gm.map(say).join(', ') + ')' + (P.length > 1 && !F.redundancy ? '; Sys Lab declares no redundancy for it' : '');
                    } else if (Rt.length) {
                        var gr = Rt.filter(function (l) { return lset[l]; });
                        if (gr.length && gr.length === Rt.length) why = (Rt.length === 1 ? 'its one route ' : 'all its routes ') + gr.join(', ');
                        else if (gr.length) mb = gr.length + ' of its ' + Rt.length + ' routes (' + gr.join(', ') + ')' + (!F.redundancy ? '; Sys Lab declares no redundancy for it' : '');
                    }
                }
                if (!why && !mb) return;
                var s = functionSeverity(F), x = { funcId: f, name: s.name, severity: s.severity, from: s.from, why: why || mb };
                (why ? certain : possible).push(x);
            });
            var worst = E.worst, by = E.worst ? 'equipment' : null;
            certain.forEach(function (x) { if (x.severity && (worst == null || sevRank(x.severity) > sevRank(worst))) { worst = x.severity; by = 'function'; } });
            var worstPossible = null; possible.forEach(function (x) { if (x.severity && (worstPossible == null || sevRank(x.severity) > sevRank(worstPossible))) worstPossible = x.severity; });
            return { worst: worst, worstBy: by, conditions: E.conditions, functionsLost: certain, functionsAtRisk: possible, worstPossible: worstPossible, elementsLost: Object.keys(lost).sort(_nat), elementsAtRisk: Object.keys(maybe).sort(_nat), notEvaluated: E.notEvaluated };
        };
    }
    // a finding's class from its consequence: certain Catastrophic is a violation; Hazardous or Major, or a Catastrophic
    // that depends on undeclared redundancy, an advisory; anything less is noted
    function classOf(cons) {
        if (cons.notEvaluated) return 'advisory';
        var c = sevClass(cons.worst);
        if (c !== 'violation' && cons.worstPossible && sevRank(cons.worstPossible) >= 3) return 'advisory';
        return c;
    }
    function consText(cons) {
        if (cons.notEvaluated) return 'Not evaluated: ' + cons.notEvaluated + '.';
        var out = '';
        if (cons.worst) out = 'Losing all of it is ' + cons.worst + ' (' + (cons.worstBy === 'function'
            ? cons.functionsLost.filter(function (x) { return x.severity === cons.worst; }).slice(0, 3).map(function (x) { return 'loss of ' + x.funcId + (x.name ? ' ' + x.name : '') + ': ' + x.why; }).join('; ')
            : 'failure conditions ' + cons.conditions.filter(function (c) { return c.severity === cons.worst; }).map(function (c) { return c.id; }).join(', ') + ', through the fault trees') + ').';
        else out = 'Losing all of it reaches no failure condition for certain.';
        if (cons.worstPossible && (!cons.worst || sevRank(cons.worstPossible) > sevRank(cons.worst))) out += ' It could be ' + cons.worstPossible + ' depending on redundancy Sys Lab does not declare: ' + cons.functionsAtRisk.filter(function (x) { return x.severity === cons.worstPossible; }).slice(0, 3).map(function (x) { return x.funcId + ' (' + x.why + ')'; }).join('; ') + '.';
        return out;
    }

    // ---- what can be damaged, and by what --------------------------------------------------------------------------
    function equipSusceptible(sysId) {
        var t = (_pc().zoneThreats || {})[sysId], s = t && Array.isArray(t.susceptible) ? t.susceptible.map(function (x) { return THREAT_TO_MECH[x] || x; }) : [];
        return s.length ? { mech: s, onRecord: true } : { mech: MECH.slice(), onRecord: false };
    }
    function routeSusceptible(r) { return r && r.type && ROUTE_SUSC[r.type] ? ROUTE_SUSC[r.type] : MECH.slice(); }
    function equipEmits(sysId) {
        var out = [], H = _H();
        if (H && H.hazardsForSystem) H.hazardsForSystem(sysId).forEach(function (h) { if (h.state !== 'unfailed' || h.mechanism === 'heat' || h.mechanism === 'em') out.push({ id: h.id, name: h.name, mechanism: h.mechanism, from: 'its equipment type' }); });
        var t = (_pc().zoneThreats || {})[sysId];
        if (t && t.emits) Object.keys(t.emits).forEach(function (k) { var m = THREAT_TO_MECH[k] || k; if (!out.some(function (x) { return x.mechanism === m; })) out.push({ id: 'zt-' + k, name: k + ' (recorded for this item)', mechanism: m, from: 'its record on the Zonal Model page' }); });
        return out;
    }
    function praMechanisms(p) { var t = _s(p.threat) + ' ' + _s(p.desc || p.description); var m = []; PRA_WORDS.forEach(function (w) { if (w[0].test(t) && m.indexOf(w[1]) < 0) m.push(w[1]); }); return m.length ? m : MECH.slice(); }

    // ---- the analysis --------------------------------------------------------------------------------------------
    function compute(opts) {
        opts = opts || {};
        var Z = _Z(), C = _C();
        var out = { version: VERSION, zones: [], findings: [], gaps: [], inputs: {} };
        if (!Z) { out.gaps.push('The zone model is not loaded.'); return out; }
        var zones = Z.all().filter(Boolean);
        var A = architecture(), rs = A.routes, R = routing(), impact = makeImpact(A);
        var byLine = {}; rs.forEach(function (r) { byLine[r.line] = r; });
        var routesIn = {}; rs.forEach(function (r) { r.zones.forEach(function (zid) { (routesIn[zid] = routesIn[zid] || []).push(r); }); });
        var elsIn = {}; Object.keys(A.elements).forEach(function (k) { var e = A.elements[k]; if (e.zoneId) (elsIn[e.zoneId] = elsIn[e.zoneId] || []).push(k); });
        var cadId = C ? C.latestCadId() : null, cadModel = cadId ? C.model(cadId) : null;
        out.inputs = { zones: zones.length, equipmentPlaced: zones.reduce(function (n, z) { return n + _arr(z.equipment).length; }, 0), elementsPlaced: Object.keys(A.elements).filter(function (k) { return A.elements[k].zoneId; }).length,
                       routesFromSysLab: R ? R.routes.length : 0, routesTyped: rs.filter(function (r) { return r.source === 'typed'; }).length, measured: R ? R.measured.state : 'none', cad: cadModel ? cadModel.fileName : null };
        // what makes the analysis less than complete, said plainly
        if (!_phys()) out.gaps.push('No Sys Lab physical architecture yet: import it (Zonal Model, Sys Lab) so the installed units, the routes, their clearances and the redundancy are in the analysis.');
        else if (!R) out.gaps.push('The Sys Lab file has no routes (version 3): export it again from Sys Lab so the routes, their clearances and their channels are in the analysis.');
        if (R) {
            if (R.cad && cadModel && R.cad.sha256 && cadModel.sha256 && R.cad.sha256 !== cadModel.sha256) out.gaps.push('Sys Lab measured its routes on ' + (R.cad.fileName || 'another CAD file') + ' revision ' + (R.cad.revision || '?') + ', which is not the CAD model here (' + cadModel.fileName + '): import the matching files.');
            if (R.measured.state !== 'ok') out.gaps.push('Sys Lab\'s route clearances are ' + (R.measured.state === 'none' ? 'not measured' : R.measured.state === 'old model' ? 'from an older CAD model' : 'not complete') + ': route against route findings may be missing.');
            var unt = rs.filter(function (r) { return r.source === 'syslab' && !r.type; }).map(function (r) { return r.line; });
            if (unt.length) out.gaps.push('Route' + (unt.length > 1 ? 's ' : ' ') + unt.join(', ') + (unt.length > 1 ? ' have' : ' has') + ' no type, so ' + (unt.length > 1 ? 'they are' : 'it is') + ' taken as damaged by every hazard and releasing none.');
            var unp = Object.keys(A.elements).filter(function (k) { return !A.elements[k].zoneId && A.elements[k].performs.length; });
            if (unp.length) out.gaps.push(unp.length + ' installed unit' + (unp.length > 1 ? 's that perform functions are' : ' that performs functions is') + ' in no zone (' + unp.sort(_nat).slice(0, 8).join(', ') + (unp.length > 8 ? ', ...' : '') + '): place ' + (unp.length > 1 ? 'them' : 'it') + ' in Sys Lab so the zones see ' + (unp.length > 1 ? 'them' : 'it') + '.');
            var undecl = Object.keys(A.functions).filter(function (f) { var F = A.functions[f]; return !(F.channelsOf && Object.keys(F.channelsOf).length >= 2) && _uniq(F.performers || []).length >= 2 && !(F.redundancy); });
            if (undecl.length) out.gaps.push(undecl.length + ' function' + (undecl.length > 1 ? 's are' : ' is') + ' performed by several units with no redundancy declared in Sys Lab (' + undecl.sort(_nat).slice(0, 8).join(', ') + (undecl.length > 8 ? ', ...' : '') + '): where a hazard reaches some of them the analysis says what it could be, not what it is. Declare the redundancy in Sys Lab.');
        }
        var untypedEq = {}; zones.forEach(function (z) { _arr(z.equipment).forEach(function (s) { var x = _sysById(s); if (x && !x.equipType && !((_pc().zoneThreats || {})[s] || {}).emits) untypedEq[s] = 1; }); });
        if (Object.keys(untypedEq).length) out.gaps.push(Object.keys(untypedEq).length + ' placed equipment item' + (Object.keys(untypedEq).length > 1 ? 's have' : ' has') + ' no equipment type, so the hazards ' + (Object.keys(untypedEq).length > 1 ? 'they' : 'it') + ' can release are not in the analysis (' + Object.keys(untypedEq).map(_sysName).sort(_nat).slice(0, 6).join(', ') + '): set the type on the Zonal Model page.');

        // the items in zones (and their sub-zones)
        // A zone reached as the parent of the hazard's zone gives only what is in it directly: its other sub-zones are
        // reached only across their own boundaries (so a credited barrier around a sibling is never bypassed through the parent).
        function itemsIn(zoneIds, directOnly) {
            var eq = {}, el = {}, ln = {};
            directOnly = directOnly || {};
            zoneIds.forEach(function (zid) { (directOnly[zid] ? [Z.get(zid)].filter(Boolean) : Z.subtree(zid)).forEach(function (z) { _arr(z.equipment).forEach(function (s) { eq[s] = 1; }); _arr(elsIn[z.id]).forEach(function (k) { el[k] = 1; }); _arr(routesIn[z.id]).forEach(function (r) { ln[r.line] = 1; }); }); });
            return { eq: Object.keys(eq).sort(_cmp), el: Object.keys(el).sort(_nat), ln: Object.keys(ln).sort(_nat) };
        }
        // a hazard of mechanisms M released in zones (with carry-over), its own sources left out
        function reach(zoneIds, M, skip) {
            skip = skip || {};
            var set = {}, carried = [], blocked = [], direct = {};
            zoneIds.forEach(function (zid) { set[zid] = 1; });
            if (M.some(function (m) { return CARRIES_OVER[m]; })) zoneIds.forEach(function (zid) {
                var zz = Z.get(zid), par = zz ? zz.parentId : null;
                neighbours(zid).forEach(function (n) { if (set[n]) return; var cb = _creditedBetween(zid, n); if (cb) blocked.push({ from: zid, to: n, text: cb.credit.text }); else { set[n] = 1; carried.push({ from: zid, to: n }); if (par != null && n === par) direct[n] = 1; } });
            });
            var it = itemsIn(Object.keys(set), direct);
            var hit = function (susc) { return M.some(function (m) { return susc.indexOf(m) >= 0; }); };
            return { zones: Object.keys(set), carried: carried, blocked: blocked,
                     equipment: it.eq.filter(function (s) { return !(skip.eq && skip.eq[s]) && hit(equipSusceptible(s).mech); }),
                     elements: it.el.filter(function (k) { return !(skip.el && skip.el[k]) && hit(MECH); }),
                     lines: it.ln.filter(function (l) { return !(skip.ln && skip.ln[l]) && hit(routeSusceptible(byLine[l])); }) };
        }
        var findings = {}, fOrder = [];
        function addFinding(f) {
            f.id = 'ZSA:' + f.kind + ':' + f.subject;
            if (findings[f.id]) return findings[f.id];
            f.fingerprint = _fp(JSON.stringify([f.kind, f.severity, f.zoneCodes, f.reach ? [f.reach.equipment, f.reach.elements, f.reach.lines, f.reach.carriedInto] : null, f.consequence ? [f.consequence.worst, f.consequence.worstPossible, f.consequence.functionsLost.map(function (x) { return x.funcId; }), f.consequence.conditions.map(function (c) { return c.id; })] : null, f.measure || null]));
            f.zoneIds = f.zoneIds || []; findings[f.id] = f; fOrder.push(f.id); return f;
        }
        var zl = function (id) { return _zl(Z.get(id)); };
        function reachText(re) {
            return [re.equipment.length ? re.equipment.length + ' equipment item' + (re.equipment.length > 1 ? 's' : '') + ' (' + re.equipment.map(_sysName).join(', ') + ')' : '',
                    re.elements.length ? re.elements.length + ' installed unit' + (re.elements.length > 1 ? 's' : '') + ' (' + re.elements.slice(0, 12).join(', ') + (re.elements.length > 12 ? ', ...' : '') + ')' : '',
                    re.lines.length ? re.lines.length + ' route' + (re.lines.length > 1 ? 's' : '') + ' (' + re.lines.slice(0, 14).join(', ') + (re.lines.length > 14 ? ', ...' : '') + ')' : ''].filter(Boolean).join(', ');
        }
        // 3 and 5: per zone, one finding per mechanism released there, by everything that releases it (ARP4761A K: zone,
        // then hazard); its reach is what that mechanism can damage there and where it carries over
        zones.forEach(function (z) {
            var srcs = {};   // mechanism -> [{ name, from, skip }]
            var add = function (m, s) { (srcs[m] = srcs[m] || []).push(s); };
            _arr(z.equipment).forEach(function (s) { equipEmits(s).forEach(function (h) { add(h.mechanism, { name: _sysName(s) + ': ' + h.name, from: h.from, kind: 'eq', id: s }); }); });
            _arr(routesIn[z.id]).forEach(function (r) { _arr(ROUTE_EMITS[r.type]).forEach(function (h) { add(h.mechanism, { name: r.line + ': ' + h.name, from: r.typeName || r.type, kind: 'ln', id: r.line }); }); });
            Object.keys(srcs).sort().forEach(function (m) {
                var ss = srcs[m], skip = { eq: {}, el: {}, ln: {} };
                if (ss.length === 1) skip[ss[0].kind][ss[0].id] = 1;   // one source does not damage itself; with two, each reaches the other
                var re = reach([z.id], [m], skip);
                if (!re.equipment.length && !re.elements.length && !re.lines.length) return;
                var cons = impact(re.equipment, re.elements, re.lines);
                addFinding({ kind: 'hazard-zone', subject: _zl(z) + ':' + m, severity: classOf(cons), zoneIds: [z.id], zoneCodes: [_zl(z)], mechanism: m,
                             hazard: { name: (MECH_LABEL[m] || m) + ' in ' + _zl(z), mechanisms: [m], sources: ss.map(function (x) { return x.name; }) },
                             reach: { equipment: re.equipment, elements: re.elements, lines: re.lines, carriedInto: _uniq(re.carried.map(function (c) { return zl(c.to); })), blockedBy: re.blocked.map(function (b) { return zl(b.to) + ': ' + b.text; }) },
                             consequence: cons,
                             text: (MECH_LABEL[m] || m).charAt(0).toUpperCase() + (MECH_LABEL[m] || m).slice(1) + ' in ' + _zl(z) + ' (from ' + ss.slice(0, 6).map(function (x) { return x.name; }).join('; ') + (ss.length > 6 ? '; and ' + (ss.length - 6) + ' more' : '') + ') can reach ' + reachText(re) +
                                   (re.carried.length ? ', carrying into ' + _uniq(re.carried.map(function (c) { return zl(c.to); })).join(', ') + ' (no credited barrier)' : '') + '. ' + consText(cons) });
            });
        });
        // 3 and 5: PRAs on their footprints
        _arr(_g('praData')).forEach(function (p) {
            if (!p || p.disposition === 'na' || !_arr(p.affectedZones).length) return;
            var zids = _uniq(p.affectedZones.map(function (c) { var x = Z.resolve ? Z.resolve(c) : null; return x ? x.id : null; }).filter(Boolean));
            if (!zids.length) return;
            var M = praMechanisms(p), re = reach(zids, M, null);
            if (!re.equipment.length && !re.elements.length && !re.lines.length) return;
            var cons = impact(re.equipment, re.elements, re.lines), nm = (p.praId ? p.praId + ' ' : '') + _s(p.threat);
            addFinding({ kind: 'hazard-pra', subject: _s(p.praId || p.internalId), severity: classOf(cons), zoneIds: zids, zoneCodes: zids.map(zl), praId: p.praId || null,
                         hazard: { name: nm, mechanisms: M, sources: ['the PRA footprint'] },
                         reach: { equipment: re.equipment, elements: re.elements, lines: re.lines, carriedInto: _uniq(re.carried.map(function (c) { return zl(c.to); })), blockedBy: re.blocked.map(function (b) { return zl(b.to) + ': ' + b.text; }) },
                         consequence: cons, text: nm + ' (its footprint: ' + zids.map(zl).join(', ') + ') can reach ' + reachText(re) + '. ' + consText(cons) });
        });
        // 3 and 5: CAD particular-risk volumes, by what they geometrically hold (equipment by linked parts, routes by theirs)
        if (C && cadId) {
            var pidLine = {}; rs.forEach(function (r) { r.parts.forEach(function (pid) { pidLine[pid] = r.line; }); });
            C.riskVolumes().forEach(function (v) {
                var parts = C.partsInVolume(v.id, cadId), conf = C.confirmed(cadId), eq = {}, ln = {};
                parts.forEach(function (p) { if (conf[p.pid]) eq[conf[p.pid]] = 1; if (pidLine[p.pid]) ln[pidLine[p.pid]] = 1; });
                var M = VOLUME_MECH[v.kind] || MECH.slice(), hit = function (susc) { return M.some(function (m) { return susc.indexOf(m) >= 0; }); };
                var eqs = Object.keys(eq).filter(function (s) { return hit(equipSusceptible(s).mech); }).sort(_cmp);
                var lns = Object.keys(ln).filter(function (l) { return hit(routeSusceptible(byLine[l])); }).sort(_nat);
                // installed units of Sys Lab whose CAD part is inside
                var els = Object.keys(A.elements).filter(function (k) { var e = (_phys().elements || []).find(function (x) { return (x.tag || x.ident) === k; }); return e && e.cadPart && parts.some(function (p) { return p.pid === e.cadPart || p.designator === e.cadPart || p.name === e.cadPart; }); }).sort(_nat);
                if (!eqs.length && !lns.length && !els.length) return;
                var cons = impact(eqs, els, lns), zs = {};
                eqs.forEach(function (s) { var zz = Z.zoneOf(s); if (zz) zs[zz.id] = 1; });
                lns.forEach(function (l) { byLine[l].zones.forEach(function (zid) { zs[zid] = 1; }); });
                els.forEach(function (k) { if (A.elements[k].zoneId) zs[A.elements[k].zoneId] = 1; });
                var zids = Object.keys(zs).sort(function (a, b) { return _nat(zl(a), zl(b)); }), re = { equipment: eqs, elements: els, lines: lns };
                addFinding({ kind: 'hazard-volume', subject: v.id, severity: classOf(cons), zoneIds: zids, zoneCodes: zids.map(zl), volumeId: v.id, praId: v.praId || null,
                             hazard: { name: v.label || v.kind, mechanisms: M, sources: ['the CAD particular-risk volume'] }, reach: { equipment: eqs, elements: els, lines: lns, carriedInto: [], blockedBy: [] }, consequence: cons,
                             text: (v.label || v.kind) + ' (CAD volume' + (v.praId ? ', ' + v.praId : '') + ') reaches ' + reachText(re) + '. ' + consText(cons) });
            });
        }
        // 4: route against route, as Sys Lab measured it
        if (R) {
            R.findings.rules.forEach(function (x) {
                var zz = x.zone && Z.resolve ? Z.resolve(x.zone) : null;
                addFinding({ kind: 'route-route', subject: x.rule + ':' + x.lines.join('|') + (x.kind ? ':' + x.kind : ''), severity: x.sev === 'error' ? 'violation' : x.sev === 'warn' ? 'advisory' : 'info', zoneIds: zz ? [zz.id] : [], zoneCodes: zz ? [_zl(zz)] : (x.zone ? [x.zone] : []),
                             lines: x.lines.slice(), measure: { d: x.d, alongMm: x.alongMm, at: x.at }, rule: x.rule, text: x.text + ' (measured in Sys Lab on the exact surfaces)' });
            });
            // 6: redundant channels closer than the program's separation
            R.findings.close.forEach(function (x) {
                var zz = x.zone && Z.resolve ? Z.resolve(x.zone) : null, s = functionSeverity(A.functions[x.funcId]);
                addFinding({ kind: 'channels-close', subject: x.funcId + ':' + x.lines.join('|'), severity: 'violation', zoneIds: zz ? [zz.id] : [], zoneCodes: zz ? [_zl(zz)] : [], lines: x.lines.slice(), funcId: x.funcId, measure: { d: x.clearMm, at: x.at },
                             consequence: { worst: s.severity, worstBy: 'function', conditions: [], functionsLost: [{ funcId: x.funcId, name: s.name, severity: s.severity, from: s.from, why: 'channels ' + x.channels.join(' and ') }], functionsAtRisk: [], worstPossible: null, elementsLost: [], notEvaluated: null },
                             text: x.text + ' One local event between them takes out both channels' + (s.severity ? ' (' + s.severity + ', ' + s.from + ')' : '') + '.' });
            });
        }
        // 6: redundant channels in the same zone, and whether one hazard found above reaches enough of them
        Object.keys(A.functions).sort(_nat).forEach(function (fn) {
            var F = A.functions[fn], ch = F.channelsOf || {}, ns = Object.keys(ch); if (ns.length < 2) return;
            var need = (F.redundancy && F.redundancy.need) || 1;
            var chanZones = {}; ns.forEach(function (n) { var zs = {}; ch[n].forEach(function (k) { var e = A.elements[k]; if (e && e.zoneId) zs[e.zoneId] = 1; e && e.feeds.forEach(function (l) { (byLine[l] || { zones: [] }).zones.forEach(function (zid) { zs[zid] = 1; }); }); }); chanZones[n] = zs; });
            zones.forEach(function (z) {
                var here = ns.filter(function (n) { return chanZones[n][z.id]; });
                if (here.length <= ns.length - need) return;
                var reachedBy = fOrder.map(function (id) { return findings[id]; }).filter(function (f) { return f.hazard && f.consequence && f.zoneIds.indexOf(z.id) >= 0 && f.consequence.functionsLost.some(function (x) { return x.funcId === fn; }); });
                var s = functionSeverity(F);
                addFinding({ kind: 'channels-zone', subject: fn + ':' + _zl(z), severity: reachedBy.length ? sevClass(s.severity) : 'advisory', zoneIds: [z.id], zoneCodes: [_zl(z)], funcId: fn,
                             reachedBy: reachedBy.map(function (f) { return f.id; }), consequence: { worst: reachedBy.length ? s.severity : null, worstBy: 'function', conditions: [], functionsLost: reachedBy.length ? [{ funcId: fn, name: s.name, severity: s.severity, from: s.from, why: 'channels ' + here.join(' and ') }] : [], functionsAtRisk: reachedBy.length ? [] : [{ funcId: fn, name: s.name, severity: s.severity, from: s.from, why: 'channels ' + here.join(' and ') + ' share the zone' }], worstPossible: reachedBy.length ? null : s.severity, elementsLost: [], notEvaluated: null },
                             text: 'Channels ' + here.join(' and ') + ' of ' + fn + (s.name ? ' ' + s.name : '') + ' (' + (s.severity || 'severity not known') + ') are both in ' + _zl(z) + ', as units or as the routes that feed them. ' + (reachedBy.length ? 'A hazard there reaches enough of them to lose it: ' + reachedBy.map(function (f) { return f.hazard && f.hazard.name ? f.hazard.name : (f.kind + ' ' + f.subject); }).join('; ') + '.' : 'No hazard on record there reaches enough of them; confirm that no zonal event can.') });
            });
        });
        // 6: equipment independence, from the one check (violations and advisories with a zone or volume)
        if (C && C.independenceFlags) C.independenceFlags({ cadId: cadId }).forEach(function (fl) {
            var zz = fl.zoneId ? Z.get(fl.zoneId) : null;
            addFinding({ kind: 'independence', subject: fl.id, severity: fl.severity === 'violation' ? 'violation' : 'advisory', zoneIds: zz ? [zz.id] : [], zoneCodes: zz ? [_zl(zz)] : [], gate: fl.gate, treeId: fl.treeId, equipment: fl.equipment.slice(), flag: fl.kind, text: fl.text });
        });

        // the zones, each with what is in it and what was found there
        var all = fOrder.map(function (id) { return findings[id]; });
        zones.slice().sort(function (a, b) { return _nat(a.code || a.id, b.code || b.id); }).forEach(function (z) {
            var it = itemsIn([z.id]), zoneEvent = impact(it.eq, it.el, it.ln);
            out.zones.push({
                zoneId: z.id, code: z.code || '', name: z.name || '', parentCode: z.parentId != null ? zl(z.parentId) : '', depth: Z.depth(z.id), hasVolume: !!z.volume, subZones: Z.subtree(z.id).length - 1,
                equipment: _arr(z.equipment).slice().sort(_cmp).map(function (s) { var x = _sysById(s), im = impact([s], [], []); return { sysId: s, name: _sysName(s), equipType: x && x.equipType ? x.equipType : null, susceptibleOnRecord: equipSusceptible(s).onRecord, emits: equipEmits(s).map(function (h) { return h.name; }), worst: im.worst, conditions: im.conditions, notEvaluated: im.notEvaluated }; }),
                elements: _arr(elsIn[z.id]).slice().sort(_nat).map(function (k) { var e = A.elements[k], im = impact([], [k], []); return { key: k, ident: e.ident, name: e.name, performs: e.performs, channels: e.channels, equipment: e.equipment ? _sysName(e.equipment) : null, worst: im.worst, worstPossible: im.worstPossible, functionsLost: im.functionsLost }; }),
                routes: _arr(routesIn[z.id]).map(function (r) { return r.line; }).sort(_nat).map(function (l) { var r = byLine[l], im = impact([], [], [l]); return { line: l, source: r.source, type: r.type, typeName: r.typeName, family: r.family, lengthMm: r.lengthMm, feeds: r.to, unmapped: r.unmapped, channels: r.channels, worst: im.worst, worstPossible: im.worstPossible, functionsLost: im.functionsLost }; }),
                zoneEvent: { worst: zoneEvent.worst, worstBy: zoneEvent.worstBy, worstPossible: zoneEvent.worstPossible, conditions: zoneEvent.conditions, functionsLost: zoneEvent.functionsLost, notEvaluated: zoneEvent.notEvaluated },
                barriers: (Z.barriers ? Z.barriers() : []).filter(function (b) { return b.a === z.id || b.b === z.id; }).map(function (b) { return { to: zl(b.a === z.id ? b.b : b.a), type: b.type, material: b.material || '', requirementId: b.requirementId || '', credit: barrierCredit(b) }; }),
                findings: all.filter(function (f) { return f.zoneIds.indexOf(z.id) >= 0; }).map(function (f) { return f.id; })
            });
        });
        var order = { violation: 0, advisory: 1, info: 2 };
        out.findings = all.sort(function (a, b) { return (order[a.severity] - order[b.severity]) || _nat(a.zoneCodes[0] || '', b.zoneCodes[0] || '') || _cmp(a.id, b.id); });
        // 8: the person's dispositions, against what each finding rests on now
        var D = _pc().zsaDispositions || {};
        out.findings.forEach(function (f) {
            var d = D[f.id];
            f.needsDisposition = f.severity !== 'info';
            f.status = !d ? (f.needsDisposition ? 'open' : 'noted') : d.fingerprint !== f.fingerprint ? 'reopened' : d.state;
            f.disposition = d ? { state: d.state, reason: d.reason || '', requirementId: d.requirementId || '', by: d.by || '', at: d.at || '', stale: d.fingerprint !== f.fingerprint, requirementVerified: d.requirementId ? reqVerified(d.requirementId) : null } : null;
        });
        out.summary = { zones: out.zones.length, findings: out.findings.length, violations: out.findings.filter(function (f) { return f.severity === 'violation'; }).length, advisories: out.findings.filter(function (f) { return f.severity === 'advisory'; }).length,
                        open: out.findings.filter(function (f) { return f.status === 'open' || f.status === 'reopened'; }).length };
        return out;
    }

    // ---- 8: a person's disposition of a finding ---------------------------------------------------------------------
    var STATES = ['accepted', 'mitigated'];
    function dispose(findingId, o, by) {
        o = o || {};
        var who = _s(by); if (!who) return { ok: false, err: 'A disposition needs the name of who made it.' };
        if (STATES.indexOf(o.state) < 0) return { ok: false, err: 'A finding is accepted (with the reason) or mitigated (by a requirement).' };
        var res = compute(), f = res.findings.find(function (x) { return x.id === findingId; });
        if (!f) return { ok: false, err: 'No such finding now: the model may have changed. Update the analysis and look again.' };
        var reason = _s(o.reason), rq = _s(o.requirementId);
        if (o.state === 'accepted' && reason.length < 10) return { ok: false, err: 'Say why it is acceptable (at least a sentence).' };
        if (o.state === 'mitigated') { if (!rq) return { ok: false, err: 'A mitigation names the requirement that carries it.' }; if (!requirement(rq)) return { ok: false, err: 'Requirement ' + rq + ' is not in this project.' }; }
        var pc = _pc(); if (!pc.zsaDispositions || typeof pc.zsaDispositions !== 'object') pc.zsaDispositions = {};
        pc.zsaDispositions[findingId] = { state: o.state, reason: reason, requirementId: rq, by: who, at: o.at || new Date().toISOString(), fingerprint: f.fingerprint, severity: f.severity };
        _save();
        return { ok: true, finding: findingId };
    }
    function undispose(findingId) { var pc = _pc(); if (pc.zsaDispositions && pc.zsaDispositions[findingId]) { delete pc.zsaDispositions[findingId]; _save(); return { ok: true }; } return { ok: false, err: 'nothing to undo' }; }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); else if (root.scheduleAutosave) root.scheduleAutosave(); } catch (_) {} }

    // ---- the ZSA table: one row per zone with anything in it, written from the analysis --------------------------------
    // Rows the analysis writes carry origin 'zsa-engine' and are rewritten each time; rows typed by people are never touched.
    var ORIGIN = 'zsa-engine';
    function rowsFrom(res) {
        return res.zones.filter(function (z) { return z.equipment.length || z.elements.length || z.routes.length; }).map(function (z) {
            var fs = res.findings.filter(function (f) { return z.findings.indexOf(f.id) >= 0 && f.needsDisposition; });
            var open = fs.filter(function (f) { return f.status === 'open' || f.status === 'reopened'; });
            var housed = {}; z.equipment.forEach(function (e) { var s = _sysById(e.sysId); _arr(s && s.functions).forEach(function (fn) { if (fn && (fn.funcId || fn.id)) housed[fn.funcId || fn.id] = 1; }); });
            // the worst zonal event in this zone: everything in it lost, or a hazard here that carries further
            var worst = z.zoneEvent.worst;
            fs.forEach(function (f) { var w = f.consequence && f.consequence.worst; if (w && sevRank(w) > sevRank(worst)) worst = w; });
            return { zoneId: z.code || z.zoneId, zoneName: z.name, desc: (z.name || z.code) + (z.parentCode ? ', in ' + z.parentCode : ''),
                     equip: z.equipment.map(function (e) { return e.name; }).concat(z.elements.map(function (e) { return e.key + (e.name ? ' ' + e.name : ''); })).concat(z.routes.map(function (r) { return 'route ' + r.line + (r.typeName ? ' (' + r.typeName.toLowerCase() + ')' : ''); })).join(', '),
                     severity: worst || 'No Safety Effect', housedFunctions: Object.keys(housed).sort(_nat),
                     interference: fs.length ? fs.slice(0, 6).map(function (f) { return (f.severity === 'violation' ? 'VIOLATION: ' : '') + f.text; }).join(' | ') + (fs.length > 6 ? ' | and ' + (fs.length - 6) + ' more' : '') : 'No zonal hazard reaches a failure condition of Major or worse.',
                     mitigation: fs.length ? fs.map(function (f) { return f.disposition && !f.disposition.stale ? f.id.split(':')[1] + ' ' + f.disposition.state + (f.disposition.requirementId ? ' by ' + f.disposition.requirementId : '') + ': ' + f.disposition.reason : ''; }).filter(Boolean).join(' | ') || 'Open: ' + open.length + ' finding' + (open.length === 1 ? '' : 's') + ' to disposition.' : 'None needed.',
                     findingStatus: open.length ? 'open' : 'closed', assessedBy: 'Safety Lab zonal analysis ' + VERSION, assessMethod: 'Computed from the zone model, CAD, Sys Lab routes and the fault trees (ARP4761A Appendix K)', assessedOn: (new Date().toISOString()).slice(0, 10),
                     origin: ORIGIN, zsaFindings: fs.map(function (f) { return { id: f.id, severity: f.severity, status: f.status }; }) };
        });
    }
    function materialize(opts) {
        opts = opts || {};
        var res = opts.result || compute(), store = _g('zsaData'); if (!Array.isArray(store)) return { ok: false, err: 'The ZSA table is not loaded.' };
        var want = rowsFrom(res), created = 0, updated = 0, removed = 0;
        var byZone = {}; want.forEach(function (r) { byZone[r.zoneId] = r; });
        for (var i = store.length - 1; i >= 0; i--) { var x = store[i]; if (x && x.origin === ORIGIN && !byZone[x.zoneId]) { store.splice(i, 1); removed++; } }
        want.forEach(function (r) {
            var ex = store.find(function (x) { return x && x.origin === ORIGIN && x.zoneId === r.zoneId; });
            if (ex) { var keep = { internalId: ex.internalId, modelLinks: ex.modelLinks }; Object.keys(ex).forEach(function (k) { if (k !== 'internalId' && k !== 'modelLinks') delete ex[k]; }); Object.assign(ex, r, keep); updated++; }
            else { store.push(Object.assign({ internalId: (typeof newRowId === 'function') ? newRowId() : ('zsa-e-' + _fp(r.zoneId)) }, r)); created++; }
        });
        _save();
        return { ok: true, created: created, updated: updated, removed: removed, rows: want.length };
    }

    var api = { VERSION: VERSION, MECH: MECH, MECH_LABEL: MECH_LABEL, ROUTE_EMITS: ROUTE_EMITS, ROUTE_SUSC: ROUTE_SUSC, VOLUME_MECH: VOLUME_MECH,
        compute: compute, dispose: dispose, undispose: undispose, materialize: materialize, rowsFrom: rowsFrom, architecture: architecture,
        barrierCredit: barrierCredit, requirement: requirement, reqVerified: reqVerified, routing: routing, elementEquipment: elementEquipment,
        functionSeverity: functionSeverity, neighbours: neighbours, sevClass: sevClass, praMechanisms: praMechanisms };
    try { root.SLZsaEngine = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

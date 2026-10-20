// ============================================================================
// zonal_exchange.js, v1.3 (1.1, 17 Oct 2026: each risk carries its volume's shape; 1.2: says when CAD part sizes are still being read; 1.3, 19 Oct 2026: reads Sys Lab's routes (version 3) and sends the zonal safety analysis), 15 Oct 2026: the exchange between Safety Lab's CAD / zonal /
// particular risk picture and Sys Lab's model (functions and the physical architecture).
// window.SLZonalExchange (page) + module.exports (node tests).
//
// WAQAS'S RULING (13 Oct 2026, confirmed 15 Oct 2026): Sys Lab holds the functions and the
// architecture; the CAD model in Safety Lab defines the zones, the zone tree, the CAD parts,
// the risk volumes and which parts sit inside each zone and each risk; the fault trees say
// which equipment drives which failure condition. The tool connects the dots, per function:
// function -> elements that perform it -> zones they sit in -> zonal hazards and particular
// risks that reach them -> failure conditions and severity. Deterministic code only: no AI
// runs here and nothing is guessed. Where something is not known, the file says so.
//
// ---------------------------------------------------------------------------------------
// FILE 1: Safety Lab to Sys Lab, "safetylab-zonal" version 1 (exportPicture). A JSON object:
//   format: 'safetylab-zonal', version: 1, generator, projectName, exportedAt
//   contentHash        FNV-1a of everything below (exportedAt and contentHash left out), so
//                      two exports of the same project are byte-for-byte comparable
//   cad                { cadId, revision, fileName, partCount, partsComplete } or null
//   rules              the engine's own rules, in words (SLCadZonal.RULES)
//   kindLabels         plain names of the risk kinds
//   zones   [{ id, code, name, parentId, parentCode, depth, source, hasVolume, equipment:[sysId] }]
//                      the zone tree (adjacency list); equipment = placed in that zone
//   equipment [{ sysId, name, designator, partNumbers:[], ata, zoneId, parts:[pid],
//                cadZoneIds:[zoneId], functions:[{ funcId, name, traces:[] }] }]
//                      Safety Lab's equipment (systemsData), its confirmed CAD parts and the
//                      zones those parts sit in
//   parts   [{ pid, name, partNumber, designator, ata, equipment, zoneId, straddles:[zoneId],
//              ambiguousWith:[zoneId] }]
//                      the CAD parts with their containment. Every part when the model has
//                      at most PART_LIMIT parts; above that only the parts that matter (linked,
//                      carrying a designator, or inside a risk volume): partsComplete = false
//   risks   [{ id, kind, label, source, praId, parts:[pid], equipment:[sysId],
//              zoneIds:[zoneId], conditions:[{ id, fcId, desc, severity, domain }], worst,
//              notEvaluated, mitigation, shape?, shapeUnits?, shapeIssue? }]
//                      particular-risk volumes, through the fault trees (SLCadZonal.riskImpact).
//                      1.1, 17 Oct 2026, still format version 1 (an added field; older readers
//                      skip it, older files have none): shape is the volume exactly as Safety Lab
//                      stores it, { kind:'box', min, max } | { kind:'sphere', center, radius } |
//                      { kind:'cone', apex, axis, halfAngleDeg, length? } | { kind:'disk-sector',
//                      center, axis, range|radius?, spreadDeg?, fragment?, fromDeg?, toDeg?,
//                      refDir? } (cad_zonal.js shapeIssue / inShape); shapeUnits 'mm' (lengths in
//                      millimeters, angles in degrees); shapeIssue, only when the engine refuses
//                      the shape, says why in words
//   zoneHazards [{ zoneId, equipment:[sysId], conditions:[...], worst, notEvaluated,
//                  zsaRows:[{ id, zone, desc, equip, severity, interference, mitigation }] }]
//                      a zone compromised: everything in it and its sub-zones fails together
//                      (SLCadZonal.zoneImpact), plus the Zonal Safety Analysis rows of the zone
//   exposures [{ sysId, kind, risk, label, worst, src, pids:[pid] }]
//                      every particular risk each piece of equipment is exposed to: volumes,
//                      rotor burst sweeps, tire bursts, bird strike, lightning zones
//                      (SLPraModels.equipmentExposures, the same source as the per-function view)
//   praRows [{ id, threat, affectedZones:[text], zoneIds:[zoneId], mitigation }]
//                      the Particular Risk Analysis table rows, their zones resolved exactly
//   sysLabMap [{ key, tag, ident, sysId, on }]
//                      Sys Lab elements already mapped to equipment here (FILE 2 below)
//   gaps    [text]     what is missing, in words
//   zsa, zsaHash       1.3 (19 Oct 2026, build 7), still format version 1 (added fields, outside contentHash, with
//                      their own fingerprint): the zonal safety analysis (zsa_engine.js), read only in Sys Lab:
//                      { engine, summary:{zones,findings,violations,advisories,open}, gaps:[text],
//                        zones:[{ zoneId, code, name, worst, findings:[id] }],
//                        findings:[{ id, kind, severity, status, zoneIds, zoneCodes, funcId, lines:[line],
//                                    elements:[tag], equipment:[sysId], functions:[funcId], functionsAtRisk:[funcId],
//                                    worst, worstPossible, text, disposition:{ state, reason, requirementId,
//                                    requirementVerified, by, at, stale } | null }] }
//
// FILE 2: Sys Lab to Safety Lab, "syslab-physical" versions 1 and 2 (Sys Lab, SX.physical):
//   functions [{ funcId, name, level, system, parent }], elements [{ tag, ident, name, kind,
//   system, partOf, partNumber, zone, cadPart, performs:[funcId] }], allocations, zones;
//   version 2 adds systems [{ code, name, slSystem, performs }], traces on each function (the functions it
//   realizes, by ID) and, per element, zoneId
//   (the Safety Lab zone id) and slEquipment (the equipment it was mapped to in Sys Lab).
//   version 3 (19 Oct 2026, build 7) adds routing: the routes of the CAD model for the zonal safety analysis,
//   { cad:{cadId,sha256,fileName,revision}, sepMm, up, rules:[{id,name,a,b,minMm,preferMm,above,clampMm,own,
//   why,source}], routes:[{line, type, typeName, family, typeFrom, lengthMm, lengthFrom, found, parts:[pid],
//   zones:[code], harness, connections:[{ident,name,type,from:{ident,tag,name},to}], functions:[{funcId,ends}],
//   channels:[{funcId,channel,of,element}]}], measured:{state,why,at,by,bandMm,pairs:[{a,b,d,pa,pb,near}]},
//   findings:{rules,close,unset}, functions:{funcId:{name,severity,why,fcs:[{fcId,severity}]}} }. Facts measured or
//   declared in Sys Lab; the safety judgement is made here.
//   Stored as projectConfig.sysLabPhysical (importSysLab), written through SLChangeAck.batch.
//
// THE MAPPING RULE (both directions, the CAD link rule of cad_zonal.js): a mapping is to one
// installed unit. It is exact, and offered to accept, only on an identifier that is unique on
// both sides: the equipment tag equal to the equipment's designator, a CAD part named by the
// element that is linked to exactly one equipment item, or a mapping already confirmed in the
// other tool. A shared part number or a similar name is only a candidate the engineer confirms
// or rejects. Rejected pairs never come back. Nothing is mapped without a click.
//
// See tests/regression_zonal_exchange_20261015.test.js.
// ============================================================================
(function (root) {
    'use strict';

    var VERSION = '1.3';
    var FORMAT = 'safetylab-zonal', FORMAT_VERSION = 1, SHAPE_UNITS = 'mm';
    var PART_LIMIT = 20000;
    var KIND_LABELS = { rotorBurst: 'Rotor burst', tireBurst: 'Tire burst', birdStrike: 'Bird strike', fire: 'Fire', fluidLeak: 'Fluid leak', iceShedding: 'Ice shedding', lightning: 'Lightning', generic: 'Other particular risk', volume: 'Particular risk volume', zonal: 'Zonal hazard', zone: 'Zone compromised', zsa: 'Zonal safety analysis row' };
    var ON_LABELS = { syslab: 'mapped in Sys Lab', designator: 'equipment tag equals the designator', cadPart: 'the CAD part it names is linked to this equipment', system: 'same system, matched at the Safety Lab import of Sys Lab', partNumber: 'same part number', name: 'similar name', confirmed: 'confirmed by an engineer' };

    // ---- reads (SLEnv first, then the bare global, then window) ----------------------------
    function _g(name) {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {}
        try {
            switch (name) {
                case 'projectConfig': if (typeof projectConfig !== 'undefined') return projectConfig; break;   // eslint-disable-line no-undef
                case 'systemsData': if (typeof systemsData !== 'undefined') return systemsData; break;         // eslint-disable-line no-undef
                case 'praData': if (typeof praData !== 'undefined') return praData; break;                     // eslint-disable-line no-undef
                case 'zsaData': if (typeof zsaData !== 'undefined') return zsaData; break;                     // eslint-disable-line no-undef
                case 'projectName': if (typeof projectName !== 'undefined') return projectName; break;         // eslint-disable-line no-undef
            }
        } catch (_) {}
        try { return root[name]; } catch (_) { return undefined; }
    }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _s(v) { return v == null ? '' : String(v).trim(); }
    function _up(v) { return _s(v).toUpperCase(); }
    function _cmp(a, b) { a = String(a == null ? '' : a); b = String(b == null ? '' : b); return a < b ? -1 : (a > b ? 1 : 0); }
    function _nat(a, b) {
        var ra = String(a == null ? '' : a).match(/(\d+|\D+)/g) || [], rb = String(b == null ? '' : b).match(/(\d+|\D+)/g) || [];
        for (var i = 0; i < Math.min(ra.length, rb.length); i++) {
            var x = ra[i], y = rb[i];
            if (/^\d/.test(x) && /^\d/.test(y)) { var d = Number(x) - Number(y); if (d) return d < 0 ? -1 : 1; if (x.length !== y.length) return x.length < y.length ? -1 : 1; }
            else { var c = _cmp(x, y); if (c) return c; }
        }
        return ra.length - rb.length ? (ra.length < rb.length ? -1 : 1) : _cmp(a, b);
    }
    function _uniq(a, f) { var seen = {}, out = []; _arr(a).forEach(function (x) { if (x == null || x === '') return; var k = String(x); if (!seen[k]) { seen[k] = 1; out.push(k); } }); return out.sort(f || _cmp); }
    function _clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
    function _ids(v) { return (Array.isArray(v) ? v : [v]).map(_s).filter(Boolean); }
    function _loose(s) { return _s(s).toLowerCase().replace(/[\s_\-.\/]+/g, ''); }
    function _pc() { var p = _g('projectConfig'); if (p && typeof p === 'object') return p; root.projectConfig = root.projectConfig || {}; return root.projectConfig; }
    function _C() { return root.SLCadZonal || null; }
    function _Z() { return root.ZONES || null; }
    function _M() { return root.SLPraModels || null; }
    function _sys() { return _arr(_g('systemsData')).filter(function (s) { return s && s.id != null; }); }
    function _sysById(id) { var s = _sys(); for (var i = 0; i < s.length; i++) if (String(s[i].id) === String(id)) return s[i]; return null; }
    function _save() { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} }
    // the same fingerprint Sys Lab uses (FNV-1a, 32 bit, hex)
    function fp(v) { var t = typeof v === 'string' ? v : JSON.stringify(v); var h = 2166136261; for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
    function _zonesSorted() { var Z = _Z(); return Z ? Z.all().filter(Boolean).slice().sort(function (a, b) { return _nat(a.code, b.code) || _cmp(a.id, b.id); }) : []; }
    function _zoneKey(z) { return z ? _up(z.code || z.id) : ''; }
    // A typed zone label (a ZSA or PRA row) to a zone: exact id, code, name or "code name", ignoring case only.
    function _zoneByText(t) {
        t = _s(t).toLowerCase(); if (!t) return null;
        return _zonesSorted().filter(function (z) { return String(z.id).toLowerCase() === t || (z.code && String(z.code).toLowerCase() === t) || (z.name && String(z.name).toLowerCase() === t) || ((z.code ? z.code + ' ' : '') + (z.name || '')).trim().toLowerCase() === t; })[0] || null;
    }
    function _cond(c) { return { id: String(c.id), fcId: c.fcId || null, desc: c.desc || '', severity: c.severity || null, domain: c.domain || null }; }

    // ===================================================================================
    // FILE 1: the zonal picture for Sys Lab
    // ===================================================================================
    function exportPicture(opts) {
        opts = opts || {};
        var C = _C(), Z = _Z(), M = _M(), gaps = [];
        var cadId = C ? (opts.cadId || C.latestCadId()) : null, m = C && cadId ? C.model(cadId) : null;
        if (!C) gaps.push('The CAD and zonal engine is not loaded, so containment and risk results are not in this file.');
        else if (!m) gaps.push('No CAD model is imported yet, so no part sits in any zone or risk volume yet.');
        // zones
        var zones = _zonesSorted().map(function (z) {
            var par = z.parentId && Z ? Z.get(z.parentId) : null;
            return { id: String(z.id), code: z.code ? String(z.code) : null, name: z.name || '', parentId: z.parentId != null ? String(z.parentId) : null, parentCode: par && par.code ? String(par.code) : null,
                     depth: Z && Z.depth ? Z.depth(z.id) : 0, source: z.source || 'manual', hasVolume: !!z.volume, equipment: _uniq(z.equipment) };
        });
        if (!zones.length) gaps.push('No zones are defined yet (Zonal Model or the CAD zone list).');
        // containment and links
        var cont = m ? C.containment(cadId) : { parts: [], straddling: [], ambiguous: [] };
        var zoneOf = {}, strad = {}, amb = {};
        cont.parts.forEach(function (r) { zoneOf[r.pid] = r.zoneId || null; if (r.ambiguousWith) amb[r.pid] = r.ambiguousWith.slice().sort(_cmp); });
        _arr(cont.straddling).forEach(function (s) { strad[s.pid] = _uniq(s.crosses); });
        var conf = m ? C.confirmed(cadId) : {}, eqParts = m ? C.equipmentParts(cadId) : {};
        // risks through the fault trees
        var risks = [], inRisk = {};
        if (C) C.riskVolumes().forEach(function (v) {
            var inside = m ? C.partsInVolume(v.id, cadId) : [];
            inside.forEach(function (p) { inRisk[p.pid] = 1; });
            var im = m ? C.riskImpact(v.id, { cadId: cadId }) : null;
            var pra = _praRowFor(v.praId);
            risks.push({ id: String(v.id), kind: v.kind, label: v.label || v.kind, source: v.source || 'manual', praId: v.praId != null ? String(v.praId) : null,
                parts: inside.map(function (p) { return String(p.pid); }).sort(_cmp), equipment: im ? im.equipment.map(function (e) { return String(e.sysId); }) : [],
                zoneIds: _uniq(inside.map(function (p) { return zoneOf[p.pid]; })), conditions: im ? im.conditions.map(_cond) : [], worst: im ? (im.worst || null) : null,
                notEvaluated: !m ? 'no CAD model' : (im && im.notEvaluated) ? String(im.notEvaluated) : null, mitigation: pra ? _s(pra.mitigation) || null : null });
            _withShape(risks[risks.length - 1], v, C);
        });
        // parts
        var all = m ? C.partsOf(m).slice().sort(function (a, b) { return _cmp(a.pid, b.pid); }) : [];
        var complete = all.length <= PART_LIMIT;
        var parts = all.filter(function (p) { return complete || conf[p.pid] || p.designator || inRisk[p.pid]; }).map(function (p) {
            var o = { pid: String(p.pid), name: p.name || String(p.pid), partNumber: p.partNumber == null ? null : String(p.partNumber), designator: p.designator ? String(p.designator) : null, ata: p.ata ? String(p.ata) : null,
                      equipment: conf[p.pid] ? String(conf[p.pid]) : null, zoneId: zoneOf[p.pid] || null };
            if (strad[p.pid] && strad[p.pid].length) o.straddles = strad[p.pid];
            if (amb[p.pid]) o.ambiguousWith = amb[p.pid];
            return o;
        });
        var nEst = m && C.estimatedParts ? C.estimatedParts(cadId).length : 0;
        if (nEst) gaps.push(nEst + ' CAD part size' + (nEst === 1 ? ' is' : 's are') + ' still being read, so those parts are in no zone or risk volume in this file yet. Export again when the model has finished opening.');
        if (m && !complete) gaps.push('The CAD model has ' + all.length + ' parts; only the ' + parts.length + ' that are linked, carry a designator or sit inside a risk volume are in this file.');
        // equipment
        var equipment = _sys().slice().sort(function (a, b) { return _cmp(a.id, b.id); }).map(function (s) {
            var z = Z && Z.zoneOf ? Z.zoneOf(s.id) : null, pids = _arr(eqParts[s.id]).slice().sort(_cmp);
            return { sysId: String(s.id), name: s.name || String(s.id), designator: _ids(s.designator)[0] || null, partNumbers: _uniq(_ids(s.partNumber).concat(_ids(s.partNumbers))), ata: _ids(s.ata)[0] || null,
                     zoneId: z ? String(z.id) : null, parts: pids, cadZoneIds: _uniq(pids.map(function (pid) { return zoneOf[pid]; })),
                     functions: _arr(s.functions).filter(Boolean).map(function (f) { var id = f.funcId || f.id; return id == null ? null : { funcId: String(id), name: f.funcName || f.name || String(id), traces: _uniq(Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : [])) }; }).filter(Boolean)
                         .sort(function (a, b) { return _nat(a.funcId, b.funcId); }) };
        });
        if (m && equipment.some(function (e) { return !e.parts.length; })) gaps.push(equipment.filter(function (e) { return !e.parts.length; }).length + ' equipment item(s) have no confirmed CAD part, so their exposure to CAD-based risks is not known.');
        // zones compromised
        var zsa = _arr(_g('zsaData'));
        var zoneHazards = [];
        _zonesSorted().forEach(function (z) {
            var rows = zsa.filter(function (r) { var hit = r ? _zoneByText(r.zoneId) : null; return hit && hit.id === z.id; }).map(function (r) {
                return { id: String(r.internalId != null ? r.internalId : r.zoneId), zone: _s(r.zoneId), desc: _s(r.desc || r.hazard), equip: _s(r.equip), severity: _s(r.severity) || null, interference: _s(r.interference) || null, mitigation: _s(r.mitigation) || null };
            });
            var eq = Z && Z.equipmentInSubtree ? _uniq(Z.equipmentInSubtree(z.id)) : [];
            var im = C && eq.length ? C.zoneImpact(z.id) : null;
            if (!eq.length && !rows.length) return;
            zoneHazards.push({ zoneId: String(z.id), equipment: eq, conditions: im ? im.conditions.map(_cond) : [], worst: im ? (im.worst || null) : null,
                               notEvaluated: !C ? 'the zonal engine is not loaded' : (im && im.notEvaluated) ? String(im.notEvaluated) : (!eq.length ? 'no equipment is placed in this zone' : null), zsaRows: rows });
        });
        // exposures from every particular-risk model
        var exposures = [];
        if (M && typeof M.equipmentExposures === 'function' && m) {
            var ex = M.equipmentExposures(cadId, { bird: true });
            if (ex && ex.ok) Object.keys(ex.bySys).sort(_cmp).forEach(function (sid) {
                ex.bySys[sid].forEach(function (x) { exposures.push({ sysId: String(sid), kind: x.kind, risk: x.risk || x.kind, label: x.label || '', worst: x.worst || null, src: x.src || '', pids: _uniq(x.pids) }); });
            });
            else if (ex && !ex.ok) gaps.push('Particular risk models: ' + ex.err);
        } else if (m && !M) gaps.push('The particular risk models (rotor burst, tire burst, bird strike, lightning) are not loaded, so only the risk volumes are in this file.');
        // PRA table rows, their zones resolved exactly
        var praRows = _arr(_g('praData')).filter(Boolean).map(function (r) {
            var az = _arr(r.affectedZones).map(_s).filter(Boolean);
            return { id: String(r.praId || r.internalId), threat: _s(r.threat), affectedZones: az, zoneIds: _uniq(az.map(function (t) { var z = _zoneByText(t); return z ? z.id : null; })), mitigation: _s(r.mitigation) || null };
        }).sort(function (a, b) { return _nat(a.id, b.id); });
        // Sys Lab elements already mapped here
        var rec = _pc().sysLabPhysical, sysLabMap = [];
        if (rec && rec.map) Object.keys(rec.map).sort(_cmp).forEach(function (k) { var x = rec.map[k], el = _elByKey(rec, k); if (x && x.sysId && _sysById(x.sysId)) sysLabMap.push({ key: k, tag: el && el.tag ? el.tag : null, ident: el ? el.ident || null : null, sysId: String(x.sysId), on: x.on || 'confirmed' }); });
        if (C && typeof C.takeRefusals === 'function') C.takeRefusals();
        if (C && typeof C.takeNonMonotone === 'function') C.takeNonMonotone();
        var body = {
            cad: m ? { cadId: String(cadId), revision: m.revision || null, fileName: m.fileName || null, partCount: all.length, partsComplete: complete } : null,
            rules: C && C.RULES ? _clone(C.RULES) : {}, kindLabels: _clone(KIND_LABELS),
            zones: zones, equipment: equipment, parts: parts, risks: risks, zoneHazards: zoneHazards, exposures: exposures, praRows: praRows, sysLabMap: sysLabMap, gaps: gaps
        };
        var out = { format: FORMAT, version: FORMAT_VERSION, generator: 'Safety Lab Aero zonal exchange ' + VERSION, projectName: _s(_g('projectName')) || null, exportedAt: opts.at || new Date().toISOString(), contentHash: fp(body) };
        Object.keys(body).forEach(function (k) { out[k] = body[k]; });
        // 1.3 (19 Oct 2026, build 7): the zonal safety analysis, read only in Sys Lab. Its own fingerprint (zsaHash), so
        // the fingerprint of everything above is what it always was and an older Sys Lab still reads the file.
        var E = root.SLZsaEngine;
        if (E && typeof E.compute === 'function' && opts.zsa !== false) {
            try { out.zsa = zsaOut(E.compute(), E); out.zsaHash = fp(out.zsa); } catch (e) { out.zsa = { engine: 'Safety Lab zonal analysis ' + (E.VERSION || ''), error: 'The zonal safety analysis could not run: ' + _s(e && e.message) }; out.zsaHash = fp(out.zsa); }
        }
        return out;
    }
    // The analysis as Sys Lab shows it: the totals, what is missing, the zones with findings and every finding with what it
    // reaches (units by tag, routes by line, functions by ID), its consequence and the person's disposition in Safety Lab.
    function zsaOut(res, E) {
        var cons = function (f, k) { return f.consequence ? _uniq(_arr(f.consequence[k]).map(function (x) { return x && x.funcId; })) : []; };
        return {
            engine: 'Safety Lab zonal analysis ' + (E.VERSION || ''), summary: _clone(res.summary), gaps: _arr(res.gaps).map(_s),
            zones: _arr(res.zones).filter(function (z) { return z.findings.length; }).map(function (z) { return { zoneId: String(z.zoneId), code: z.code || null, name: z.name || '', worst: z.zoneEvent ? z.zoneEvent.worst || null : null, findings: z.findings.slice() }; }),
            findings: _arr(res.findings).map(function (f) {
                var d = f.disposition;
                return { id: f.id, kind: f.kind, severity: f.severity, status: f.status, zoneIds: _arr(f.zoneIds).map(String), zoneCodes: _arr(f.zoneCodes).map(String), funcId: f.funcId || null,
                         lines: _uniq(_arr(f.lines).concat(f.reach ? _arr(f.reach.lines) : [])), elements: _uniq(f.reach ? f.reach.elements : []), equipment: _uniq(_arr(f.equipment).concat(f.reach ? _arr(f.reach.equipment) : [])),
                         functions: cons(f, 'functionsLost'), functionsAtRisk: cons(f, 'functionsAtRisk'), worst: f.consequence ? f.consequence.worst || null : null, worstPossible: f.consequence ? f.consequence.worstPossible || null : null,
                         text: _s(f.text), disposition: d ? { state: d.state, reason: _s(d.reason), requirementId: _s(d.requirementId) || null, requirementVerified: d.requirementVerified, by: _s(d.by), at: _s(d.at), stale: !!d.stale } : null };
            })
        };
    }
    // 1.1 (17 Oct 2026): each risk carries the volume Safety Lab stores for it, exactly as stored
    // (projectConfig.praVolumes[].shape, cad_zonal.js), with its unit. Lengths are millimeters, the
    // unit of the CAD model; angles are degrees. A shape the engine would refuse is still sent, with
    // shapeIssue saying why, so the reader never draws it and never loses it silently.
    function _withShape(r, v, C) {
        if (!v || !v.shape || typeof v.shape !== 'object' || Array.isArray(v.shape)) return r;
        r.shape = _clone(v.shape); r.shapeUnits = SHAPE_UNITS;
        var bad = C && typeof C.shapeIssue === 'function' ? C.shapeIssue(v.shape) : null;
        if (bad) r.shapeIssue = String(bad);
        return r;
    }
    function _praRowFor(praId) {
        if (praId == null || praId === '') return null;
        var rows = _arr(_g('praData'));
        for (var i = 0; i < rows.length; i++) if (rows[i] && (String(rows[i].praId) === String(praId) || String(rows[i].internalId) === String(praId))) return rows[i];
        return null;
    }
    // A file is worth putting in a project bundle when it has zones, a CAD model or risks.
    function hasContent(pic) { return !!(pic && (pic.zones.length || pic.cad || pic.risks.length)); }
    function checkPicture(pic) {
        if (!pic || typeof pic !== 'object') return 'This is not a Safety Lab zonal file.';
        if (pic.format !== FORMAT) return 'This is not a Safety Lab zonal file (format ' + _s(pic.format || 'missing') + ').';
        if (pic.version !== FORMAT_VERSION) return 'This zonal file is version ' + pic.version + '; this Safety Lab reads version ' + FORMAT_VERSION + '.';
        var body = {}; ['cad', 'rules', 'kindLabels', 'zones', 'equipment', 'parts', 'risks', 'zoneHazards', 'exposures', 'praRows', 'sysLabMap', 'gaps'].forEach(function (k) { body[k] = pic[k]; });
        if (fp(body) !== pic.contentHash) return 'The zonal file was changed after Safety Lab wrote it (its fingerprint does not match).';
        if (pic.zsa !== undefined && fp(pic.zsa) !== pic.zsaHash) return 'The zonal safety analysis in the file was changed after Safety Lab wrote it (its fingerprint does not match).';
        return null;
    }

    // ===================================================================================
    // FILE 2: Sys Lab's physical architecture, imported here
    // ===================================================================================
    function _keyOf(el) { return el.tag ? 'tag:' + _up(el.tag) : 'id:' + _up(el.ident); }
    function _elByKey(rec, key) { var all = _arr(rec && rec.elements).concat(_arr(rec && rec.systems)); for (var i = 0; i < all.length; i++) if (all[i] && all[i].key === key) return all[i]; return null; }
    // readSysLab(obj): checks a syslab-physical file and returns it normalized, or { ok:false, err }.
    function readSysLab(obj, fileName) {
        if (!obj || typeof obj !== 'object' || obj.app !== 'syslab-physical') return { ok: false, err: 'This is not a Sys Lab physical architecture file (Export physical architecture in Sys Lab).' };
        if ([1, 2, 3].indexOf(obj.version) < 0) return { ok: false, err: 'This Sys Lab file is version ' + obj.version + '; this Safety Lab reads versions 1, 2 and 3.' };
        var issues = [], seen = {};
        var elements = _arr(obj.elements).filter(function (e) { return e && (e.tag || e.ident); }).map(function (e) {
            var x = { key: '', tag: _up(e.tag) || null, ident: _up(e.ident) || null, name: _s(e.name), kind: _s(e.kind), system: _s(e.system), partOf: _s(e.partOf), partNumber: _s(e.partNumber) || null,
                      zone: _up(e.zone) || null, zoneId: _s(e.zoneId) || null, cadPart: _s(e.cadPart) || null, slEquipment: _s(e.slEquipment) || null, performs: _uniq(_arr(e.performs).map(_up)) };
            x.key = _keyOf(x);
            return x;
        }).filter(function (x) { if (seen[x.key]) { issues.push('Element ' + (x.tag || x.ident) + ' is listed twice; the first is used.'); return false; } seen[x.key] = 1; return true; })
          .sort(function (a, b) { return _cmp(a.key, b.key); });
        var systems = _arr(obj.systems).filter(function (s) { return s && s.code; }).map(function (s) { return { key: 'sys:' + _up(s.code), code: _up(s.code), name: _s(s.name), slSystem: _s(s.slSystem) || null, performs: _uniq(_arr(s.performs).map(_up)) }; })
          .sort(function (a, b) { return _cmp(a.key, b.key); });
        if (obj.version === 1) {   // version 1 names systems only through the allocations
            var by = {}; _arr(obj.allocations).forEach(function (a) { if (!a || !a.element || a.tag) return; var code = _up(a.element); if (code === 'AIRCRAFT' || elements.some(function (e) { return e.ident === code; })) return; (by[code] = by[code] || []).push(_up(a.funcId)); });
            systems = Object.keys(by).sort(_cmp).map(function (code) { return { key: 'sys:' + code, code: code, name: code, slSystem: null, performs: _uniq(by[code]) }; });
        }
        var functions = _arr(obj.functions).filter(function (f) { return f && f.funcId; }).map(function (f) { return { funcId: _up(f.funcId), name: _s(f.name), level: _s(f.level), system: _s(f.system), parent: _up(f.parent) || null, traces: _uniq(_arr(f.traces).map(_up)) }; })
          .sort(function (a, b) { return _nat(a.funcId, b.funcId); });
        var routing = obj.version >= 3 ? _readRouting(obj.routing, issues) : null;
        return { ok: true, data: { file: _s(fileName) || 'Sys Lab file', version: obj.version, projectName: _s(obj.projectName) || null, exportedAt: _s(obj.exportedAt) || null, routing: routing, functions: functions, elements: elements, systems: systems }, issues: issues };
    }
    // The routes Sys Lab sends (version 3), read field by field: what is not a number, a text or a list of them is left
    // out, never trusted as it came. null when the file carries no routes.
    function _num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
    function _xyz(v) { return Array.isArray(v) && v.length === 3 && v.every(function (x) { return typeof x === 'number' && isFinite(x); }) ? v.slice() : null; }
    function _el(e) { return e && typeof e === 'object' ? { ident: _up(e.ident) || null, tag: _up(e.tag) || null, name: _s(e.name), system: !!e.system } : null; }
    function _readRouting(r, issues) {
        if (!r || typeof r !== 'object') return null;
        var seen = {};
        var routes = _arr(r.routes).filter(function (x) { return x && _s(x.line); }).map(function (x) {
            return { line: _up(x.line), type: _s(x.type) || null, typeName: _s(x.typeName), family: _s(x.family) || null, typeFrom: _s(x.typeFrom) || null,
                     lengthMm: _num(x.lengthMm), lengthFrom: _s(x.lengthFrom), found: !!x.found, parts: _uniq(_arr(x.parts).map(_s)), zones: _uniq(_arr(x.zones).map(_s)),
                     harness: x.harness && typeof x.harness === 'object' ? { partNumber: _s(x.harness.partNumber), file: _s(x.harness.file), wires: _num(x.harness.wires) } : null,
                     connections: _arr(x.connections).filter(Boolean).map(function (c) { return { ident: _up(c.ident) || null, name: _s(c.name), type: _s(c.type), from: _el(c.from), to: _el(c.to) }; }),
                     functions: _arr(x.functions).filter(function (f) { return f && f.funcId; }).map(function (f) { return { funcId: _up(f.funcId), ends: _uniq(_arr(f.ends).map(_s)).filter(function (e) { return e === 'from' || e === 'to'; }) }; }),
                     channels: _arr(x.channels).filter(function (c) { return c && c.funcId && _num(c.channel) != null; }).map(function (c) { return { funcId: _up(c.funcId), channel: c.channel, of: _num(c.of), element: _up(c.element) || null }; }) };
        }).filter(function (x) { if (seen[x.line]) { issues.push('Route ' + x.line + ' is listed twice; the first is used.'); return false; } seen[x.line] = 1; return true; })
          .sort(function (a, b) { return _nat(a.line, b.line); });
        var M = r.measured && typeof r.measured === 'object' ? r.measured : {};
        var pairs = _arr(M.pairs).filter(function (x) { return x && seen[_up(x.a)] && seen[_up(x.b)] && _num(x.d) != null; }).map(function (x) {
            return { a: _up(x.a), b: _up(x.b), d: x.d, pa: _xyz(x.pa), pb: _xyz(x.pb), near: _arr(x.near).filter(function (n) { return Array.isArray(n) && n.length >= 3 && typeof n[2] === 'number'; }).map(function (n) { return [_s(n[0]), _s(n[1]), n[2], n[3] === 1 || n[3] === -1 ? n[3] : 0]; }) };
        });
        var F = r.findings && typeof r.findings === 'object' ? r.findings : {};
        var fns = {}, F0 = r.functions && typeof r.functions === 'object' ? r.functions : {};
        Object.keys(F0).sort(_nat).forEach(function (k) { var f = F0[k]; if (!f || typeof f !== 'object') return; var rd = f.redundancy && typeof f.redundancy === 'object' && _num(f.redundancy.channels) ? { channels: f.redundancy.channels, need: _num(f.redundancy.need) } : null; fns[_up(k)] = { name: _s(f.name), severity: _s(f.severity) || null, why: _s(f.why), redundancy: rd, fcs: _arr(f.fcs).filter(function (x) { return x && x.fcId; }).map(function (x) { return { fcId: _up(x.fcId), severity: _s(x.severity) || null }; }) }; });
        var els = _arr(r.elements).filter(function (e) { return e && (e.ident || e.tag); }).map(function (e) { return { ident: _up(e.ident) || null, tag: _up(e.tag) || null, channels: _arr(e.channels).filter(function (c) { return c && c.funcId && _num(c.channel) != null; }).map(function (c) { return { funcId: _up(c.funcId), channel: c.channel, of: _num(c.of) }; }) }; });
        return {
            functions: fns, elements: els,
            cad: r.cad && typeof r.cad === 'object' ? { cadId: _s(r.cad.cadId) || null, sha256: _s(r.cad.sha256) || null, fileName: _s(r.cad.fileName) || null, revision: _s(r.cad.revision) || null } : null,
            sepMm: _num(r.sepMm), up: _s(r.up) || '+Z',
            rules: _arr(r.rules).filter(function (x) { return x && x.id; }).map(function (x) { return { id: _s(x.id), name: _s(x.name), a: _arr(x.a).map(_s), b: _arr(x.b).map(_s), minMm: _num(x.minMm), preferMm: _num(x.preferMm), above: !!x.above, clampMm: _num(x.clampMm), own: !!x.own, why: _s(x.why), source: _s(x.source) }; }),
            routes: routes,
            measured: { state: _s(M.state) || 'none', why: _s(M.why), at: _s(M.at) || null, by: _s(M.by) || null, bandMm: _num(M.bandMm), pairs: pairs },
            findings: {
                rules: _arr(F.rules).filter(function (x) { return x && x.rule && Array.isArray(x.lines); }).map(function (x) { return { rule: _s(x.rule), sev: ['error', 'warn', 'info'].indexOf(x.sev) >= 0 ? x.sev : 'info', kind: _s(x.kind) || null, lines: x.lines.map(_up), d: _num(x.d), alongMm: _num(x.alongMm), zone: _s(x.zone) || null, at: _xyz(x.at), text: _s(x.text) }; }),
                close: _arr(F.close).filter(function (x) { return x && x.funcId && Array.isArray(x.lines); }).map(function (x) { return { funcId: _up(x.funcId), channels: _arr(x.channels).filter(function (n) { return typeof n === 'number'; }), lines: x.lines.map(_up), clearMm: _num(x.clearMm), zone: _s(x.zone) || null, at: _xyz(x.at), text: _s(x.text) }; }),
                unset: _arr(F.unset).filter(function (x) { return x && x.rule; }).map(function (x) { return { rule: _s(x.rule), text: _s(x.text) }; })
            }
        };
    }
    // planSysLab(data): what importing would change, against what is stored. Pure.
    function planSysLab(data) {
        var rec = _pc().sysLabPhysical || null, before = {};
        if (rec) _arr(rec.elements).concat(_arr(rec.systems)).forEach(function (e) { before[e.key] = e; });
        var now = {}; _arr(data.elements).concat(_arr(data.systems)).forEach(function (e) { now[e.key] = e; });
        var plan = { added: [], changed: [], removed: [], mapsKept: [], mapsDropped: [], first: !rec };
        Object.keys(now).sort(_cmp).forEach(function (k) { if (!before[k]) plan.added.push(k); else if (JSON.stringify(before[k]) !== JSON.stringify(now[k])) plan.changed.push(k); });
        Object.keys(before).sort(_cmp).forEach(function (k) { if (!now[k]) plan.removed.push(k); });
        var rb = rec && rec.routing ? rec.routing.routes.length : 0, ra = data.routing ? data.routing.routes.length : 0;
        plan.routes = { before: rb, after: ra, changed: JSON.stringify((rec && rec.routing) || null) !== JSON.stringify(data.routing || null) };
        if (rec && rec.map) Object.keys(rec.map).sort(_cmp).forEach(function (k) { var x = rec.map[k]; if (!x || !x.sysId) return; if (now[k] && _sysById(x.sysId)) plan.mapsKept.push(k); else plan.mapsDropped.push({ key: k, sysId: x.sysId, why: now[k] ? 'equipment ' + x.sysId + ' no longer exists' : 'element no longer in Sys Lab' }); });
        return plan;
    }
    function _ack(label, fn) {
        var CA = root.SLChangeAck;
        if (CA && typeof CA.batch === 'function') return CA.batch(label, fn).then(function (r) { return r && r.result !== undefined ? r.result : r; });
        try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); }
    }
    // importSysLab(data, by): stores the Sys Lab picture; mappings of elements still present are kept.
    function importSysLab(data, by, opts) {
        opts = opts || {};
        if (!_s(by)) return Promise.resolve({ ok: false, err: 'An import needs the name of who brought it in (the name box under Equipment links).' });
        var plan = planSysLab(data);
        return _ack('Sys Lab physical architecture imported from ' + data.file + ': ' + data.elements.length + ' elements, ' + data.functions.length + ' functions' + (data.routing ? ', ' + data.routing.routes.length + ' routes' : ''), function () {
            var pc = _pc(), old = pc.sysLabPhysical || {}, map = {}, rejected = {};
            plan.mapsKept.forEach(function (k) { map[k] = old.map[k]; });
            Object.keys(old.rejected || {}).forEach(function (k) { if (plan.removed.indexOf(k) < 0) rejected[k] = old.rejected[k]; });
            pc.sysLabPhysical = { schema: 1, file: data.file, version: data.version, projectName: data.projectName, exportedAt: data.exportedAt, importedAt: opts.at || new Date().toISOString(), by: _s(by),
                                  functions: _clone(data.functions), elements: _clone(data.elements), systems: _clone(data.systems), map: map, rejected: rejected };
            if (data.routing) pc.sysLabPhysical.routing = _clone(data.routing);   // version 3: the routes for the ZSA
            _save();
            return { ok: true, plan: plan };
        });
    }
    function stored() { var r = _pc().sysLabPhysical; return r && typeof r === 'object' ? r : null; }
    // matchSysLab(): exact (offer to accept), candidates (to confirm or reject), unmatched, linked. Pure.
    function matchSysLab(opts) {
        opts = opts || {};
        var rec = stored(), out = { exact: [], candidates: [], unmatched: [], linked: [] };
        if (!rec) return out;
        var C = _C(), cadId = C ? (opts.cadId || C.latestCadId()) : null, m = C && cadId ? C.model(cadId) : null;
        var conf = m ? C.confirmed(cadId) : {}, sys = _sys().slice().sort(function (a, b) { return _cmp(a.id, b.id); });
        // the parts a CAD part designator in Sys Lab can name: pid, designator or name, each unique in the model
        var partBy = {}, partCount = {};
        if (m) C.partsOf(m).forEach(function (p) { _uniq([p.pid, p.designator, p.name]).forEach(function (k) { var u = _up(k); partCount[u] = (partCount[u] || 0) + 1; partBy[u] = p; }); });
        var tagCount = {}; _arr(rec.elements).forEach(function (e) { if (e.tag) tagCount[e.tag] = (tagCount[e.tag] || 0) + 1; });
        var desigCount = {}; sys.forEach(function (s) { _ids(s.designator).forEach(function (d) { desigCount[_up(d)] = (desigCount[_up(d)] || 0) + 1; }); });
        var map = rec.map || {}, rej = rec.rejected || {};
        _arr(rec.elements).concat(_arr(rec.systems)).forEach(function (e) {
            var cur = map[e.key];
            if (cur && cur.sysId && _sysById(cur.sysId)) { out.linked.push({ key: e.key, sysId: String(cur.sysId), on: cur.on || 'confirmed' }); return; }
            var no = {}; _arr(rej[e.key]).forEach(function (x) { no[x.sysId] = 1; });
            var exact = [], loose = {};
            var ok = function (sid) { return sid && !no[sid] && _sysById(sid); };
            if (e.key.indexOf('sys:') === 0) {
                if (ok(e.slSystem)) exact.push({ sysId: String(e.slSystem), on: 'system' });
                sys.forEach(function (s) { if (!no[s.id] && _s(s.name).toLowerCase() === _s(e.name).toLowerCase() && _s(e.name)) loose[String(s.id)] = 1; });
            } else {
                if (ok(e.slEquipment)) exact.push({ sysId: String(e.slEquipment), on: 'syslab' });
                if (e.tag && tagCount[e.tag] === 1 && desigCount[e.tag] === 1) sys.forEach(function (s) { if (!no[s.id] && _ids(s.designator).some(function (d) { return _up(d) === e.tag; })) exact.push({ sysId: String(s.id), on: 'designator' }); });
                if (e.cadPart && partCount[_up(e.cadPart)] === 1) { var p = partBy[_up(e.cadPart)], sid = p ? conf[p.pid] : null; if (ok(sid)) exact.push({ sysId: String(sid), on: 'cadPart' }); }
                sys.forEach(function (s) {
                    if (no[s.id]) return;
                    if (e.partNumber && _ids(s.partNumber).concat(_ids(s.partNumbers)).some(function (x) { return _up(x) === _up(e.partNumber); })) loose[String(s.id)] = 1;
                    var ln = _loose(e.name); if (ln && ln.length >= 3 && (_loose(s.name) === ln || _ids(s.designator).some(function (d) { return _loose(d) === _loose(e.tag); }))) loose[String(s.id)] = 1;
                });
            }
            var ex = _uniq(exact.map(function (x) { return x.sysId; }));
            if (ex.length === 1) { out.exact.push({ key: e.key, sysId: ex[0], on: exact.filter(function (x) { return x.sysId === ex[0]; })[0].on }); return; }
            var all = _uniq(ex.concat(Object.keys(loose)));
            if (all.length) out.candidates.push({ key: e.key, sysIds: all }); else out.unmatched.push(e.key);
        });
        return out;
    }
    function _setMap(key, sysId, on, by, at) {
        var rec = stored(); if (!rec) return { ok: false, err: 'No Sys Lab file is imported.' };
        if (!_elByKey(rec, key)) return { ok: false, err: 'That Sys Lab element is not in the imported file.' };
        if (!_sysById(sysId)) return { ok: false, err: 'Equipment ' + sysId + ' does not exist.' };
        if (!_s(by)) return { ok: false, err: 'A mapping needs the name of who confirmed it.' };
        rec.map = rec.map || {}; rec.map[key] = { sysId: String(sysId), on: on || 'confirmed', by: _s(by), at: at || new Date().toISOString() };
        if (rec.rejected && rec.rejected[key]) rec.rejected[key] = rec.rejected[key].filter(function (x) { return x.sysId !== String(sysId); });
        _save(); return { ok: true };
    }
    function confirmMap(key, sysId, by, opts) { opts = opts || {}; return _ack('Sys Lab element ' + key.replace(/^(tag|id|sys):/, '') + ' mapped to ' + ((_sysById(sysId) || {}).name || sysId), function () { return _setMap(key, sysId, opts.on || 'confirmed', by, opts.at); }); }
    function rejectMap(key, sysId, by, opts) {
        opts = opts || {};
        return _ack('Sys Lab element ' + key.replace(/^(tag|id|sys):/, '') + ': ' + ((_sysById(sysId) || {}).name || sysId) + ' rejected as its equipment', function () {
            var rec = stored(); if (!rec) return { ok: false, err: 'No Sys Lab file is imported.' };
            if (!_s(by)) return { ok: false, err: 'Rejecting a match needs the name of who rejected it.' };
            rec.rejected = rec.rejected || {}; (rec.rejected[key] = rec.rejected[key] || []).push({ sysId: String(sysId), by: _s(by), at: opts.at || new Date().toISOString() });
            if (rec.map && rec.map[key] && rec.map[key].sysId === String(sysId)) delete rec.map[key];
            _save(); return { ok: true };
        });
    }
    function unmap(key, by) { return _ack('Sys Lab element ' + key.replace(/^(tag|id|sys):/, '') + ' unmapped', function () { var rec = stored(); if (!rec || !rec.map || !rec.map[key]) return { ok: false, err: 'not mapped' }; delete rec.map[key]; _save(); return { ok: true }; }); }
    // The exact matches, accepted together by one click (the only mappings made without choosing each).
    function acceptExact(by, opts) {
        opts = opts || {};
        var mm = matchSysLab(opts);
        if (!_s(by)) return Promise.resolve({ ok: false, err: 'Accepting matches needs the name of who accepted them.' });
        return _ack(mm.exact.length + ' exact Sys Lab mapping' + (mm.exact.length === 1 ? '' : 's') + ' accepted', function () { var made = []; mm.exact.forEach(function (x) { var r = _setMap(x.key, x.sysId, x.on, by, opts.at); if (r.ok) made.push(x); }); return { ok: true, mapped: made }; });
    }

    // ---- what a risk or a zone reaches in the Sys Lab model --------------------------------
    function _label(e) { return e ? (e.key.indexOf('sys:') === 0 ? 'system ' + e.code + (e.name && e.name !== e.code ? ' ' + e.name : '') : (e.tag || e.ident) + (e.name ? ' ' + e.name : '')) : ''; }
    function _fnName(rec, id) { var f = _arr(rec.functions).filter(function (x) { return x.funcId === id; })[0]; return f ? f.name : ''; }
    // reach({ sysIds, zoneIds, pids }): functions performed by elements mapped to that equipment
    // (confirmed), and by elements that are not mapped but sit in one of those zones or name one of
    // those CAD parts (reported separately: the element's own exposure is not confirmed).
    function reach(o) {
        o = o || {};
        var rec = stored(); if (!rec) return { imported: false, functions: [], served: [], byZoneOnly: [], unmapped: 0 };
        var Z = _Z(), set = {}, zones = {}, pids = {};
        _arr(o.sysIds).forEach(function (s) { set[String(s)] = 1; });
        _arr(o.zoneIds).forEach(function (zid) { var z = Z ? Z.get(zid) : null; if (z) zones[_zoneKey(z)] = 1; });
        _arr(o.pids).forEach(function (p) { pids[_up(p)] = 1; });
        var C = _C(), cadId = C ? C.latestCadId() : null, m = C && cadId ? C.model(cadId) : null, partNames = {};
        if (m) C.partsOf(m).forEach(function (p) { if (pids[_up(p.pid)]) _uniq([p.pid, p.designator, p.name]).forEach(function (k) { partNames[_up(k)] = 1; }); });
        var map = rec.map || {}, fnOut = {}, zoneOut = {}, unmapped = 0;
        var add = function (bag, fid, e, why) { var r = bag[fid] || (bag[fid] = { funcId: fid, name: _fnName(rec, fid), via: [] }); r.via.push({ key: e.key, label: _label(e), why: why }); };
        _arr(rec.elements).concat(_arr(rec.systems)).forEach(function (e) {
            var mp = map[e.key], mapped = mp && mp.sysId && _sysById(mp.sysId);
            if (mapped && set[mp.sysId]) { e.performs.forEach(function (f) { add(fnOut, f, e, 'mapped to ' + ((_sysById(mp.sysId) || {}).name || mp.sysId)); }); return; }
            if (mapped) return;
            unmapped++;
            if (e.cadPart && partNames[_up(e.cadPart)]) e.performs.forEach(function (f) { add(zoneOut, f, e, 'names CAD part ' + e.cadPart + ', which is reached'); });
            else if (e.zone && zones[_up(e.zone)]) e.performs.forEach(function (f) { add(zoneOut, f, e, 'not mapped; sits in zone ' + e.zone + ' in Sys Lab'); });
        });
        var srt = function (bag) { return Object.keys(bag).sort(_nat).map(function (k) { bag[k].via.sort(function (a, b) { return _cmp(a.key, b.key); }); return bag[k]; }); };
        var f1 = srt(fnOut), f2 = srt(zoneOut).filter(function (x) { return !fnOut[x.funcId]; });
        // the functions those serve, up the tree (parent) and up the traces (a system function to the aircraft function it
        // realizes): what the risk takes away at the aircraft level. Version 2 files carry the traces.
        var byId = {}; _arr(rec.functions).forEach(function (f) { byId[f.funcId] = f; });
        var served = {}, walk = function (fid, from, seen) { var f = byId[fid]; if (!f) return; _uniq([f.parent].concat(_arr(f.traces))).forEach(function (u) { if (seen[u] || fnOut[u]) return; seen[u] = 1; var r = served[u] || (served[u] = { funcId: u, name: _fnName(rec, u), through: [] }); if (r.through.indexOf(from) < 0) r.through.push(from); walk(u, from, seen); }); };
        f1.forEach(function (f) { var o = {}; o[f.funcId] = 1; walk(f.funcId, f.funcId, o); });
        var f3 = Object.keys(served).sort(_nat).map(function (k) { served[k].through.sort(_nat); return served[k]; });
        return { imported: true, functions: f1, served: f3, byZoneOnly: f2, unmapped: unmapped };
    }
    function reachOfVolume(volumeId, cadId) {
        var C = _C(); if (!C) return null;
        var v = C.riskVolume(volumeId); if (!v) return null;
        cadId = cadId || C.latestCadId();
        var inside = C.model(cadId) ? C.partsInVolume(volumeId, cadId) : [], conf = C.model(cadId) ? C.confirmed(cadId) : {}, zoneOf = {};
        if (C.model(cadId)) C.containment(cadId).parts.forEach(function (r) { zoneOf[r.pid] = r.zoneId; });
        return reach({ sysIds: _uniq(inside.map(function (p) { return conf[p.pid]; })), zoneIds: _uniq(inside.map(function (p) { return zoneOf[p.pid]; })), pids: inside.map(function (p) { return p.pid; }) });
    }
    function reachOfZone(zoneId) {
        var Z = _Z(); if (!Z || !Z.get(zoneId)) return null;
        return reach({ sysIds: Z.equipmentInSubtree(zoneId), zoneIds: Z.subtree(zoneId).map(function (z) { return z.id; }) });
    }
    // zoneDifferences(): mapped elements whose Sys Lab zone is not where Safety Lab places the equipment.
    function zoneDifferences() {
        var rec = stored(); if (!rec) return [];
        var Z = _Z(), C = _C(), cadId = C ? C.latestCadId() : null, m = C && cadId ? C.model(cadId) : null, eqParts = m ? C.equipmentParts(cadId) : {}, zoneOf = {};
        if (m) C.containment(cadId).parts.forEach(function (r) { zoneOf[r.pid] = r.zoneId; });
        var out = [];
        _arr(rec.elements).forEach(function (e) {
            var mp = (rec.map || {})[e.key]; if (!mp || !_sysById(mp.sysId)) return;
            var placed = Z && Z.zoneOf ? Z.zoneOf(mp.sysId) : null, cad = _uniq(_arr(eqParts[mp.sysId]).map(function (p) { return zoneOf[p]; }));
            var keys = _uniq((placed ? [placed.id] : []).concat(cad)).map(function (zid) { return Z ? Z.get(zid) : null; }).filter(Boolean);
            var here = _up(e.zone);
            if (!keys.length) { if (here) out.push({ key: e.key, label: _label(e), sysLab: here, safetyLab: [], text: 'Sys Lab places it in ' + here + '; Safety Lab has no zone for ' + ((_sysById(mp.sysId) || {}).name || mp.sysId) + ' yet.' }); return; }
            var codes = keys.map(_zoneKey);
            if (!here) out.push({ key: e.key, label: _label(e), sysLab: null, safetyLab: codes, text: 'No zone in Sys Lab; Safety Lab places it in ' + codes.join(', ') + '.' });
            else if (codes.indexOf(here) < 0) out.push({ key: e.key, label: _label(e), sysLab: here, safetyLab: codes, text: 'Sys Lab places it in ' + here + '; Safety Lab places it in ' + codes.join(', ') + '.' });
        });
        return out.sort(function (a, b) { return _cmp(a.key, b.key); });
    }

    // ===================================================================================
    // the screen: a panel on the CAD Model page, under Particular risks
    // ===================================================================================
    var INK = 'color:var(--color-text-primary,#111418);';
    var BTN = 'font-size:11.5px;padding:2px 9px;border:1px solid #007AFF;border-radius:5px;background:transparent;color:#007AFF;cursor:pointer;';
    var BTNP = 'font-size:12px;padding:4px 11px;border:1px solid #007AFF;border-radius:6px;background:#007AFF;color:#fff;cursor:pointer;';
    var TH = 'text-align:left;padding:3px 6px;font-weight:600;' + INK;
    var TD = 'padding:3px 6px;vertical-align:top;' + INK;
    var PER = 25;
    var ui = { pages: {}, msg: '', bad: false };
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function _who() { var el = typeof document !== 'undefined' ? document.getElementById('cad-by') : null; var v = el ? _s(el.value) : ''; if (!v) { try { if (typeof root._signoffReviewerName === 'function') v = root._signoffReviewerName() || ''; } catch (_) {} } return v; }
    function _sev(s) { if (!s) return '<span style="' + INK + '">none reached</span>'; try { if (typeof root.sevPillHtml === 'function') return root.sevPillHtml(s); } catch (_) {} return _esc(s); }
    function _sysLabel(id) { var s = _sysById(id); return s ? (s.name || String(id)) : String(id); }
    function _page(key, list) {
        var n = list.length, pages = Math.max(1, Math.ceil(n / PER)), pg = Math.min(Math.max(0, ui.pages[key] || 0), pages - 1);
        var bar = n <= PER ? '' : '<div style="display:flex;gap:6px;align-items:center;font-size:12px;margin:4px 0;' + INK + '" data-zx-pager="' + _esc(key) + '"><span>' + (pg * PER + 1) + ' to ' + Math.min(n, (pg + 1) * PER) + ' of ' + n + '</span>' +
            '<button style="' + BTN + '" data-zx-act="page" data-k="' + _esc(key) + '" data-pg="' + (pg - 1) + '"' + (pg === 0 ? ' disabled' : '') + '>Previous</button><span>page ' + (pg + 1) + ' of ' + pages + '</span>' +
            '<button style="' + BTN + '" data-zx-act="page" data-k="' + _esc(key) + '" data-pg="' + (pg + 1) + '"' + (pg >= pages - 1 ? ' disabled' : '') + '>Next</button></div>';
        return { rows: list.slice(pg * PER, (pg + 1) * PER), bar: bar };
    }
    function _fnList(r) {
        if (!r) return '';
        if (!r.imported) return '<div style="font-size:12px;' + INK + '">Sys Lab functions: not known yet. Import the physical architecture from Sys Lab (Sys Lab exchange, below Particular risks).</div>';
        var line = function (f) { return '<div style="font-size:12px;padding-left:10px;' + INK + '"><b>' + _esc(f.funcId) + '</b> ' + _esc(f.name) + ' <span>(' + f.via.map(function (v) { return _esc(v.label) + ', ' + _esc(v.why); }).join('; ') + ')</span></div>'; };
        return '<div style="font-size:12px;margin-top:6px;' + INK + '" data-zx-reach><b>Sys Lab functions reached</b>: ' + (r.functions.length ? r.functions.length : 'none through mapped elements') + '</div>' + r.functions.map(line).join('') +
            (r.served.length ? '<div style="font-size:12px;margin-top:2px;' + INK + '" data-zx-served><b>Functions they serve</b> (up the function tree and the traces):</div>' + r.served.map(function (f) { return '<div style="font-size:12px;padding-left:10px;' + INK + '"><b>' + _esc(f.funcId) + '</b> ' + _esc(f.name) + ' (through ' + f.through.map(_esc).join(', ') + ')</div>'; }).join('') : '') +
            (r.byZoneOnly.length ? '<div style="font-size:12px;margin-top:2px;' + INK + '" data-zx-zoneonly><b>Possibly reached</b> (elements not mapped to equipment, matched by their zone or CAD part only):</div>' + r.byZoneOnly.map(line).join('') : '') +
            (r.unmapped ? '<div style="font-size:12px;' + INK + '">' + r.unmapped + ' Sys Lab element' + (r.unmapped === 1 ? ' is' : 's are') + ' not mapped to equipment yet.</div>' : '');
    }
    // reachHtml({ volumeId } | { zoneId }): the Sys Lab functions under an Impact panel result.
    function reachHtml(o, cadId) { o = o || {}; return _fnList(o.volumeId ? reachOfVolume(o.volumeId, cadId) : o.zoneId ? reachOfZone(o.zoneId) : null); }
    function _host() {
        if (typeof document === 'undefined') return null;
        var el = document.getElementById('cad-syslab'); if (el) return el;
        var after = document.getElementById('cad-pra'); if (!after || !after.parentNode) return null;
        el = document.createElement('div'); el.id = 'cad-syslab';
        el.style.cssText = 'margin-top:10px;border:1px solid var(--color-border-hair);border-radius:8px;padding:10px;max-height:640px;overflow:auto;' + INK;
        after.parentNode.insertBefore(el, after.nextSibling);
        el.addEventListener('click', _onClick);
        return el;
    }
    function renderPanel() {
        var el = _host(); if (!el) return;
        var rec = stored(), h = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;"><b style="font-size:13px;' + INK + '">Sys Lab exchange</b>' +
            '<button style="' + BTNP + '" data-zx-act="export" title="Zones, CAD parts and containment, equipment links, risk volumes and what they reach, for Sys Lab">Export zones and risks for Sys Lab</button>' +
            '<button style="' + BTN + '" data-zx-act="import" title="The physical architecture file Sys Lab exports (Export physical architecture)">Import Sys Lab physical architecture</button></div>' +
            '<div style="font-size:12px;margin-bottom:6px;' + INK + '">Sys Lab holds the functions and the architecture; this page holds the zones and risks. The export gives Sys Lab the zone list, the CAD containment and every risk result, so each function shows what reaches it. The import brings Sys Lab\'s elements and functions here, so each risk shows the functions it reaches. Nothing is mapped without your click.</div>' +
            (ui.msg ? '<div style="font-size:12px;margin:4px 0;font-weight:600;color:' + (ui.bad ? 'var(--color-danger,#8E2A2A)' : 'var(--color-text-primary,#111418)') + ';" data-zx-msg>' + _esc(ui.msg) + '</div>' : '');
        if (!rec) { el.innerHTML = h + '<div style="font-size:12px;' + INK + '">No Sys Lab file imported yet.</div>'; return; }
        var mm = matchSysLab();
        h += '<div style="font-size:12px;margin:4px 0;' + INK + '" data-zx-summary>From <b>' + _esc(rec.file) + '</b>, imported ' + _esc(String(rec.importedAt || '').slice(0, 10)) + ' by ' + _esc(rec.by) + ': ' + rec.elements.length + ' elements, ' + _arr(rec.systems).length + ' systems, ' + rec.functions.length + ' functions. ' +
             mm.linked.length + ' mapped, ' + mm.exact.length + ' exact matches to accept, ' + mm.candidates.length + ' to confirm, ' + mm.unmatched.length + ' with no match.</div>';
        // exact
        if (mm.exact.length) {
            var pe = _page('exact', mm.exact);
            h += '<div style="font-size:12px;margin-top:6px;' + INK + '"><b>Exact matches</b> <button style="' + BTN + '" data-zx-act="accept-exact">Accept all ' + mm.exact.length + '</button></div><table style="width:100%;border-collapse:collapse;font-size:12px;" data-zx-exact><tr><th style="' + TH + '">Sys Lab element</th><th style="' + TH + '">Equipment</th><th style="' + TH + '">Why</th></tr>' +
                pe.rows.map(function (x) { return '<tr style="border-top:1px solid var(--color-border-hair);"><td style="' + TD + '">' + _esc(_label(_elByKey(rec, x.key))) + '</td><td style="' + TD + '">' + _esc(_sysLabel(x.sysId)) + '</td><td style="' + TD + '">' + _esc(ON_LABELS[x.on] || x.on) + '</td></tr>'; }).join('') + '</table>' + pe.bar;
        }
        if (mm.candidates.length) {
            var pc2 = _page('cand', mm.candidates);
            h += '<div style="font-size:12px;margin-top:8px;' + INK + '"><b>Matches to confirm</b> (a shared part number or a similar name is never mapped by itself)</div><table style="width:100%;border-collapse:collapse;font-size:12px;" data-zx-cand><tr><th style="' + TH + '">Sys Lab element</th><th style="' + TH + '">Equipment</th><th style="' + TH + '"></th></tr>' +
                pc2.rows.map(function (x) { return '<tr style="border-top:1px solid var(--color-border-hair);"><td style="' + TD + '">' + _esc(_label(_elByKey(rec, x.key))) + '</td><td style="' + TD + '"><select data-zx-pick="' + _esc(x.key) + '" style="font-size:11.5px;">' + x.sysIds.map(function (s) { return '<option value="' + _esc(s) + '">' + _esc(_sysLabel(s)) + '</option>'; }).join('') + '</select></td>' +
                    '<td style="' + TD + 'white-space:nowrap;"><button style="' + BTN + '" data-zx-act="confirm" data-key="' + _esc(x.key) + '">Confirm</button> <button style="' + BTN + '" data-zx-act="reject" data-key="' + _esc(x.key) + '">Reject</button></td></tr>'; }).join('') + '</table>' + pc2.bar;
        }
        if (mm.linked.length) {
            var pl = _page('linked', mm.linked);
            h += '<div style="font-size:12px;margin-top:8px;' + INK + '"><b>Mapped</b></div><table style="width:100%;border-collapse:collapse;font-size:12px;" data-zx-linked><tr><th style="' + TH + '">Sys Lab element</th><th style="' + TH + '">Equipment</th><th style="' + TH + '">How</th><th style="' + TH + '"></th></tr>' +
                pl.rows.map(function (x) { var mp = rec.map[x.key] || {}; return '<tr style="border-top:1px solid var(--color-border-hair);"><td style="' + TD + '">' + _esc(_label(_elByKey(rec, x.key))) + '</td><td style="' + TD + '">' + _esc(_sysLabel(x.sysId)) + '</td><td style="' + TD + '">' + _esc(ON_LABELS[x.on] || x.on) + (mp.by ? ', ' + _esc(mp.by) : '') + '</td><td style="' + TD + '"><button style="' + BTN + '" data-zx-act="unmap" data-key="' + _esc(x.key) + '">Unmap</button></td></tr>'; }).join('') + '</table>' + pl.bar;
        }
        if (mm.unmatched.length) { var pu = _page('unm', mm.unmatched); h += '<div style="font-size:12px;margin-top:8px;' + INK + '"><b>No match</b>: ' + pu.rows.map(function (k) { return _esc(_label(_elByKey(rec, k))); }).join('; ') + '</div>' + pu.bar; }
        // zone differences
        var zd = zoneDifferences();
        if (zd.length) { var pz = _page('zd', zd); h += '<div style="font-size:12px;margin-top:8px;' + INK + '" data-zx-zonediff><b>Zones that differ</b> (' + zd.length + ')</div>' + pz.rows.map(function (d) { return '<div style="font-size:12px;padding-left:10px;' + INK + '">' + _esc(d.label) + ': ' + _esc(d.text) + '</div>'; }).join('') + pz.bar; }
        // what each risk reaches
        var C = _C(), vols = C ? C.riskVolumes() : [];
        if (vols.length) {
            var pv = _page('vols', vols);
            h += '<div style="font-size:12px;margin-top:8px;' + INK + '"><b>Sys Lab functions each particular risk reaches</b></div><table style="width:100%;border-collapse:collapse;font-size:12px;" data-zx-vols><tr><th style="' + TH + '">Risk</th><th style="' + TH + '">Functions reached (mapped)</th><th style="' + TH + '">Functions they serve</th><th style="' + TH + '">Possibly reached (zone or CAD part only)</th></tr>' +
                pv.rows.map(function (v) { var r = reachOfVolume(v.id) || { functions: [], served: [], byZoneOnly: [] }; return '<tr style="border-top:1px solid var(--color-border-hair);" data-zx-vol="' + _esc(v.id) + '"><td style="' + TD + '">' + _esc(v.label || v.id) + ' (' + _esc(KIND_LABELS[v.kind] || v.kind) + ')</td><td style="' + TD + '">' + (r.functions.map(function (f) { return '<b>' + _esc(f.funcId) + '</b> ' + _esc(f.name); }).join('<br>') || 'none') + '</td><td style="' + TD + '">' + (_arr(r.served).map(function (f) { return _esc(f.funcId) + ' ' + _esc(f.name); }).join('<br>') || 'none') + '</td><td style="' + TD + '">' + (r.byZoneOnly.map(function (f) { return _esc(f.funcId) + ' ' + _esc(f.name); }).join('<br>') || 'none') + '</td></tr>'; }).join('') + '</table>' + pv.bar;
        }
        el.innerHTML = h;
    }
    function _say(t, bad) { ui.msg = t || ''; ui.bad = !!bad; renderPanel(); }
    function _download(name, text) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (_) {} }, 1000);
    }
    function exportFile() {
        var pic = exportPicture();
        var nm = String(_s(_g('projectName')) || 'Untitled').replace(/[^a-z0-9_-]+/gi, '_');
        _download('SafetyLab_' + nm + '.safetylab-zonal.json', JSON.stringify(pic, null, 1));
        try { if (typeof root.showToast === 'function') root.showToast('Exported the zones and risks for Sys Lab.', 'success', 3500); } catch (_) {}
        return pic;
    }
    function _importPick() {
        var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
        inp.onchange = function () {
            var f = inp.files && inp.files[0]; if (!f) return;
            f.text().then(function (t) {
                var obj; try { obj = JSON.parse(t); } catch (e) { _say('This is not a JSON file.', true); return; }
                var r = readSysLab(obj, f.name); if (!r.ok) { _say(r.err, true); return; }
                var pl = planSysLab(r.data);
                return importSysLab(r.data, _who()).then(function (res) {
                    if (!res || !res.ok) { _say((res && res.err) || 'Not imported.', true); return; }
                    _say('Imported ' + r.data.elements.length + ' elements and ' + r.data.functions.length + ' functions from ' + r.data.file + (pl.first ? '' : ': ' + pl.added.length + ' added, ' + pl.changed.length + ' changed, ' + pl.removed.length + ' removed, ' + pl.mapsKept.length + ' mappings kept, ' + pl.mapsDropped.length + ' dropped') + '.' + (r.issues.length ? ' ' + r.issues.join(' ') : ''));
                });
            }).catch(function (e) { _say('Not imported: ' + ((e && e.message) || e), true); });
        };
        inp.click();
    }
    function _onClick(ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-zx-act]') : null; if (!b) return;
        ev.preventDefault();
        var k = b.getAttribute('data-zx-act'), key = b.getAttribute('data-key');
        var done = function (r) { if (r && r.ok === false) _say(r.err, true); else _say(''); };
        if (k === 'page') { ui.pages[b.getAttribute('data-k')] = Number(b.getAttribute('data-pg')) || 0; renderPanel(); return; }
        if (k === 'export') { exportFile(); return; }
        if (k === 'import') { _importPick(); return; }
        if (k === 'accept-exact') { acceptExact(_who()).then(done); return; }
        if (k === 'confirm' || k === 'reject') {
            var sel = document.querySelector('[data-zx-pick="' + (root.CSS && CSS.escape ? CSS.escape(key) : key) + '"]'), sid = sel ? sel.value : null;
            if (!sid) return;
            (k === 'confirm' ? confirmMap(key, sid, _who()) : rejectMap(key, sid, _who())).then(done); return;
        }
        if (k === 'unmap') { unmap(key, _who()).then(done); return; }
    }

    var api = {
        VERSION: VERSION, zsaOut: zsaOut, FORMAT: FORMAT, FORMAT_VERSION: FORMAT_VERSION, PART_LIMIT: PART_LIMIT, KIND_LABELS: KIND_LABELS, ON_LABELS: ON_LABELS, fp: fp,
        exportPicture: exportPicture, checkPicture: checkPicture, hasContent: hasContent,
        readSysLab: readSysLab, planSysLab: planSysLab, importSysLab: importSysLab, stored: stored, matchSysLab: matchSysLab,
        confirmMap: confirmMap, rejectMap: rejectMap, unmap: unmap, acceptExact: acceptExact,
        reach: reach, reachOfVolume: reachOfVolume, reachOfZone: reachOfZone, zoneDifferences: zoneDifferences,
        renderPanel: renderPanel, reachHtml: reachHtml, exportFile: exportFile
    };
    try { root.SLZonalExchange = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

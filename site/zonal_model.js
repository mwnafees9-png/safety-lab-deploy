// ============================================================================
// zonal_model.js, v1.2, 13 Oct 2026 (CAD / zonal / PRA engine): schema 'zones-2'. A zone may
// carry the volume it occupies and where its definition came from, so the CAD engine
// (cad_zonal.js, SLCadZonal) can say which part sits in which zone:
//     zone.volume = { kind:'box', min:[x,y,z], max:[x,y,z] }      aircraft axes, mm
//                 | { kind:'parts', cadId:'cad-1', pids:[...] }    the zone is a set of named CAD bodies
//                 | null                                            no volume (a list or hand zone)
//     zone.source = 'cad' | 'list' | 'manual'
//     zone.cadRef = { cadId, revision } | null
// Every field is optional: a zones-1 project reads exactly as before (no volume = not in any
// containment, source absent = 'manual'). migrate() is the explicit upgrade: it stamps
// projectConfig.zonesSchema = 'zones-2' and fills the three fields with their neutral values;
// it never touches ids, codes, parents or equipment, and running it twice changes nothing.
// validate() also checks a volume's shape. setVolume(id, volume, source, cadRef) writes them.
// ============================================================================
// zonal_model.js — v1.0 — Z1: the structured zonal model (hierarchical zones
// + equipment register). BORN MODULAR: new file, zero monolith edits; store
// under projectConfig.zones, so it persists wholesale with the project and
// rides the roundtrip proof automatically (same as projectConfig.macModels).
//
// WHY THIS EXISTS: today ZSA rows carry only a zone *label* (zsaData.zoneId)
// and the "zonal layout" is free text handed to the AI. There is no structured
// tree of zones with the equipment installed in each. That structured model is
// the prerequisite for the DETERMINISTIC physical-independence cross-check
// (ZSA/PRA co-location vs credited-independent members) — see tasks Z*/P*.
//
// THE CONTRACT (schema 'zones-1'):
//   projectConfig.zones = [ zone, ... ]  where zone =
//     { id:'z-<n>', code:'110', name:'Avionics bay',
//       parentId:'z-100' | null,          // containment tree (adjacency list)
//       equipment:['sys-3', ...] }         // systemsData ids installed here
//
//   Invariants (validate() enforces / reports):
//     · parentId resolves to an existing zone, or is null (a root/major zone)
//     · no cycles in the parent chain (strict containment tree)
//     · ids unique; codes SHOULD be unique (warn, not hard-fail)
//     · every equipment id resolves to a real systemsData entry (no dangling)
//     · each equipment sits in AT MOST ONE zone — a physical box has one place
//
// SCOPE: pure logic + schema only. No DOM, no rendering (that is a later step).
// Optional depth: a flat list may be a single level (no sub-zones) or nested to
// any depth — nesting is opt-in, never required.
//
// Identity rule (make-or-break for the golden thread): equipment ids are the
// SAME systemsData ids used by the MAC/FTA model. This module never invents a
// parallel identity; it references the one the rest of the tool already uses.
// ============================================================================
(function () {
    'use strict';
    var ROOT = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

    function _pc() { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : (ROOT.projectConfig || {}); }
    function _sys() { return (typeof systemsData !== 'undefined' && systemsData) ? systemsData : (ROOT.systemsData || []); }
    function _zones() { var pc = _pc(); if (!Array.isArray(pc.zones)) pc.zones = []; return pc.zones; }
    function _nextId() { var pc = _pc(); pc.zoneSeq = (pc.zoneSeq || 0) + 1; return 'z-' + pc.zoneSeq; }

    function all() { return _zones().slice(); }
    function get(id) { return _zones().find(function (z) { return z && z.id === id; }) || null; }
    function roots() { return _zones().filter(function (z) { return z && (z.parentId == null); }); }
    function children(parentId) { return _zones().filter(function (z) { return z && z.parentId === parentId; }); }

    // subtree(id) = [self, ...all descendants]. Cycle-guarded.
    function subtree(id) {
        var out = [], seen = {};
        (function walk(zid) {
            if (!zid || seen[zid]) return;
            seen[zid] = 1;
            var z = get(zid); if (!z) return;
            out.push(z);
            children(zid).forEach(function (c) { walk(c.id); });
        })(id);
        return out;
    }

    function depth(id) {
        var d = 0, cur = get(id), guard = 0;
        while (cur && cur.parentId != null && guard++ < 1000) { d++; cur = get(cur.parentId); }
        return d;
    }

    // isDescendant(id, ancestorId): is `id` inside ancestorId's subtree (strictly below)?
    function isDescendant(id, ancestorId) {
        var cur = get(id), guard = 0;
        if (!cur) return false;
        cur = get(cur.parentId);
        while (cur && guard++ < 1000) {
            if (cur.id === ancestorId) return true;
            cur = get(cur.parentId);
        }
        return false;
    }

    // Union of all equipment across a zone's subtree (self + descendants).
    function equipmentInSubtree(id) {
        var set = {};
        subtree(id).forEach(function (z) { (z.equipment || []).forEach(function (s) { set[s] = 1; }); });
        return Object.keys(set);
    }

    // Which zone a given equipment id is installed in (its direct zone), or null.
    function zoneOf(systemId) {
        return _zones().find(function (z) { return (z.equipment || []).indexOf(systemId) >= 0; }) || null;
    }

    // ---- mutations -------------------------------------------------------
    function addZone(opts) {
        opts = opts || {};
        if (opts.parentId != null && !get(opts.parentId)) return { ok: false, err: 'Parent zone not found: ' + opts.parentId };
        if (opts.volume != null && volumeIssue(opts.volume)) return { ok: false, err: volumeIssue(opts.volume) };
        var z = { id: _nextId(), code: String(opts.code || '').trim(), name: String(opts.name || '').trim() || 'Zone',
                  parentId: (opts.parentId != null ? opts.parentId : null), equipment: [] };
        // zones-2 fields only when given, so a zones-1 caller still makes a zones-1 shaped zone
        if (opts.volume !== undefined) z.volume = _cloneVolume(opts.volume);
        if (opts.source !== undefined) z.source = SOURCES.indexOf(opts.source) >= 0 ? opts.source : 'manual';
        if (opts.cadRef !== undefined) z.cadRef = opts.cadRef ? { cadId: String(opts.cadRef.cadId || ''), revision: opts.cadRef.revision == null ? null : String(opts.cadRef.revision) } : null;
        _zones().push(z);
        return { ok: true, zone: z };
    }

    // ---- zones-2: volumes ----------------------------------------------------
    var SOURCES = ['cad', 'list', 'manual'];
    function _num3(v) { return Array.isArray(v) && v.length === 3 && v.every(function (x) { return typeof x === 'number' && isFinite(x); }); }
    // null when the volume is well formed, else the reason in words.
    function volumeIssue(v) {
        if (v == null) return null;
        if (typeof v !== 'object') return 'A zone volume must be a box, a set of CAD parts, or nothing.';
        if (v.kind === 'box') {
            if (!_num3(v.min) || !_num3(v.max)) return 'A box volume needs min and max as three numbers each.';
            for (var i = 0; i < 3; i++) if (v.min[i] > v.max[i]) return 'A box volume has min above max on axis ' + 'xyz'.charAt(i) + '.';
            return null;
        }
        if (v.kind === 'parts') {
            if (!v.cadId || typeof v.cadId !== 'string') return 'A parts volume needs the CAD model id it comes from.';
            if (!Array.isArray(v.pids) || !v.pids.length || !v.pids.every(function (p) { return typeof p === 'string' && p; })) return 'A parts volume needs at least one CAD part id.';
            return null;
        }
        return 'Unknown zone volume kind: ' + v.kind;
    }
    function _cloneVolume(v) {
        if (v == null) return null;
        if (v.kind === 'box') return { kind: 'box', min: v.min.slice(), max: v.max.slice() };
        return { kind: 'parts', cadId: v.cadId, pids: v.pids.slice() };
    }
    function setVolume(id, volume, source, cadRef) {
        var z = get(id); if (!z) return { ok: false, err: 'not found' };
        var bad = volumeIssue(volume); if (bad) return { ok: false, err: bad };
        z.volume = _cloneVolume(volume);
        if (source !== undefined) z.source = SOURCES.indexOf(source) >= 0 ? source : 'manual';
        if (cadRef !== undefined) z.cadRef = cadRef ? { cadId: String(cadRef.cadId || ''), revision: cadRef.revision == null ? null : String(cadRef.revision) } : null;
        return { ok: true, zone: z };
    }
    // The explicit zones-1 -> zones-2 upgrade. Idempotent; returns how many zones gained a field.
    function migrate() {
        var pc = _pc(), n = 0;
        _zones().forEach(function (z) {
            if (!z) return;
            var touched = false;
            if (!('volume' in z)) { z.volume = null; touched = true; }
            if (!('source' in z) || SOURCES.indexOf(z.source) < 0) { z.source = 'manual'; touched = true; }
            if (!('cadRef' in z)) { z.cadRef = null; touched = true; }
            if (touched) n++;
        });
        pc.zonesSchema = 'zones-2';
        return { ok: true, upgraded: n, schema: 'zones-2' };
    }
    function schemaOf() { var pc = _pc(); return pc.zonesSchema === 'zones-2' ? 'zones-2' : 'zones-1'; }

    function rename(id, name) { var z = get(id); if (!z) return { ok: false, err: 'not found' }; z.name = String(name || '').trim() || z.name; return { ok: true }; }
    function setCode(id, code) { var z = get(id); if (!z) return { ok: false, err: 'not found' }; z.code = String(code || '').trim(); return { ok: true }; }

    // remove: cascade deletes the subtree by default; {reparent:true} lifts children to the grandparent.
    function remove(id, o) {
        o = o || {};
        var z = get(id); if (!z) return { ok: false, err: 'not found' };
        if (o.reparent) {
            children(id).forEach(function (c) { c.parentId = z.parentId; });
            var arr = _zones(); var i = arr.indexOf(z); if (i >= 0) arr.splice(i, 1);
        } else {
            var ids = subtree(id).map(function (x) { return x.id; });
            var pc = _pc(); pc.zones = _zones().filter(function (x) { return ids.indexOf(x.id) < 0; });
        }
        return { ok: true };
    }

    // assign: a box lives in exactly one zone — assigning moves it (removes from any other zone).
    function assign(zoneId, systemId) {
        var z = get(zoneId); if (!z) return { ok: false, err: 'zone not found' };
        if (!systemId) return { ok: false, err: 'no equipment id' };
        _zones().forEach(function (zz) { var i = (zz.equipment || []).indexOf(systemId); if (i >= 0) zz.equipment.splice(i, 1); });
        if (!Array.isArray(z.equipment)) z.equipment = [];
        z.equipment.push(systemId);
        return { ok: true };
    }
    function unassign(zoneId, systemId) {
        var z = get(zoneId); if (!z || !Array.isArray(z.equipment)) return { ok: false, err: 'not found' };
        var i = z.equipment.indexOf(systemId); if (i >= 0) z.equipment.splice(i, 1);
        return { ok: true };
    }

    // ---- validation (the contract gate) ---------------------------------
    function validate() {
        var issues = [];
        var zs = _zones();
        var ids = {}, codes = {};
        var sysIds = {}; _sys().forEach(function (s) { if (s && s.id) sysIds[s.id] = 1; });
        var equipSeen = {};
        zs.forEach(function (z) {
            if (!z || !z.id) { issues.push('A zone is missing an id.'); return; }
            if (ids[z.id]) issues.push('Duplicate zone id: ' + z.id);
            ids[z.id] = 1;
            if (z.code) { if (codes[z.code]) issues.push('Duplicate zone code: ' + z.code + ' (' + z.name + ')'); codes[z.code] = 1; }
            if (z.parentId != null && !zs.some(function (p) { return p.id === z.parentId; })) issues.push('Zone ' + (z.code || z.id) + ' has a missing parent: ' + z.parentId);
            var vb = volumeIssue(z.volume); if (vb) issues.push('Zone ' + (z.code || z.id) + ': ' + vb);
            if (z.source != null && SOURCES.indexOf(z.source) < 0) issues.push('Zone ' + (z.code || z.id) + ' has an unknown source: ' + z.source);
            (z.equipment || []).forEach(function (s) {
                if (!sysIds[s]) issues.push('Zone ' + (z.code || z.id) + ' references unknown equipment: ' + s);
                if (equipSeen[s]) issues.push('Equipment ' + s + ' is assigned to more than one zone.');
                equipSeen[s] = 1;
            });
        });
        // cycle detection: every node must reach a root without revisiting.
        zs.forEach(function (z) {
            var seen = {}, cur = z, guard = 0;
            while (cur && cur.parentId != null && guard++ < 5000) {
                if (seen[cur.id]) { issues.push('Cycle in zone parent chain at ' + (z.code || z.id)); break; }
                seen[cur.id] = 1;
                cur = get(cur.parentId);
            }
        });
        return { ok: issues.length === 0, issues: issues, zones: zs.length,
                 equipmentPlaced: Object.keys(equipSeen).length, systems: Object.keys(sysIds).length };
    }

    // ---- barriers (adjacency / boundary model) --------------------------
    // A barrier between two zones (typically siblings) means a LOCAL hazard does
    // not propagate across it — a firewall / drip-shield / segregation. Only a
    // SUBSTANTIATED barrier relieves a co-location (assumption-moat discipline).
    // Stored on projectConfig.zoneBarriers so it persists with the project.
    function _barriers() { var pc = _pc(); if (!Array.isArray(pc.zoneBarriers)) pc.zoneBarriers = []; return pc.zoneBarriers; }
    function _nextBid() { var pc = _pc(); pc.barrierSeq = (pc.barrierSeq || 0) + 1; return 'bar-' + pc.barrierSeq; }
    function barriers() { return _barriers().slice(); }
    function barrierBetween(a, b) { return _barriers().find(function (x) { return (x.a === a && x.b === b) || (x.a === b && x.b === a); }) || null; }
    function addBarrier(a, b, type, substantiated) {
        if (!get(a) || !get(b) || a === b) return { ok: false, err: 'need two distinct existing zones' };
        var ex = barrierBetween(a, b); if (ex) return { ok: false, err: 'barrier already exists', barrier: ex };
        var bar = { id: _nextBid(), a: a, b: b, type: type || 'firewall', substantiated: !!substantiated };
        _barriers().push(bar); return { ok: true, barrier: bar };
    }
    function removeBarrier(id) { var arr = _barriers(); var i = arr.findIndex(function (x) { return x.id === id; }); if (i >= 0) arr.splice(i, 1); return { ok: true }; }
    function setBarrierSubstantiated(id, v) { var b = _barriers().find(function (x) { return x.id === id; }); if (b) b.substantiated = !!v; return { ok: !!b }; }

    ROOT.ZONES = {
        SCHEMA: 'zones-2', SCHEMAS: ['zones-1', 'zones-2'], SOURCES: SOURCES.slice(),
        volumeIssue: volumeIssue, setVolume: setVolume, migrate: migrate, schemaOf: schemaOf,
        all: all, get: get, roots: roots, children: children, subtree: subtree,
        depth: depth, isDescendant: isDescendant, equipmentInSubtree: equipmentInSubtree, zoneOf: zoneOf,
        addZone: addZone, rename: rename, setCode: setCode, remove: remove,
        assign: assign, unassign: unassign, validate: validate,
        barriers: barriers, barrierBetween: barrierBetween, addBarrier: addBarrier, removeBarrier: removeBarrier, setBarrierSubstantiated: setBarrierSubstantiated
    };
})();

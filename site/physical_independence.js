// ============================================================================
// physical_independence.js — v1.0 — Z2/P-core: the DETERMINISTIC intersection
// between a hazard's spatial extent and a credited-independent member set.
// BORN MODULAR: new file, pure logic, no DOM. Depends only on window.ZONES.
//
// This is the "computed, not suggested" step. Given (a) the authored zonal
// model + equipment register (zonal_model.js) and (b) a hazard footprint
// expressed as a set of zone ids, it computes — by set/tree math, no inference —
// whether the hazard defeats a credited independence claim, i.e. whether ONE
// hazard reaches TWO OR MORE members that were supposed to be independent.
//
// Two hazard shapes, matching the two CCA legs:
//   · PRA  — the footprint explicitly names its zones; extent = union of those
//            zones' subtrees. Members inside = intersection with the equipment
//            there. Conflict iff >= 2 credited-independent members are inside.
//   · ZSA  — co-location: for each pair of members, their lowest common
//            ancestor zone (LCA) is the granularity at which one local event
//            gets both. We report the FINEST such shared zone per group, and
//            hand the granularity to the caller (a fire wants a deep LCA; a
//            major-zone event a shallow one).
//
// Honesty boundary: the zonal model and the footprint are AUTHORED (human or
// AI). Everything in this file is deterministic given those inputs. It only
// PRODUCES findings; wiring findings into the DAL/probability compromise engine
// (_cmaCompromisedGateIdSet) is a separate step.
// ============================================================================
(function () {
    'use strict';
    var ROOT = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
    function _Z() { return ROOT.ZONES || (typeof ZONES !== 'undefined' ? ZONES : null); }

    // ancestor chain [zoneId, parent, ..., root] for a zone.
    function zoneAncestors(zoneId) {
        var Z = _Z(); if (!Z) return [];
        var out = [], cur = Z.get(zoneId), guard = 0;
        while (cur && guard++ < 5000) { out.push(cur.id); cur = (cur.parentId != null) ? Z.get(cur.parentId) : null; }
        return out;
    }
    // lowest common ancestor zone id of two zones, or null if they share no tree.
    function lca(zoneA, zoneB) {
        if (!zoneA || !zoneB) return null;
        var a = zoneAncestors(zoneA); var set = {}; a.forEach(function (id) { set[id] = 1; });
        var b = zoneAncestors(zoneB);
        for (var i = 0; i < b.length; i++) { if (set[b[i]]) return b[i]; }
        return null;
    }

    // union of the subtrees of the footprint's zones -> set of zone ids in extent.
    function footprintExtent(footprintZoneIds) {
        var Z = _Z(); if (!Z) return [];
        var set = {};
        (footprintZoneIds || []).forEach(function (zid) { Z.subtree(zid).forEach(function (z) { set[z.id] = 1; }); });
        return Object.keys(set);
    }
    // equipment ids installed anywhere in the footprint extent.
    function equipmentInFootprint(footprintZoneIds) {
        var Z = _Z(); if (!Z) return [];
        var set = {};
        footprintExtent(footprintZoneIds).forEach(function (zid) {
            var z = Z.get(zid); (z && z.equipment || []).forEach(function (s) { set[s] = 1; });
        });
        return Object.keys(set);
    }

    // PRA: which credited-independent members fall inside the footprint.
    function footprintMembers(footprintZoneIds, memberSystemIds) {
        var inFoot = {}; equipmentInFootprint(footprintZoneIds).forEach(function (s) { inFoot[s] = 1; });
        return (memberSystemIds || []).filter(function (m) { return inFoot[m]; });
    }
    function footprintConflict(footprintZoneIds, memberSystemIds) {
        var hit = footprintMembers(footprintZoneIds, memberSystemIds);
        return { conflict: hit.length >= 2, hit: hit, extentZones: footprintExtent(footprintZoneIds) };
    }

    // child of `ancId` on the path down to `zoneId` (the branch that zone sits in under the ancestor).
    function childTowards(ancId, zoneId) {
        var Z = _Z(); if (!Z) return null;
        var cur = Z.get(zoneId), guard = 0;
        if (!cur) return null;
        if (cur.id === ancId) return ancId;
        while (cur && cur.parentId != null && guard++ < 5000) { if (cur.parentId === ancId) return cur.id; cur = Z.get(cur.parentId); }
        return null;
    }
    // 19 Oct 2026 (build 7): the claim check that lived here (sharedZones / colocationConflict / assessClaim) is
    // gone. It called two members co-located whenever their zones shared ANY ancestor zone, the whole aircraft
    // included, so a deep zone tree compromised nearly every claim; and it was a second independence check beside
    // the CAD/zonal engine's. The one check is SLCadZonal.independenceFlags (cad_zonal.js); physical_crosscheck.js runs
    // it on the credited claims. What stays here is the zone and footprint arithmetic.

    ROOT.PHYS_INDEP = {
        SCHEMA: 'phys-indep-2',
        zoneAncestors: zoneAncestors, lca: lca,
        footprintExtent: footprintExtent, equipmentInFootprint: equipmentInFootprint,
        footprintMembers: footprintMembers, footprintConflict: footprintConflict
    };
})();

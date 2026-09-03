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
    // A SUBSTANTIATED barrier between the two branches under the LCA relieves the co-location
    // (a firewall / drip-shield / segregation). Unsubstantiated barriers do NOT relieve.
    function _barrierSeparates(ancId, zA, zB) {
        var Z = _Z(); if (!Z || typeof Z.barrierBetween !== 'function') return false;
        if (zA === zB) return false;                       // same zone — nothing separates them
        var cA = childTowards(ancId, zA), cB = childTowards(ancId, zB);
        if (!cA || !cB || cA === cB) return false;         // same branch — no cross-branch barrier
        var bar = Z.barrierBetween(cA, cB);
        return !!(bar && bar.substantiated);
    }

    // ZSA: finest shared zone(s) among members. Returns [{zoneId, code, name, depth, members[]}].
    // Built from pairwise LCA so the reported zone is the tightest co-location for each group.
    function sharedZones(memberSystemIds) {
        var Z = _Z(); if (!Z) return [];
        var placed = (memberSystemIds || []).map(function (m) { var z = Z.zoneOf(m); return z ? { m: m, z: z.id } : null; }).filter(Boolean);
        var byZone = {}; // lcaZoneId -> Set(members)
        for (var i = 0; i < placed.length; i++) {
            for (var j = i + 1; j < placed.length; j++) {
                var anc = lca(placed[i].z, placed[j].z);
                if (!anc) continue;
                if (_barrierSeparates(anc, placed[i].z, placed[j].z)) continue;   // computed barrier relief
                if (!byZone[anc]) byZone[anc] = {};
                byZone[anc][placed[i].m] = 1; byZone[anc][placed[j].m] = 1;
            }
        }
        return Object.keys(byZone).map(function (zid) {
            var z = Z.get(zid) || {};
            return { zoneId: zid, code: z.code || '', name: z.name || '', depth: Z.depth(zid), members: Object.keys(byZone[zid]) };
        }).sort(function (a, b) { return b.depth - a.depth; }); // finest (deepest) first
    }
    function colocationConflict(memberSystemIds) {
        var groups = sharedZones(memberSystemIds);
        return { conflict: groups.length > 0, groups: groups };
    }

    // Assess one credited-independence claim against co-location + a set of PRA footprints.
    // claim = { id?, label?, members:[systemId...], footprints:[{id,label,zones:[zoneId...]}] }
    // Returns deterministic findings; the caller decides how to drive the compromise engine.
    function assessClaim(claim) {
        claim = claim || {};
        var members = claim.members || [];
        var findings = [];
        colocationConflict(members).groups.forEach(function (g) {
            findings.push({ kind: 'zsa', zoneId: g.zoneId, label: 'Co-location in zone ' + (g.code || g.zoneId), depth: g.depth, members: g.members });
        });
        (claim.footprints || []).forEach(function (fp) {
            var r = footprintConflict(fp.zones || [], members);
            if (r.conflict) findings.push({ kind: 'pra', footprintId: fp.id, label: (fp.label || 'PRA') + ' footprint', members: r.hit });
        });
        return { claimId: claim.id || null, members: members, compromised: findings.length > 0, findings: findings };
    }

    ROOT.PHYS_INDEP = {
        SCHEMA: 'phys-indep-1',
        zoneAncestors: zoneAncestors, lca: lca,
        footprintExtent: footprintExtent, equipmentInFootprint: equipmentInFootprint,
        footprintMembers: footprintMembers, footprintConflict: footprintConflict,
        sharedZones: sharedZones, colocationConflict: colocationConflict,
        assessClaim: assessClaim
    };
})();

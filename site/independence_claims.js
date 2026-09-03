// ============================================================================
// independence_claims.js — v1.0 — P-bridge: extract credited-independence
// claims from the fault trees and resolve each member to EQUIPMENT identity,
// so the physical cross-check (physical_independence.js) can be fed from the
// real model. BORN MODULAR: new file, READ-ONLY walk, no DOM, no mutation.
//
// A "credited-independence claim" is an AND/INHIBIT gate whose DAL reduction
// rests on the members being independent — the engine already tags these with
// node._independenceReq (and node._dalReduced). Its members must each resolve
// to a piece of equipment (a systemsData id) to be placed in a zone.
//
// Member -> equipment resolution, in priority:
//   1. MAC-compiled event: logicalId 'macsys:<sysId>'  -> sysId directly.
//   2. Explicit authored link: node.equipmentId          -> that id.
//   3. Otherwise UNRESOLVED — the member can't be physically cross-checked,
//      and that is surfaced (never silently passed). Authored FTA events have
//      no equipment link today, so they land here until one is added.
//
// This module identifies WHAT can be cross-checked; it changes nothing.
// ============================================================================
(function () {
    'use strict';
    var ROOT = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
    function _pages() { return (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages : (ROOT.ftaPages || []); }

    function resolveEquipment(node) {
        if (!node) return null;
        var lid = String(node.logicalId || '');
        if (lid.indexOf('macsys:') === 0) return lid.slice(7);   // MAC system event -> systemsData id
        if (node.equipmentId) return node.equipmentId;            // explicit authored link
        return null;                                              // unresolved (no equipment identity)
    }

    function extractClaims() {
        var out = [];
        _pages().forEach(function (p) {
            if (!p || !p.root) return;
            (function walk(n) {
                if (!n) return;
                var andLike = n.gateType === 'AND' || n.gateType === 'INHIBIT';
                if (andLike && (n._independenceReq || n._dalReduced)) {
                    var kids = n.children || n._children || [];
                    var members = kids.map(function (c) {
                        return { displayId: c.displayId || c.id, logicalId: c.logicalId, type: c.type, equipmentId: resolveEquipment(c) };
                    });
                    out.push({
                        pageId: p.id, page: p.name, gateId: n.id, gate: n.displayId || n.id, gateType: n.gateType,
                        independence: n.dalIndependence, reduced: !!n._dalReduced,
                        members: members,
                        resolved: members.filter(function (m) { return m.equipmentId; }).length,
                        unresolved: members.filter(function (m) { return !m.equipmentId; }).length
                    });
                }
                (n.children || []).forEach(walk); (n._children || []).forEach(walk);
            })(p.root);
        });
        return out;
    }

    // Claims ready for the physical cross-check: >=2 members, all resolving to equipment.
    function crossCheckable() {
        return extractClaims().filter(function (c) { return c.members.length >= 2 && c.unresolved === 0; });
    }

    // Coverage summary — how much of the independence surface is physically cross-checkable today.
    function coverage() {
        var claims = extractClaims();
        var ready = claims.filter(function (c) { return c.members.length >= 2 && c.unresolved === 0; }).length;
        var totalMembers = 0, resolvedMembers = 0;
        claims.forEach(function (c) { totalMembers += c.members.length; resolvedMembers += c.resolved; });
        return { claims: claims.length, crossCheckable: ready, members: totalMembers, membersResolved: resolvedMembers };
    }

    ROOT.INDEP_CLAIMS = { SCHEMA: 'indep-claims-1', resolveEquipment: resolveEquipment, extractClaims: extractClaims, crossCheckable: crossCheckable, coverage: coverage };
})();

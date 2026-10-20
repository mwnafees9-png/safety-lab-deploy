// 13 Oct 2026 (math fix 7): claims carry pending (reduction withheld until CMA) beside reduced, and k-of-n VOTING gates are read; see tests/regression_dal_row_20261013.test.js
// ============================================================================
// independence_claims.js — v1.1 — P-bridge: extract credited-independence
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

    // 19 Oct 2026 (build 7): one answer to "which equipment is this event", node_identity.js equipmentOf (an authored
    // equipment link, the declared identity, a MAC system event), the same one the CAD/zonal engine uses. A member that
    // is a gate is the equipment under it (the CAD/zonal engine's leaf walk, through transfers), so a claim whose inputs
    // are sub-trees is cross-checked instead of reported as unresolved.
    function _NI() { return ROOT.SLNodeIdentity || (typeof SLNodeIdentity !== 'undefined' ? SLNodeIdentity : null); }
    function resolveEquipment(node) {
        if (!node) return null;
        var NI = _NI();
        if (NI && NI.equipmentOf) return NI.equipmentOf(node);
        var lid = String(node.logicalId || '');
        if (node.equipmentId) return node.equipmentId;
        if (lid.indexOf('macsys:') === 0) return lid.slice(7);
        return null;
    }
    function memberEquipment(node) {
        var own = resolveEquipment(node); if (own) return [own];
        var C = ROOT.SLCadZonal;
        if (node && node.type === 'gate' && C && C.leafEquipment) return C.leafEquipment(node);
        return [];
    }

    function extractClaims() {
        var out = [];
        _pages().forEach(function (p) {
            if (!p || !p.root) return;
            (function walk(n) {
                if (!n) return;
                // 13 Oct 2026 (fix 7): a k-of-n VOTING gate (k >= 2) can carry a DAL reduction too.
                var andLike = n.gateType === 'AND' || n.gateType === 'INHIBIT' || n.gateType === 'VOTING';
                if (andLike && (n._independenceReq || n._dalReduced)) {
                    var kids = n.children || n._children || [];
                    var members = kids.map(function (c) {
                        var eq = memberEquipment(c);
                        return { id: c.id, displayId: c.displayId || c.id, logicalId: c.logicalId, type: c.type, equipmentId: eq.length === 1 ? eq[0] : (eq.length ? eq.join('+') : null), equipment: eq };
                    });
                    out.push({
                        pageId: p.id, page: p.name, gateId: n.id, gate: n.displayId || n.id, gateType: n.gateType,
                        // reduced = the DAL reduction is TAKEN (CMA-substantiated); pending = it is
                        // claimed and withheld until CMA substantiates it (13 Oct 2026, fix 7).
                        independence: n.dalIndependence, reduced: !!n._dalReduced, pending: !!n._dalPending,
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

    ROOT.INDEP_CLAIMS = { SCHEMA: 'indep-claims-1', resolveEquipment: resolveEquipment, memberEquipment: memberEquipment, extractClaims: extractClaims, crossCheckable: crossCheckable, coverage: coverage };
})();

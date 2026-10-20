// ============================================================================
// physical_crosscheck.js — v1.0 — P-orchestrator: run the deterministic
// physical-independence cross-check across every credited-independence claim.
// BORN MODULAR: new file, READ-ONLY (produces a report + the set of gate keys
// that are physically compromised); it does NOT yet drive the compromise
// engine — materializing findings into cmaData is the next, separate step.
//
// Composes the three engines already built and tested:
//   INDEP_CLAIMS.extractClaims()  — the credited-independent claims + member
//                                   -> equipment (node_identity.js equipmentOf)
//   SLCadZonal.independenceFlags({claimsOnly:true}) — the one physical
//                                   independence check (19 Oct 2026)
//   praData[].affectedZones        — authored PRA footprints as zone codes,
//                                   resolved through the zone model (zones-3)
//
// Output gate keys use the canonical "pageId:nodeId" format that the CMA /
// compromise engine (_cmaCompromisedGateIdSet, linkedGateIds) already speaks —
// so the next step can hand them straight to that engine with no translation.
// ============================================================================
(function () {
    'use strict';
    var ROOT = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

    // Authored PRA footprints: each PRA row's affectedZones (zone codes), as the zone model's ids. 19 Oct 2026
    // (zones-3): affectedZones is the one footprint field (the PRA form, the PRA canvas and the AI all write it); a
    // code the zone model does not carry cannot be placed and is listed in `unplaced`, never guessed.
    function praFootprints() {
        var pd = (typeof praData !== 'undefined' && praData) ? praData : (ROOT.praData || []);
        var Z = ROOT.ZONES;
        return pd.filter(function (p) { return p && p.disposition !== 'na' && Array.isArray(p.affectedZones) && p.affectedZones.length; })
                 .map(function (p) {
                     var ids = [], unplaced = [];
                     p.affectedZones.forEach(function (c) { var z = Z && Z.resolve ? Z.resolve(c) : null; if (z) { if (ids.indexOf(z.id) < 0) ids.push(z.id); } else unplaced.push(String(c)); });
                     return { id: p.praId || p.id, label: p.threat || p.praId || 'PRA', zones: ids, unplaced: unplaced };
                 })
                 .filter(function (f) { return f.zones.length || f.unplaced.length; });
    }

    // 19 Oct 2026 (build 7): the claims are checked by THE ONE physical independence check, SLCadZonal.independenceFlags
    // ({ claimsOnly: true }): same equipment, same zone, the same CAD particular-risk volume or the same PRA footprint
    // under two inputs of a credited gate is a violation and compromises the claim; nested or neighbouring zones without
    // a substantiated barrier are advisories, shown, and never compromise on their own. Before, this file had a check
    // of its own (PHYS_INDEP.assessClaim) that called two members co-located whenever their zones shared ANY ancestor,
    // the whole aircraft included, and read only the PRA canvas's footprints.
    function _flagFinding(f) {
        var pra = f.kind === 'same-risk-volume' || f.kind === 'same-pra-footprint';
        return { kind: pra ? 'pra' : 'zsa', flag: f.kind, zoneId: f.zoneId || null, footprintId: f.footprintId || f.volumeId || null,
                 label: f.kind === 'same-equipment' ? 'One item of equipment under both inputs'
                      : f.kind === 'same-zone' ? 'Co-location in zone ' + (f.zoneCode || f.zoneId)
                      : f.kind === 'same-risk-volume' ? (f.volumeLabel || 'Particular-risk volume') + ' (CAD volume)'
                      : f.kind === 'same-pra-footprint' ? ((f.praId ? f.praId + ' ' : '') + (f.footprintLabel || 'PRA')) + ' footprint'
                      : f.kind, members: f.equipment.slice(), text: f.text };
    }
    function run() {
        var IC = ROOT.INDEP_CLAIMS, C = ROOT.SLCadZonal;
        if (!IC || !C || typeof C.independenceFlags !== 'function') return { ok: false, err: 'physical-independence engines not loaded' };
        var flags = C.independenceFlags({ claimsOnly: true });
        var byGate = {};
        flags.forEach(function (f) { var k = f.treeId + ':' + f.gateId; (byGate[k] = byGate[k] || []).push(f); });
        var claims = IC.extractClaims();
        var report = [], compromisedGateKeys = [];
        claims.forEach(function (c) {
            var key = c.pageId + ':' + c.gateId;
            var unresolved = c.members.filter(function (m) { return !(m.equipment && m.equipment.length); }).length;
            if (c.members.length - unresolved < 2) {
                report.push({ gate: c.gate, page: c.page, key: key, status: 'not-cross-checkable',
                              reason: unresolved + ' of ' + c.members.length + ' member(s) not equipment-linked' });
                return;
            }
            var fl = byGate[key] || [];
            var findings = fl.filter(function (f) { return f.severity === 'violation'; }).map(_flagFinding);
            var advisories = fl.filter(function (f) { return f.severity !== 'violation'; }).map(_flagFinding);
            report.push({ gate: c.gate, page: c.page, key: key, status: findings.length ? 'compromised' : 'clear', findings: findings, advisories: advisories,
                          partial: unresolved ? unresolved + ' of ' + c.members.length + ' member(s) not equipment-linked' : null });
            if (findings.length) compromisedGateKeys.push(key);
        });
        return {
            ok: true,
            footprints: praFootprints().length,
            claims: claims.length,
            crossCheckable: report.filter(function (r) { return r.status !== 'not-cross-checkable'; }).length,
            compromised: compromisedGateKeys.length,
            compromisedGateKeys: compromisedGateKeys,
            report: report
        };
    }

    // ---- materialization hook -------------------------------------------
    // Writes each compromised claim as a COMPUTED CMA finding into cmaData so the
    // EXISTING _cmaCompromisedGateIdSet -> allocateDAL engine reverts the DAL letter
    // and demands a common-cause (beta) term on the probability. Rows are marked
    // origin:'physical', computed:true, NOT suggested / NOT aiGenerated (deterministic,
    // not AI). Idempotent + fingerprinted: unchanged -> respect current disposition
    // (a signed barrier relief stays relieved); layout changed -> reopen; no longer
    // compromised -> remove. Human-authored CMA rows are never touched.
    var PHYS_ORIGIN = 'physical';

    function _fingerprint(cr) {
        var members = [];
        (cr.findings || []).forEach(function (f) { (f.members || []).forEach(function (m) { members.push(m); }); });
        var sigs = (cr.findings || []).map(function (f) { return f.kind + ':' + (f.zoneId || f.footprintId || ''); }).sort();
        return cr.key + '|' + Array.from(new Set(members)).sort().join(',') + '|' + sigs.join(';');
    }
    function _findingsText(cr) {
        return (cr.findings || []).map(function (f) {
            return (f.kind === 'zsa' ? 'Co-location: ' : 'Particular risk: ') + f.label +
                   ' reaches ' + (f.members || []).length + ' credited-independent members (' + (f.members || []).join(', ') + ').';
        }).join(' ');
    }
    function _subject(cr) {
        var hasZ = cr.findings.some(function (f) { return f.kind === 'zsa'; });
        var hasP = cr.findings.some(function (f) { return f.kind === 'pra'; });
        return (hasZ && hasP) ? 'Physical common mode (co-location + particular risk)'
             : hasP ? 'Physical common mode (particular-risk footprint)'
             : 'Physical common mode (zonal co-location)';
    }

    function materialize() {
        var cd = (typeof cmaData !== 'undefined' && cmaData) ? cmaData : (ROOT.cmaData || (ROOT.cmaData = []));
        var r = run();
        if (!r.ok) return r;
        var compromised = {};
        r.report.forEach(function (x) { if (x.status === 'compromised') compromised[x.key] = x; });
        var created = 0, reopened = 0, kept = 0, relievedKept = 0, removed = 0;

        // 1. remove stale physical rows (gate no longer compromised) — never touch human rows
        for (var i = cd.length - 1; i >= 0; i--) {
            var row = cd[i];
            if (row && row.origin === PHYS_ORIGIN && !compromised[(row.linkedGateIds || [])[0]]) { cd.splice(i, 1); removed++; }
        }
        // 2. create / refresh for each compromised claim
        Object.keys(compromised).forEach(function (key) {
            var cr = compromised[key], fp = _fingerprint(cr);
            var ex = cd.find(function (row) { return row && row.origin === PHYS_ORIGIN && (row.linkedGateIds || [])[0] === key; });
            if (ex) {
                if (ex._physFingerprint !== fp) { ex._physFingerprint = fp; ex.findings = _findingsText(cr); ex.subject = _subject(cr) + ' on ' + cr.gate; ex.status = 'Open'; reopened++; }
                else if (ex.status === 'Mitigated' || ex.status === 'Closed — Accepted') relievedKept++;
                else kept++;
            } else {
                cd.push({
                    internalId: (typeof newRowId === 'function') ? newRowId() : ('phys-' + Date.now() + Math.random().toString(36).slice(2, 6)),
                    cmaId: (typeof _newAnalysisId === 'function') ? _newAnalysisId('CMA') : ('CMA-P' + (created + 1)),
                    subject: _subject(cr) + ' on ' + cr.gate,
                    claim: 'Members of ' + cr.gate + ' are credited independent, but a single physical hazard reaches two or more of them. Independence is not substantiated on the installation.',
                    findings: _findingsText(cr),
                    mitigation: 'Default: independence compromised — the DAL reduction reverts and a common-cause (β) term is required. To relieve, substantiate a physical barrier (firewall / segregation / drip shield) between the members and set this row to "Closed — Accepted" with the basis.',
                    status: 'Open', scope: 'aircraft', owningSystemId: '',
                    linkedGateIds: [key], origin: PHYS_ORIGIN, computed: true, _physFingerprint: fp
                });
                created++;
            }
        });
        try { if (typeof renderCMA === 'function') renderCMA(); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return { ok: true, compromised: Object.keys(compromised).length, created: created, reopened: reopened, kept: kept, relievedKept: relievedKept, removed: removed };
    }

    function clearMaterialized() {
        var cd = (typeof cmaData !== 'undefined' && cmaData) ? cmaData : (ROOT.cmaData || []);
        var n = 0;
        for (var i = cd.length - 1; i >= 0; i--) { if (cd[i] && cd[i].origin === PHYS_ORIGIN) { cd.splice(i, 1); n++; } }
        try { if (typeof renderCMA === 'function') renderCMA(); } catch (_) {}
        return { removed: n };
    }

    ROOT.PHYS_CROSSCHECK = { SCHEMA: 'phys-crosscheck-1', run: run, praFootprints: praFootprints, materialize: materialize, clearMaterialized: clearMaterialized };
})();

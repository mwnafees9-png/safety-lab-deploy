// ============================================================================
// idp_seed_trees.js — v1.0 — MF&MS tree seeds from the Interdependence table
// (23 Aug 2026, Waqas's ruling: "Deterministic seed" for aircraft-level
// skeletons — new pages only, nothing existing touched).
//
// THE GAP THIS CLOSES: pass 1 of the ASA triage classifies every aircraft FC
// with ≥2 contributing systems (per the Interdependence table) as
// 'aircraft-level' — it needs an MF&MS tree. The MAC compiler builds those
// trees for FCs that have a MAC rule; an aircraft-level FC with NO rule and
// NO tree was a gap someone had to notice. Now the skeleton appears the
// moment the table says the FC is multi-system — same "computed seed"
// doctrine as the CRA's total-loss rows: it cannot be forgotten, only
// developed or superseded.
//
// WHAT A SEED IS:
//   · a top-down aircraft-level page, id 'idp-pg-<fcInternalId>' (stable),
//     top event = the FC, OR gate over the contributing systems;
//   · each contributing system with SFHA rows TRACED to this FC (acTrace)
//     contributes one basic event per traced row, carrying
//     externalSource {kind:'fha', targetId:'SYS_<rowId>'} — the same link
//     ASA pass 2 substitutes with the system's verified mirror value, so a
//     seed participates in the measured re-run from birth;
//   · a contributing system with no traced row yet gets an UNDEVELOPED
//     event naming the gap — honest, counted uncovered, never guessed.
//   · numbers are the user's: every probability seeds at 0.
//
// LIFECYCLE (deterministic, regeneration-stable, never destructive of work):
//   · fingerprint of the source facts (_idpFp: contributors + traced rows)
//     — unchanged facts → untouched page, re-runs are no-ops;
//   · facts changed + seed UNDEVELOPED by the user (root still matches its
//     birth shape, _idpRootFp) → regenerated in place;
//   · facts changed + user has BUILT on the seed → the work is never
//     rewritten: the page is flagged _idpStale with the reason;
//   · FC no longer multi-system: an untouched seed removes itself; a
//     developed one is kept and flagged — deleting work is not ours to do.
//   · an FC that already has an MF&MS page (MAC-compiled or hand-built,
//     per the same match the ASA triage uses) is never seeded.
//
// Sweeps are change-driven (see tick() below), not a blind timer.
// BORN MODULAR: new file, zero monolith edits. Kill switch:
// window.SL_IDP_SEED_OFF = true disables the sweep entirely.
// ============================================================================
(function () {
    'use strict';

    function _fcs() { return (typeof acFhaData !== 'undefined' && acFhaData) || []; }
    function _sys() { return (typeof systemsData !== 'undefined' && systemsData) || []; }
    function _pages() { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : null; }
    // ---- per-sweep context (23 Sep 2026, perf round 2) ------------------------
    // A sweep used to re-derive every FC's contributing systems from scratch and
    // scan the page list, the system list and each system's SFHA rows once per
    // FC. On a large project that was seconds per sweep, after EVERY edit. Now:
    //   · lookups are maps built once per sweep (_ctx);
    //   · the sweep runs inside one idpIndexBatch, where idpContributors
    //     remembers each FC's answer across sweeps (helpers_modules.js), so an
    //     edit to one FHA row re-derives that row only.
    // See tests/regression_perf_idp_sweep.test.js.
    var _ctx = null;
    function _contribs(fc) {
        try { return (typeof idpContributors === 'function') ? (idpContributors(fc) || []) : []; } catch (_) { return []; }
    }
    function _beginSweep() {
        var sys = _sys();
        var sysById = new Map();
        sys.forEach(function (x) { if (x && !sysById.has(x.id)) sysById.set(x.id, x); });
        var foreign = new Set();
        (_pages() || []).forEach(function (p) {
            if (!p || !p.root || String(p.id).indexOf('idp-pg-') === 0) return;
            if (!(String(p.id).indexOf('mac-pg-') === 0 || /MF&MS/.test(p.name || ''))) return;
            var lids = Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds : (p.linkedFhaId != null ? [p.linkedFhaId] : []);
            lids.forEach(function (l) { foreign.add(String(l)); });
        });
        _ctx = { sysById: sysById, traced: new Map(), foreign: foreign, pageIdx: null };
    }
    function _endSweep() { _ctx = null; }
    function _sysGet(id) {
        if (_ctx) return _ctx.sysById.get(id);
        return _sys().find(function (x) { return x && x.id === id; });
    }
    function _sysName(id) {
        var s = _sysGet(id);
        return s ? (s.name || String(id)) : String(id);
    }
    function _tracedRows(sysId, fc) {
        if (_ctx) {
            var byTrace = _ctx.traced.get(sysId);
            if (!byTrace) {
                byTrace = new Map();
                var s0 = _sysGet(sysId);
                ((s0 && s0.fha) || []).forEach(function (r) {
                    if (!(r && r.acTrace != null)) return;
                    var t = String(r.acTrace); var a = byTrace.get(t); if (!a) { a = []; byTrace.set(t, a); } a.push(r);
                });
                _ctx.traced.set(sysId, byTrace);
            }
            return (byTrace.get(String(fc.internalId)) || []).slice();
        }
        var s = _sysGet(sysId);
        return ((s && s.fha) || []).filter(function (r) {
            return r && r.acTrace != null && String(r.acTrace) === String(fc.internalId);
        });
    }
    function _pageIndex(pages, pid) {
        if (!_ctx) return pages.findIndex(function (p) { return p && p.id === pid; });
        if (!_ctx.pageIdx) {
            var m = new Map();
            pages.forEach(function (p, i) { if (p && !m.has(p.id)) m.set(p.id, i); });
            _ctx.pageIdx = m;
        }
        var i = _ctx.pageIdx.get(pid);
        return i == null ? -1 : i;
    }

    // Fingerprint of the SOURCE FACTS a seed is built from.
    function _idpFp(fc, contribs) {
        return contribs.slice().sort().map(function (sid) {
            return sid + ':' + _tracedRows(sid, fc).map(function (r) { return r.internalId; }).sort().join('.');
        }).join('|');
    }
    // Fingerprint of the STRUCTURE (ids excluded — they differ per generation;
    // names/links/λ included — touching any of them is development).
    var _SHAPE_KEYS = ['type', 'gateType', 'name', 'children', 'externalSource', 'kind', 'targetId', 'probability', 'lambda'];
    function _rootFp(root) {
        try { return JSON.stringify(root, _SHAPE_KEYS); } catch (_) { return ''; }
    }

    // The same MF&MS-page match the ASA triage uses — plus our own seeds.
    function _hasForeignMfms(fc) {
        if (_ctx) return _ctx.foreign.has(String(fc.internalId));
        return (_pages() || []).some(function (p) {
            if (!p || !p.root) return false;
            if (String(p.id).indexOf('idp-pg-') === 0) return false;
            var lids = Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds : (p.linkedFhaId != null ? [p.linkedFhaId] : []);
            if (lids.map(String).indexOf(String(fc.internalId)) === -1) return false;
            return String(p.id).indexOf('mac-pg-') === 0 || /MF&MS/.test(p.name || '');
        });
    }

    function _buildRoot(fc, contribs) {
        var kids = [];
        contribs.slice().sort().forEach(function (sid) {
            var rows = _tracedRows(sid, fc);
            if (rows.length) {
                rows.forEach(function (r) {
                    kids.push({
                        id: internalIdCounter++, logicalId: internalIdCounter,
                        displayId: '', name: _sysName(sid) + ' — ' + (r.fcDesc || r.fcId || ('SFHA #' + r.internalId)),
                        type: 'basic', probability: 0, lambda: 0, children: [],
                        externalSource: { kind: 'fha', targetId: 'SYS_' + r.internalId },
                        _idpProvenance: 'seeded'
                    });
                });
            } else {
                kids.push({
                    id: internalIdCounter++, logicalId: internalIdCounter,
                    displayId: '', name: 'Contribution — ' + _sysName(sid) + ' (no system FC traced to this condition yet)',
                    type: 'undeveloped', probability: 0, children: [],
                    _idpProvenance: 'seeded'
                });
            }
        });
        return {
            id: internalIdCounter++, logicalId: internalIdCounter,
            displayId: 'IDP-TOP',
            name: (fc.fcId ? fc.fcId + ' — ' : '') + (fc.fcDesc || fc.condition || fc.failureCondition || 'aircraft-level condition'),
            type: 'gate', gateType: 'OR', probability: 0, children: kids,
            _idpProvenance: 'seeded'
        };
    }

    function _seedPage(fc, contribs) {
        var root = _buildRoot(fc, contribs);
        return {
            id: 'idp-pg-' + fc.internalId,
            name: 'MF&MS · ' + (fc.fcId || ('#' + fc.internalId)) + ' — seeded',
            root: root, treeLevel: 'aircraft', mode: 'top-down',
            linkedFhaId: fc.internalId,
            generatedFrom: 'interdep',
            _idpFp: _idpFp(fc, contribs),
            _idpRootFp: _rootFp(root),
            missionProfileId: (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.missionProfileId) || ''
        };
    }

    // One deterministic sweep. Returns a summary (also what the suite drives).
    function run() {
        if (typeof window !== 'undefined' && window.SL_IDP_SEED_OFF) return { off: true };
        var pages = _pages();
        if (!pages) return { noStore: true };
        var seeded = 0, regenerated = 0, removed = 0, stale = 0, kept = 0;
        var live = {};
        _beginSweep();
        try {
        _fcs().forEach(function (fc) {
            if (!fc || fc.internalId == null) return;
            var contribs = _contribs(fc);
            var pid = 'idp-pg-' + fc.internalId;
            var idx = _pageIndex(pages, pid);
            var multi = contribs.length >= 2;
            if (multi) live[pid] = 1;
            if (multi && !_hasForeignMfms(fc)) {
                if (idx === -1) { pages.push(_seedPage(fc, contribs)); if (_ctx && _ctx.pageIdx) _ctx.pageIdx.set(pid, pages.length - 1); seeded++; return; }
                var pg = pages[idx];
                if (pg._idpFp === _idpFp(fc, contribs)) { delete pg._idpStale; kept++; return; }
                if (_rootFp(pg.root) === pg._idpRootFp) { pages[idx] = _seedPage(fc, contribs); regenerated++; return; }
                pg._idpStale = 'interdependence facts changed after this seed was developed — reconcile by hand';
                stale++;
                return;
            }
            // Not multi-system any more (or covered by a real MF&MS page).
            if (idx !== -1) {
                var p2 = pages[idx];
                if (_rootFp(p2.root) === p2._idpRootFp) { pages.splice(idx, 1); if (_ctx) _ctx.pageIdx = null; removed++; }
                else if (!multi) { p2._idpStale = 'condition is no longer multi-system per the interdependence table'; stale++; }
                else { p2._idpStale = 'a real MF&MS page now covers this condition'; stale++; }
            }
        });
        } finally { _endSweep(); }
        if (seeded || regenerated || removed) {
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            try { if (typeof renderFTASidebar === 'function') renderFTASidebar(); } catch (_) {}
        }
        return { seeded: seeded, regenerated: regenerated, removed: removed, stale: stale, kept: kept };
    }

    function status() {
        var pages = _pages() || [];
        var seeds = pages.filter(function (p) { return p && String(p.id).indexOf('idp-pg-') === 0; });
        return {
            seeds: seeds.length,
            stale: seeds.filter(function (p) { return p._idpStale; }).map(function (p) { return { id: p.id, reason: p._idpStale }; })
        };
    }

    // 23 Sep 2026 (perf) — CHANGE-DRIVEN SWEEP. The sweep used to run every 8 s
    // whether or not anything moved, re-deriving every FC x system cell; on a
    // large project that was a multi-second stall every 8 s. It now runs only
    // when the project data changed, per the shared detector in data_change.js
    // (an edit via scheduleAutosave, or a replaced store: load, sync, undo).
    // The generation is read AFTER the sweep, so the sweep's own save does not
    // trigger a re-run. Boot always sweeps. Without data_change.js (a test
    // sandbox) every tick sweeps, as before.
    // See tests/regression_perf_idp_sweep.test.js, tests/regression_data_change.test.js.
    var _seenGen = 0, _forced = true;
    function _dc() { return (typeof window !== 'undefined' && window.SLDataChange) || null; }
    function markDirty() { _forced = true; }
    function tick() {
        var dc = _dc();
        if (dc && !_forced && dc.gen() === _seenGen) return { skipped: true };
        _forced = false;
        try { return (typeof idpIndexBatch === 'function') ? idpIndexBatch(run) : run(); }
        finally { if (dc) _seenGen = dc.gen(); }
    }

    if (typeof window !== 'undefined') {
        window.SL_IDP = { run: run, status: status, tick: tick, markDirty: markDirty };
        var _tick = function () { try { tick(); } catch (_) {} };
        if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(_tick, 2500);
        else document.addEventListener('DOMContentLoaded', function () { setTimeout(_tick, 2500); });
        setInterval(_tick, 8000);
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { run: run, status: status, tick: tick, markDirty: markDirty };
})();

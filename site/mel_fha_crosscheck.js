// ============================================================================
// mel_fha_crosscheck.js — v1.0 — HF-2: MEL ↔ FHA credited-mitigation cross-check.
//
// THE HOLE. An FHA row classifies a failure condition for the aircraft AS ANALYSED.
// The fault tree under that row credits a set of protections — redundant channels,
// monitors, a de-icing system. If one of those protections is an item the MMEL
// permits to be dispatched inoperative, then THE DISPATCHED AIRCRAFT IS NOT THE
// AIRCRAFT WE CLASSIFIED, and the classification we published does not apply to the
// flight that actually departs. Nothing in the product connected those two lanes.
//
// VoePass 2283 (ATR 72-500 PS-VPB, Vinhedo, 9 Aug 2024, 62 fatalities — CENIPA final
// report) departed with ten MEL items open, the airframe de-icing system among them,
// into an area under an active SIGMET for severe icing. No safety analysis anywhere
// said "if de-icing is relieved, this failure condition re-classifies." That sentence
// is what this module produces.
//
// THE JOIN IS BY SHARED ID, NEVER BY STRING MATCHING. Censused 2 Sep 2026:
// projectConfig.mmel.items[] carry `beRef` — a fault-tree basic event (displayId /
// logicalId / id, resolved by the house _fmesFindBe). Trees carry linkedFhaIds, and
// _ramPageFcMap closes that link across TRANSFER gates. So MMEL item → basic event →
// every tree containing it → every FHA row those trees classify is a chain of ids the
// project already owns. An MMEL item whose beRef resolves to nothing is reported as
// UNLINKED in an advisory listing, never guessed at.
//
// WHAT "RELIEVABLE" MEANS HERE. The MMEL lane runs its own protection check
// (mmel_module._protection, exact minimal cut sets) and records the verdict on the
// item as `protection.ok`. An item that check REJECTS (order-1 protection, or a single
// failure left to a Catastrophic condition) is not dispatch-relievable — the lane
// already refuses to propose it — and produces no FHA finding. Every other analysed
// item is relievable under its rectification category, and that is the case that
// fell through the hole: the tree says the protection is adequate for dispatch, and
// the FHA classification silently assumes it is installed.
//
// THE ENGINE NEVER RE-CLASSIFIES. A finding here states the conflict. Whether the
// relieved configuration is Hazardous, or is covered by an (o) limitation, or means the
// item must come off the MMEL, is engineering judgment — the finding lands Open in the
// same review surface every other finding uses, and no FHA row is touched. The suite
// proves that by snapshotting every row before and after a run.
//
// BORN MODULAR: new file; reads projectConfig.mmel, ftaPages, acFhaData, systemsData
// through the house accessors; registers into the invariant sweep via invRegister and
// is read by the consistency findings. Zero edits to the MMEL, FTA or FHA modules.
// ============================================================================
(function () {
    'use strict';

    function _items() {
        try {
            var pc = (typeof projectConfig !== 'undefined') ? projectConfig : null;
            return (pc && pc.mmel && Array.isArray(pc.mmel.items)) ? pc.mmel.items : [];
        } catch (_) { return []; }
    }
    function _pages() { try { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; } catch (_) { return []; } }
    function _fhaById(iid) {
        try {
            var ac = (typeof acFhaData !== 'undefined' && Array.isArray(acFhaData)) ? acFhaData : [];
            var hit = ac.find(function (f) { return f && String(f.internalId) === String(iid); });
            if (hit) return { row: hit, scope: 'AFHA', systemId: null };
            var sys = (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : [];
            for (var i = 0; i < sys.length; i++) {
                var s = sys[i]; if (!s || !Array.isArray(s.fha)) continue;
                var h = s.fha.find(function (f) { return f && String(f.internalId) === String(iid); });
                if (h) return { row: h, scope: 'SFHA · ' + (s.name || s.id), systemId: s.id };
            }
        } catch (_) {}
        return null;
    }
    function _findBe(ref) {
        try { return (typeof _fmesFindBe === 'function') ? _fmesFindBe(ref) : null; } catch (_) { return null; }
    }
    function _pageFcMap() {
        try {
            if (typeof window !== 'undefined' && typeof window._ramPageFcMap === 'function') return window._ramPageFcMap();
        } catch (_) {}
        // Fallback without the RAM module: direct links only, no TRANSFER closure.
        var m = new Map();
        _pages().forEach(function (p) {
            var ids = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            m.set(String(p.id), new Set(ids.map(String)));
        });
        return m;
    }
    function _pagesContaining(node) {
        var out = [];
        _pages().forEach(function (p) {
            if (!p || !p.root) return;
            var found = false;
            (function walk(n, seen) {
                if (!n || found || seen.has(n.id)) return;
                seen.add(n.id);
                if (String(n.id) === String(node.id) || (n.logicalId != null && node.logicalId != null && String(n.logicalId) === String(node.logicalId))) { found = true; return; }
                (n.children || n._children || []).forEach(function (c) { walk(c, seen); });
            })(p.root, new Set());
            if (found) out.push(p);
        });
        return out;
    }
    function _relievable(it) {
        // The MMEL lane's own verdict governs. An item it has rejected is not relievable.
        if (it && it.protection && it.protection.ok === false) return false;
        return true;
    }

    // ------------------------------------------------------------- the check
    // Pure. Reads the project, returns a report, writes nothing.
    function run() {
        var items = _items();
        if (!items.length) {
            return { skipped: true, note: 'No MMEL items on file — the MEL ↔ FHA cross-check did not run. This is a skip, not a pass.',
                     findings: [], advisory: [], checked: 0 };
        }
        var pageFc = _pageFcMap();
        var findings = [], advisory = [], checked = 0;
        items.forEach(function (it) {
            if (!it) return;
            checked++;
            var ref = String(it.beRef || '').trim();
            var hit = ref ? _findBe(ref) : null;
            if (!hit) {
                // Unlinked: the question is named, not answered. An advisory that says
                // "which credited protections does this item touch?" is worth more than a
                // string match that answers it wrongly.
                advisory.push({ mmelId: it.id, title: it.title || '', beRef: ref,
                    text: (it.id || '?') + ' — ' + (it.title || 'untitled') + ': ' +
                        (ref ? ('linked basic event "' + ref + '" is not in any fault tree') : 'no linked basic event') +
                        '. Which credited protections does relieving this item touch? Link it to the basic event it disables.' });
                return;
            }
            if (!_relievable(it)) return;   // the MMEL lane already refuses this item
            var pages = _pagesContaining(hit.node);
            var seenFc = {};
            pages.forEach(function (p) {
                (pageFc.get(String(p.id)) || new Set()).forEach(function (iid) {
                    var key = String(iid) + '|' + String(it.id);
                    if (seenFc[key]) return; seenFc[key] = 1;
                    var fc = _fhaById(iid); if (!fc) return;
                    var sev = fc.row.severity || 'unclassified';
                    var cat = it.category || '?';
                    var days = (it.catDays != null) ? (' (' + it.catDays + ' days)') : '';
                    findings.push({
                        fcInternalId: fc.row.internalId, fcId: fc.row.fcId || ('#' + fc.row.internalId), severity: sev,
                        scope: fc.scope, systemId: fc.systemId, tree: p.name || p.id,
                        mmelId: it.id, mmelTitle: it.title || '', beRef: ref, category: cat, catDays: it.catDays,
                        text: (fc.row.fcId || ('#' + fc.row.internalId)) + ' [' + sev + ', ' + fc.scope + '] credits ' + ref +
                            (it.title ? (' (' + it.title + ')') : '') + ' on tree "' + (p.name || p.id) + '"; MMEL ' + (it.id || '?') +
                            ' permits it inoperative under Category ' + cat + days + '. Classification ' + sev +
                            ' is not valid for the relieved configuration.'
                    });
                });
            });
        });
        return { skipped: false, note: checked + ' MMEL item(s) checked against the trees and the FHA rows they classify.',
                 findings: findings, advisory: advisory, checked: checked };
    }

    // ---------------------------------------------------- the two surfaces
    // 1. The invariant sweep (Prove ▸ Invariants) — advisory severity: the engine states
    //    the conflict, the engineer decides what it means. A skip returns checked: 0 and
    //    a note, never a silent pass.
    function _register() {
        try {
            if (typeof window === 'undefined' || typeof window.invRegister !== 'function') return false;
            return window.invRegister({
                id: 'INV-MEL-FHA', sev: 'advisory',
                name: 'MMEL relief does not silently invalidate a credited FHA classification',
                run: function () {
                    var r = run();
                    return { checked: r.checked, fails: r.findings.map(function (f) { return f.text; }), note: r.note,
                             skipped: r.skipped, advisory: r.advisory.map(function (a) { return a.text; }) };
                }
            });
        } catch (_) { return false; }
    }
    if (typeof window !== 'undefined') {
        if (!_register()) {
            var tries = 40;
            var t = setInterval(function () { if (_register() || --tries <= 0) clearInterval(t); }, 250);
        }
    }
    // 2. The consistency findings (scorecard, auto-sweep, in-lane banners) read
    //    window.MelFhaCrossCheck.run() directly — see _aiConsistencyFindings.

    var API = { run: run, _relievable: _relievable, _pagesContaining: _pagesContaining, version: '1.0' };
    if (typeof window !== 'undefined') window.MelFhaCrossCheck = API;
    if (typeof module !== 'undefined') module.exports = API;
})();

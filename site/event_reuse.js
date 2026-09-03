// ============================================================================
// event_reuse.js — Phase 66.17
// ----------------------------------------------------------------------------
// "How do I know this event is being used elsewhere, and how do I become aware
//  an event already exists in the tool?"  — Franksley Paganini (Mannarino),
//  demo 18 Aug 2026, relayed by Waqas.
//
// WHAT EXISTED BEFORE THIS FILE
//   repeatedEventGroups() walks getActiveFTARoot() ONLY. So an event repeated
//   inside ONE tree got an amber ID, a hover tooltip and "common-mode ×N" in the
//   panel — but the same physical event used in ANOTHER system's tree produced
//   no signal of any kind. And addSelectedEvent() minted a fresh logicalId with
//   no lookup at all, so nothing ever told you the event you were about to type
//   already existed two trees over.
//
// WHAT THIS ADDS — three things, all read-only until the user chooses to act:
//   1. slEventIndex()      project-wide index: logicalId → every page it appears
//                          on, plus a normalised-name index for lookalikes.
//   2. slEventUsage(node)  "used in N other trees", with the list, for the badge
//                          and the panel line.
//   3. slConsumableHere()  the SCOPED menu (Waqas's ruling, 18 Aug: "we also need
//                          to provide a menu based off interdependence and that
//                          systems trees what can possibly be consumed here").
//                          Candidates are not "every event in the project" — they
//                          are the events belonging to the systems the
//                          INTERDEPENDENCE TABLE says contribute to this tree's
//                          failure condition, plus this system's own other trees.
//                          That is the set that can legitimately be consumed
//                          here; anything else is a different physical item.
//
// REUSE SEMANTICS — the important part, and it is deliberately narrow.
//   Adopting an existing event copies its IDENTITY (logicalId) and name, and
//   NOTHING ELSE. It does not copy the probability. Two instances of one physical
//   event must not carry two different numbers, and the engine already has the
//   rule for that: _propagateStrictestAcrossSharedEvents() takes the STRICTEST
//   (smallest) probability across every instance of a logicalId and applies it to
//   all of them, so the conservative tree wins by construction. Copying a number
//   here would fight that, and would be a number born in the UI.
// ============================================================================
(function () {
    'use strict';

    function _pages() { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; }
    function _lid(n) { return (n && n.logicalId != null) ? n.logicalId : (n ? n.id : null); }
    function _walk(node, fn) {
        (function rec(n, depth) {
            if (!n || depth > 400) return;
            fn(n);
            const kids = n.children || n._children;
            if (kids && kids.length) kids.forEach(function (k) { rec(k, depth + 1); });
        })(node, 0);
    }
    // Names are compared with punctuation, case and filler stripped, so
    // "EPS pump fails" and "EPS  pump  FAILS." are the same question.
    function slNormName(s) {
        return String(s == null ? '' : s).toLowerCase()
            .replace(/[^a-z0-9 ]+/g, ' ')
            .replace(/\b(the|a|an|of|to|in|on|for|is|are)\b/g, ' ')
            .replace(/\s+/g, ' ').trim();
    }

    // ---- 1 · the index ------------------------------------------------------
    function slEventIndex() {
        const byLid = new Map(), byName = new Map();
        _pages().forEach(function (page) {
            if (!page || !page.root) return;
            _walk(page.root, function (n) {
                if (!n || n.type === 'gate') return;          // events only; gates are structure
                const lid = _lid(n);
                if (lid == null) return;
                const entry = {
                    lid: lid, node: n, nodeId: n.id, name: n.name || '',
                    displayId: n.displayId || '', pageId: page.id, pageName: page.name || page.id,
                    treeLevel: page.treeLevel || '', systemId: page.systemId || '',
                    verifies: page.verifies || null
                };
                if (!byLid.has(lid)) byLid.set(lid, []);
                byLid.get(lid).push(entry);
                const nn = slNormName(n.name);
                if (nn) {
                    if (!byName.has(nn)) byName.set(nn, []);
                    byName.get(nn).push(entry);
                }
            });
        });
        return { byLid: byLid, byName: byName };
    }

    // ---- 2 · where else is THIS event used? ---------------------------------
    // Returns { count, here, elsewhere[] } where `elsewhere` lists the OTHER
    // pages carrying the same logicalId. A verification twin is reported
    // separately: it is the same event by design, not a common-mode finding.
    function slEventUsage(node, activePageId) {
        const out = { count: 0, here: 0, elsewhere: [], mirrors: [] };
        if (!node) return out;
        const lid = _lid(node);
        if (lid == null) return out;
        const idx = slEventIndex();
        const all = idx.byLid.get(lid) || [];
        out.count = all.length;
        const activeId = activePageId != null ? activePageId
            : (typeof activeFTAPageId !== 'undefined' ? activeFTAPageId : null);
        const activePage = _pages().find(function (p) { return p.id === activeId; }) || null;
        const twinOf = function (p) {
            if (!p || !activePage) return false;
            return (p.verifies && p.verifies === activePage.id) || (activePage.verifies && activePage.verifies === p.id);
        };
        all.forEach(function (e) {
            if (e.pageId === activeId) { out.here++; return; }
            const p = _pages().find(function (x) { return x.id === e.pageId; });
            if (twinOf(p)) out.mirrors.push(e); else out.elsewhere.push(e);
        });
        return out;
    }

    // ---- 3 · what can legitimately be consumed HERE? ------------------------
    // Scope, in priority order:
    //   1. this system's OTHER trees (same systemId)
    //   2. trees of the systems the interdependence table says contribute to the
    //      aircraft failure condition this tree is linked to
    //   3. the aircraft-level trees for those same failure conditions
    // Events already present in the active tree are excluded — you cannot consume
    // what you already have.
    function slConsumableHere(activePageId) {
        const pages = _pages();
        const activeId = activePageId != null ? activePageId
            : (typeof activeFTAPageId !== 'undefined' ? activeFTAPageId : null);
        const page = pages.find(function (p) { return p.id === activeId; });
        if (!page) return [];

        // systems that may contribute here
        const sysIds = new Set();
        if (page.systemId) sysIds.add(page.systemId);
        const fcIds = (page.linkedFhaIds || []).map(String);
        try {
            if (typeof idpContributors === 'function' && typeof acFhaData !== 'undefined') {
                (acFhaData || []).forEach(function (fc) {
                    const key = String(fc.internalId != null ? fc.internalId : fc.id);
                    if (!fcIds.length || fcIds.indexOf(key) >= 0) {
                        (idpContributors(fc) || []).forEach(function (sid) { sysIds.add(sid); });
                    }
                });
            }
        } catch (_) {}

        // logicalIds already in this tree
        const have = new Set();
        if (page.root) _walk(page.root, function (n) { const l = _lid(n); if (l != null) have.add(l); });

        const seen = new Set(), out = [];
        pages.forEach(function (p) {
            if (!p || !p.root || p.id === activeId) return;
            if (p.verifies && p.verifies === activeId) return;          // the twin is not a source
            const sameSystem = !!(page.systemId && p.systemId === page.systemId);
            const contributor = !!(p.systemId && sysIds.has(p.systemId));
            const aircraft = (p.treeLevel === 'aircraft');
            if (!sameSystem && !contributor && !aircraft) return;
            _walk(p.root, function (n) {
                if (!n || n.type === 'gate') return;
                const lid = _lid(n);
                if (lid == null || have.has(lid) || seen.has(lid)) return;
                seen.add(lid);
                out.push({
                    lid: lid, name: n.name || '(unnamed)', displayId: n.displayId || '',
                    pageId: p.id, pageName: p.name || p.id, systemId: p.systemId || '',
                    reason: sameSystem ? 'same system' : (contributor ? 'contributes per the interdependence table' : 'aircraft level')
                });
            });
        });
        // same system first, then interdependence contributors, then aircraft level
        const rank = { 'same system': 0, 'contributes per the interdependence table': 1, 'aircraft level': 2 };
        out.sort(function (a, b) {
            const r = rank[a.reason] - rank[b.reason];
            return r !== 0 ? r : String(a.name).localeCompare(String(b.name));
        });
        return out;
    }

    // ---- 4 · name lookalikes across every tree ------------------------------
    // Used for the inline suggestion under the name field. Exact normalised hit
    // first, then containment either way — deliberately conservative, because a
    // false "you already have this" is worse than silence.
    function slNameMatches(text, activePageId, limit) {
        const nn = slNormName(text);
        if (nn.length < 4) return [];
        const idx = slEventIndex();
        const activeId = activePageId != null ? activePageId
            : (typeof activeFTAPageId !== 'undefined' ? activeFTAPageId : null);
        const hits = [], seen = new Set();
        idx.byName.forEach(function (entries, key) {
            let score = 0;
            if (key === nn) score = 3;
            else if (key.indexOf(nn) >= 0 || nn.indexOf(key) >= 0) score = 2;
            if (!score) return;
            entries.forEach(function (e) {
                if (e.pageId === activeId) return;
                if (seen.has(e.lid)) return;
                seen.add(e.lid);
                hits.push({ score: score, lid: e.lid, name: e.name, displayId: e.displayId, pageId: e.pageId, pageName: e.pageName });
            });
        });
        hits.sort(function (a, b) { return b.score - a.score || String(a.name).localeCompare(String(b.name)); });
        return hits.slice(0, limit || 6);
    }

    // ---- 5 · adopt an existing event ---------------------------------------
    // IDENTITY ONLY. See the header: the probability is left to
    // _propagateStrictestAcrossSharedEvents, which already makes the strictest
    // instance win across every tree the event appears in.
    function slAdoptEvent(target, lid, name) {
        if (!target || lid == null) return false;
        target.logicalId = lid;
        if (name) target.name = name;
        return true;
    }

    // ========================================================================
    // 6 · STRICTEST-ACROSS-TREES ALLOCATION  (Phase 66.19)
    // ------------------------------------------------------------------------
    // Waqas's ruling, 19 Aug 2026, agreed line by line:
    //   "if a node is carrying a 1e-09 budget in one tree, but under an equal
    //    distribution model will get a 1e-06 for a less stricter tree, [it] should
    //    maintain its 1e-09 budget and loosen it for the other nodes."
    //
    // WHY THIS IS SOUND ENGINEERING, not just convenience: a shared event is ONE
    // physical item. It will be built to the most demanding requirement placed on it
    // anywhere on the aircraft. A tree that books a looser budget for that same item
    // is booking a budget the hardware will never use — and then over-constraining
    // its siblings to pay for it. Removing that double-conservatism is safe by
    // construction: the cap can only REDUCE a child below its natural apportionment,
    // so every top target still closes exactly as before.
    //
    // THE CURRENCY IS A RATE, NOT A PROBABILITY. What is invariant about a shared
    // event is its rate; P depends on the window it is exposed over. Verification
    // already works this way — one λ, re-derived into P per context. Allocation now
    // mirrors it: compare instances on their window-normalised rate equivalent
    // (-ln(1-P)/t, the "≈1.0E-9/FH" figure the canvas already prints), take the
    // strictest, then render each destination tree's own P from it. Transporting a
    // raw P instead would apply one tree's window to another tree's budget — for a
    // takeoff-phase FC at 0.05 h against a 3 h mission tree that is a 60x error.
    //
    // MIXED EXPOSURE MODES ARE FLAGGED, NEVER RESOLVED. If one instance is
    // continuous and another is latent on a test interval, their rate equivalents are
    // not like-for-like. The pass records a conflict for the engineer instead of
    // silently picking a winner — the same rule as an unreviewed interdependence cell.
    //
    // LIVE, NOT A RATCHET. Marks are cleared and recomputed on every pass, so
    // relaxing the strict tree lifts the cap and the loose trees re-tighten.
    //
    // KNOWN LIMIT, stated rather than hidden: exposure is read via
    // _nodeExposureTime(node, ftaConfig.exposureTime), so per-NODE modes (latent
    // dormancy, manual, active-phase) are honoured exactly, but a per-PAGE mission
    // profile is not re-resolved for pages other than the active one. Every Aeolus
    // tree is 3 h today, so this is future work, not a live defect.
    // ========================================================================
    function _instExposure(node) {
        try {
            if (typeof _nodeExposureTime === 'function') {
                const t = _nodeExposureTime(node, (typeof ftaConfig !== 'undefined' && ftaConfig && ftaConfig.exposureTime) || 1);
                if (isFinite(t) && t > 0) return t;
            }
        } catch (_) {}
        return (typeof ftaConfig !== 'undefined' && ftaConfig && ftaConfig.exposureTime) || 1;
    }
    function _rateOf(p, t) {
        if (!(p > 0) || !(p < 1) || !(t > 0)) return null;
        return -Math.log1p(-p) / t;
    }
    function _probOf(rate, t) {
        if (!(rate > 0) || !(t > 0)) return null;
        return -Math.expm1(-rate * t);
    }
    function _modeKey(n) {
        return (n && n.exposureMode ? n.exposureMode : 'continuous') + '/' + (n && n.repairModel ? n.repairModel : 'unmaintained');
    }

    // Clear every mark. Called at the start of a round so the pass can never ratchet.
    function slClearSharedStrictest() {
        _pages().forEach(function (page) {
            if (!page || !page.root) return;
            _walk(page.root, function (n) {
                if (n && n._sharedStrictest) delete n._sharedStrictest;
                if (n && n._sharedStrictestConflict) delete n._sharedStrictestConflict;
            });
        });
    }

    // Read the natural (uncapped) allocations and stamp caps on the looser instances.
    // Returns { capped, conflicts, groups } — `capped` is how many nodes were marked,
    // so the caller knows whether a re-allocation is worth running.
    function slSharedStrictestPass() {
        const out = { capped: 0, conflicts: 0, groups: [] };
        const byLid = new Map();
        _pages().forEach(function (page) {
            if (!page || !page.root || page.verifies) return;      // allocation pages only
            _walk(page.root, function (n) {
                if (!n || n.type === 'gate') return;
                const lid = _lid(n);
                if (lid == null) return;
                if (!byLid.has(lid)) byLid.set(lid, []);
                byLid.get(lid).push({ node: n, page: page });
            });
        });
        byLid.forEach(function (arr, lid) {
            if (arr.length < 2) return;
            const distinctPages = new Set(arr.map(function (e) { return e.page.id; }));
            if (distinctPages.size < 2) return;                    // repeats inside ONE tree are the existing common-mode case

            // mixed exposure models are not comparable — flag, do not resolve
            const modes = new Set(arr.map(function (e) { return _modeKey(e.node); }));
            if (modes.size > 1) {
                const detail = {
                    lid: lid, modes: Array.from(modes),
                    pages: arr.map(function (e) { return e.page.name || e.page.id; })
                };
                arr.forEach(function (e) { e.node._sharedStrictestConflict = detail; });
                out.conflicts++;
                return;
            }

            let best = null;
            arr.forEach(function (e) {
                const t = _instExposure(e.node);
                const r = _rateOf(e.node.probability, t);
                if (r == null) return;
                if (!best || r < best.rate) best = { rate: r, from: e.page, node: e.node };
            });
            if (!best) return;

            const group = { lid: lid, rate: best.rate, fromPageId: best.page ? best.page.id : null, marked: 0 };
            arr.forEach(function (e) {
                if (e.node === best.node) return;
                const t = _instExposure(e.node);
                const own = _rateOf(e.node.probability, t);
                if (own == null || !(own > best.rate * 1.0001)) return;   // already at or below the strictest
                const p = _probOf(best.rate, t);
                if (p == null || !(p > 0)) return;
                e.node._sharedStrictest = {
                    rate: best.rate,
                    prob: p,
                    naturalProb: e.node.probability,
                    fromPageId: best.from.id,
                    fromPageName: best.from.name || best.from.id,
                    instances: arr.length,
                    exposure: t
                };
                out.capped++; group.marked++;
            });
            if (group.marked) out.groups.push(group);
        });
        return out;
    }

    // What the allocator reads. Returns the capped probability for THIS instance,
    // in THIS tree's window, or null.
    function slSharedStrictestTarget(node) {
        const m = node && node._sharedStrictest;
        if (!m) return null;
        const p = (typeof m.prob === 'number' && isFinite(m.prob) && m.prob > 0) ? m.prob : null;
        return p;
    }

    // What the UI reads, for provenance.
    function slSharedStrictestInfo(node) {
        if (!node) return null;
        if (node._sharedStrictestConflict) return { conflict: node._sharedStrictestConflict };
        if (node._sharedStrictest) return { held: node._sharedStrictest };
        return null;
    }

    try {
        window.SLEventReuse = {
            index: slEventIndex,
            usage: slEventUsage,
            consumableHere: slConsumableHere,
            nameMatches: slNameMatches,
            adopt: slAdoptEvent,
            normName: slNormName,
            strictestPass: slSharedStrictestPass,
            clearStrictest: slClearSharedStrictest,
            strictestTarget: slSharedStrictestTarget,
            strictestInfo: slSharedStrictestInfo
        };
        window.slSharedStrictestPass = slSharedStrictestPass;
        window.slClearSharedStrictest = slClearSharedStrictest;
        window.slSharedStrictestTarget = slSharedStrictestTarget;
        window.slSharedStrictestInfo = slSharedStrictestInfo;
        window.slEventUsage = slEventUsage;
        window.slConsumableHere = slConsumableHere;
        window.slNameMatches = slNameMatches;
    } catch (_) {}
})();

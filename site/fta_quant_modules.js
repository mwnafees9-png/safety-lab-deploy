// fta_quant_modules.js — v1.0 — Phase P2 batch 1: FTA quantification math layer.
// MOVED VERBATIM from safety_lab.js (byte-exact; classic script, all names remain
// global exactly as before). Runtime-only pure function declarations — zero
// load-time code, zero behavior change. Contents:
//   - allocateTopDown / calcBottomUp / external-source staleness
//   - shared-event propagation + calculateAllProbabilities
//   - cutset engine wrappers (getCutsets, multiplyCutsets, ...)
//   - effectiveProb / repair models / DFT Monte Carlo / uncertainty display
// Verified: node --check, name-uniqueness sweep, DO-330 benchmark suite.
function allocateTopDown(node, target, strategy, visited) {
    // Phase 56.18c/d — external-source handling. When a node carries an
    // externalSource link, the inherited target P_ext is treated as a hard
    // value: we set node.probability to min(apportioned, P_ext). Then when we
    // recurse into the children of a gate, any child that is itself externally
    // constrained is given its inherited value VERBATIM, and the remaining
    // budget is redistributed across the FREE siblings using gate logic. The
    // result: siblings tighten when an external link is more conservative than
    // the natural apportionment, and loosen when it's less conservative —
    // automatically, so AutoReq picks up the right values.
    // Phase 56.38 — paste-origin snapshots use the same channel. The effective
    // external cap is the strictest of (externalSource, pasteOrigin), so a
    // cross-tree paste tightens siblings via the same rebalance logic.
    const apportionedTarget = target;
    // Phase 56.39d — Prescribed rate (gates only). Applied VERBATIM (not min'd
    // against apportionment). When over the parent's apportioned budget, we
    // still apply the prescribed value and flag _prescribedOverallocation so
    // the engineer is told the top-event budget is busted. Recursion into
    // children STOPS — the gate is treated as a leaf for top-down.
    let prescribed = null;
    try {
        if (typeof _getPrescribedTarget === 'function') prescribed = _getPrescribedTarget(node);
    } catch (e) { prescribed = null; }
    if (prescribed !== null && isFinite(prescribed)) {
        node.probability = prescribed;
        node._prescribedActive = true;
        if (apportionedTarget > 0 && apportionedTarget < prescribed * 0.9999) {
            node._prescribedOverallocation = {
                apportioned: apportionedTarget,
                prescribed:  prescribed,
                excessRatio: prescribed / apportionedTarget
            };
        } else {
            delete node._prescribedOverallocation;
        }
        // Phase 61 — allocation is probability-only. No λ is derived or stored on
        // allocation-tree nodes; λ is a verification-side (measured) quantity.
        delete node.lambda;
        return;  // do NOT apportion to children
    } else {
        delete node._prescribedActive;
        delete node._prescribedOverallocation;
    }
    let extTarget = null;
    try {
        let extSrc = null, paste = null;
        if (typeof _getExternalSourceTarget === 'function' && node.externalSource) {
            extSrc = _getExternalSourceTarget(node);
        }
        if (typeof _getPasteOriginTarget === 'function' && node._pasteOrigin) {
            paste = _getPasteOriginTarget(node);
        }
        if (extSrc !== null && paste !== null) extTarget = Math.min(extSrc, paste);
        else if (extSrc !== null) extTarget = extSrc;
        else if (paste !== null) extTarget = paste;
    } catch (e) { extTarget = null; }
    if (extTarget !== null && isFinite(extTarget)) {
        const effective = Math.min(apportionedTarget, extTarget);
        node.probability = effective;
        node._externalAllocation = {
            apportioned: apportionedTarget,
            external:    extTarget,
            effective:   effective,
            overrun:     apportionedTarget > extTarget * 1.0001,   // 0.01% tolerance
            headroom:    apportionedTarget < extTarget * 0.9999
        };
        target = effective;  // children apportion from the conservative budget
    } else {
        node.probability = target;
        if (node._externalAllocation) delete node._externalAllocation;
    }
    if (node.type !== 'gate') {
        // Phase 61 — allocation is PROBABILITY-ONLY. The leaf's allocated budget is
        // node.probability, full stop. No λ is derived here: converting P→λ requires
        // choosing a clock and a repair model (mission t? test interval τ? repair rate μ?),
        // which is verification-side physics, not allocation. The old unmaintained-formula
        // inversion silently under-required repairable/periodically-tested components
        // (λτ/2 ≫ 1−e^(−λt)). How a component achieves its P budget is demonstrated on the
        // verification tree, where its real λ + repair model live. Any stale λ from earlier
        // allocation runs is removed so no consumer can mistake it for a measured rate.
        delete node.lambda;
        return;
    }
    visited = visited || new Set();
    // Phase 53.43 — follow transfer boundaries so subtree roots inherit their seed from the
    // parent stub. The stub gate's allocated target IS the subtree root's seed; the subtree
    // then continues apportionment from there.
    if (node.gateType === 'TRANSFER' || node.transferOutTo) {
        const linkedId = node.transferOutTo || node.linkedPageId;
        if (linkedId && !visited.has(linkedId)) {
            visited.add(linkedId);
            const linked = ftaPages.find(p => p.id === linkedId);
            if (linked && linked.root) allocateTopDown(linked.root, target, strategy, visited);
        }
        return;
    }
    const actualChildren = node.children || node._children;
    if (!actualChildren || actualChildren.length === 0) return;

    // ------------------------------------------------------------------------
    // Phase 56.18d — pre-scan: classify children as constrained vs free.
    // Constrained children get their inherited target; free siblings absorb
    // the rebalanced remainder.
    // ------------------------------------------------------------------------
    // Phase 56.38 / 56.39d — child constraints. Prescribed wins verbatim
    // (engineer assertion); externalSource and pasteOrigin contribute via
    // conservative-merge (min). Free siblings absorb the remainder via the
    // existing AND/OR redistribute math.
    const childExt = actualChildren.map(c => {
        try {
            let extSrc = null, paste = null, prescr = null;
            if (typeof _getPrescribedTarget === 'function') {
                const pr = _getPrescribedTarget(c);
                if (pr !== null && isFinite(pr)) prescr = pr;
            }
            if (typeof _getExternalSourceTarget === 'function' && c.externalSource) {
                const ep = _getExternalSourceTarget(c);
                if (ep !== null && isFinite(ep)) extSrc = ep;
            }
            if (typeof _getPasteOriginTarget === 'function' && c._pasteOrigin) {
                const pp = _getPasteOriginTarget(c);
                if (pp !== null && isFinite(pp)) paste = pp;
            }
            if (prescr !== null) return prescr;  // verbatim — overrides min
            if (extSrc !== null && paste !== null) return Math.min(extSrc, paste);
            if (extSrc !== null) return extSrc;
            if (paste !== null) return paste;
        } catch (e) { /* fall through */ }
        return null;
    });
    const hasExtChild = childExt.some(e => e !== null);

    if (hasExtChild && (node.gateType === 'AND' || node.gateType === 'OR' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE')) {
        // ---------------- AND-family redistribute ----------------
        // p_top = Π p_i  =>  if some children fixed (p_ext), the free children
        // must satisfy  Π p_free = target / Π p_ext.
        // ---------------- OR redistribute ------------------------
        // p_top ≈ 1 - Π(1-p_i)  =>  Π(1-p_free) = (1-target) / Π(1-p_ext).
        const isAndFamily = (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE');
        let fixedFactor = 1;
        const freeChildren = [];
        const freeIdx = [];
        actualChildren.forEach((c, i) => {
            if (childExt[i] !== null) {
                if (isAndFamily) fixedFactor *= Math.max(1e-18, childExt[i]);
                else             fixedFactor *= Math.max(1e-18, (1 - childExt[i]));
            } else {
                freeChildren.push(c);
                freeIdx.push(i);
            }
        });
        let wSumFree = 0;
        freeChildren.forEach(c => wSumFree += (strategy === 'weighted' ? (c.weight || 1) : 1));
        let remaining;
        if (isAndFamily) {
            remaining = fixedFactor > 0 ? target / fixedFactor : 0;
            if (remaining > 1) remaining = 1;
        } else {
            remaining = fixedFactor > 0 ? (1 - target) / fixedFactor : 0;
            if (remaining < 0) remaining = 0;
            if (remaining > 1) remaining = 1;
        }
        actualChildren.forEach((child, i) => {
            if (childExt[i] !== null) {
                allocateTopDown(child, childExt[i], strategy, visited);
                return;
            }
            if (freeChildren.length === 0) return;
            const w = (strategy === 'weighted') ? (child.weight || 1) : 1;
            const ratio = wSumFree > 0 ? w / wSumFree : 0;
            let childTarget = 0;
            if (ratio > 0) {
                if (isAndFamily) {
                    childTarget = Math.pow(Math.max(0, Math.min(1, remaining)), ratio);
                } else {
                    childTarget = 1 - Math.pow(Math.max(0, Math.min(1, remaining)), ratio);
                }
            }
            if (!isFinite(childTarget) || childTarget < 0) childTarget = 0;
            if (childTarget > 1) childTarget = 1;
            allocateTopDown(child, childTarget, strategy, visited);
        });
        // Flag the gate so the canvas + AutoReq know this gate's children were
        // rebalanced because of an external constraint.
        node._externalRebalance = {
            constrainedCount: actualChildren.length - freeChildren.length,
            freeCount: freeChildren.length,
            mode: isAndFamily ? 'AND' : 'OR'
        };
        return;
    }

    // No external constraints among children (or gate type doesn't have a clean
    // redistribute recipe) — original logic.
    if (node._externalRebalance) delete node._externalRebalance;
    let wSum = 0;
    actualChildren.forEach(c => wSum += (strategy === 'weighted' ? (c.weight || 1) : 1));
    // Phase 45 — VOTING gates use the K-of-N binomial inverse so a top-down + bottom-up
    // round-trip closes the loop. For rare events P_top ≈ C(N,K) × p_child^K, so
    // p_child = (P_top / C(N,K))^(1/K). Weighted apportionment for VOTING is treated as
    // equal apportionment because the binomial tail doesn't have a clean per-child weight
    // axis — the BE weights still drive AND/OR distribution elsewhere in the tree.
    let votingChildP = null;
    if (node.gateType === 'VOTING') {
        const N = actualChildren.length;
        const k = Math.max(1, Math.min(node.votingK || 2, N));
        let binom = 1;
        for (let i = 0; i < k; i++) binom = binom * (N - i) / (i + 1);
        votingChildP = Math.pow(Math.max(0, target / binom), 1 / k);
        if (!isFinite(votingChildP) || votingChildP < 0) votingChildP = 0;
        if (votingChildP > 1) votingChildP = 1;
    }
    actualChildren.forEach(child => {
        const w = (strategy === 'weighted') ? (child.weight || 1) : 1;
        const ratio = wSum > 0 ? w / wSum : 0;
        let childTarget = 0;
        if (ratio > 0) {
            if (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE') {
                // Phase 61 (F2 fix) — INHIBIT/PAND/SPARE reconstruct bottom-up as a PRODUCT
                // (their static-equivalent is AND), so the correct inverse is the geometric
                // split: Π childTarget_i = target. The old linear fallback (target·ratio)
                // reconstructed to (target/n)^n — millions of times tighter than required.
                // This also matches the external-constraint branch above, which already
                // treats these gates as AND-family.
                childTarget = Math.pow(target, ratio);
            } else if (node.gateType === 'OR') {
                childTarget = 1 - Math.pow(1 - target, ratio);
            } else if (node.gateType === 'VOTING') {
                childTarget = votingChildP;
            } else {
                childTarget = target * ratio;   // XOR — Σ pᵢ·Π(1−pⱼ) ≈ Σ pᵢ; linear split closes to <0.1% at cert magnitudes
            }
        }
        allocateTopDown(child, childTarget, strategy, visited);
    });
}

function calcBottomUp(node, visited = new Set()) {
    if (!node) return 0;
    if (visited.has(node.id)) return node.probability || 0;
    visited.add(node.id);
    if (node.type !== 'gate') {
        // Phase 61 — a leaf with no rate data (no λ, no Markov model) holds an allocated
        // probability BUDGET (or a directly-set value, e.g. a house event); that stored
        // probability is authoritative and must not be wiped by the λ→P conversion.
        // Leaves with real rate data (verification trees) compute P from λ + repair model.
        const _lamEff = (typeof getEffectiveLambda === 'function') ? (getEffectiveLambda(node) || 0) : (node.lambda || 0);
        if (!(_lamEff > 0) && !node.markovModelId) { node.probability = node.probability || 0; return node.probability; }
        node.probability = effectiveProb(node, ftaConfig.exposureTime); return node.probability;
    }
    // Phase 56.39d — Prescribed gate: value is engineer-asserted. Children
    // still calc bottom-up so divergence can be surfaced for DER review.
    if (typeof _getPrescribedTarget === 'function') {
        const pr = _getPrescribedTarget(node);
        if (pr !== null && isFinite(pr)) {
            const kids = node.children || node._children;
            if (kids && kids.length) {
                const childProbs = kids.map(c => calcBottomUp(c, visited));
                let childImplied = 0;
                if (node.gateType === 'OR') childImplied = 1 - childProbs.reduce((a, b) => a * (1 - b), 1);
                else if (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE') childImplied = childProbs.reduce((a, b) => a * b, 1);
                else childImplied = childProbs.reduce((a, b) => Math.max(a, b), 0);
                node._prescribedDivergence = (childImplied > 0 && Math.abs(Math.log10(childImplied / pr)) > 0.3)
                    ? { childImplied: childImplied, prescribed: pr, decadeDelta: Math.log10(childImplied / pr) }
                    : null;
            } else {
                delete node._prescribedDivergence;
            }
            node.probability = pr;
            return pr;
        }
    }
    // Pure TRANSFER and logical-gate-with-transferOutTo both resolve to a linked page's root.
    if (node.gateType === 'TRANSFER' || node.transferOutTo) {
        const linkedId = node.transferOutTo || node.linkedPageId;
        if (linkedId) {
            const linkedPage = ftaPages.find(p => p.id === linkedId);
            if (linkedPage && linkedPage.root) { node.probability = calcBottomUp(linkedPage.root, visited); return node.probability; }
        }
        if (node.gateType === 'TRANSFER') { node.probability = 0; return 0; }
        // For a transfer-out logical gate with a missing destination, fall through to use its own (empty) children.
    }
    const actualChildren = node.children || node._children;
    if (!actualChildren || actualChildren.length === 0) return 0;
    const probs = actualChildren.map(c => calcBottomUp(c, visited));
    // PAND and SPARE static-equivalent ≈ AND (the time-ordered constraint is conservative for static math).
    if (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE') node.probability = probs.reduce((a, b) => a * b, 1);
    // FDEP gates don't contribute to top probability directly — they only modify dependents (handled via DFT Monte Carlo).
    else if (node.gateType === 'FDEP') node.probability = 0;
    else if (node.gateType === 'OR') node.probability = 1 - probs.reduce((a, b) => a * (1 - b), 1);
    else if (node.gateType === 'VOTING' || node.gateType === 'XOR') {
        const dp = new Array(probs.length + 1).fill(0); dp[0] = 1.0;
        for (const p of probs) {
            for (let i = probs.length; i >= 1; i--) dp[i] = dp[i] * (1 - p) + dp[i - 1] * p;
            dp[0] = dp[0] * (1 - p);
        }
        if (node.gateType === 'XOR') node.probability = dp[1];
        else { const k = Math.min(node.votingK || 2, probs.length); let sum = 0; for (let i = k; i <= probs.length; i++) sum += dp[i]; node.probability = sum; }  /* Phase 44 — default K=2 (not 1, which would degrade VOTING to OR). */
    }
    return node.probability;
}

// Phase 56.18c — after allocateTopDown applies external caps to constrained
// leaves, walk the tree bottom-up to compute the effective gate probability
// given those caps. When a gate's effective probability diverges from its
// apportioned target (by more than 0.1%), we record `_budgetMismatch` on the
// gate so the canvas + AutoReq can flag it. Sibling allocations are NOT
// loosened — the gate becomes more conservative than required, which the
// downstream code surfaces as `conservative: true`.
// Phase 56.18b — per-node stale detection for externally-sourced events. Walk
// every fault tree page, find nodes with externalSource + _inheritedAt
// snapshots, compare current inherited target to the snapshot value, and set
// _externalSourceStale = true when the source has drifted by more than 0.1%.
// User can dismiss by clicking the canvas badge (sets _inheritOverride = true),
// which prevents future auto-resync.
function _checkExternalSourceStaleness() {
    if (typeof ftaPages === 'undefined' || !Array.isArray(ftaPages)) return;
    if (typeof _getExternalSourceTarget !== 'function') return;
    function walk(node) {
        if (!node) return;
        if (node.externalSource && node._inheritedAt && !node._inheritOverride) {
            try {
                const currentP = _getExternalSourceTarget(node);
                const snapP = node._inheritedAt.probability;
                if (currentP !== null && isFinite(currentP) && isFinite(snapP) && snapP > 0) {
                    const ratio = Math.abs(currentP - snapP) / Math.max(snapP, 1e-18);
                    if (ratio > 0.001) {
                        node._externalSourceStale = {
                            snapshot: snapP,
                            current: currentP,
                            driftRatio: ratio,
                            detectedAt: new Date().toISOString()
                        };
                    } else if (node._externalSourceStale) {
                        delete node._externalSourceStale;
                    }
                }
            } catch (e) { /* swallow */ }
        }
        const kids = node.children || node._children || [];
        kids.forEach(walk);
    }
    ftaPages.forEach(p => { if (p && p.root) walk(p.root); });
}

function _propagateStrictestAcrossSharedEvents(rootNode) {
    if (!rootNode) return;
    const buckets = new Map();   // lid → [node, node, ...]
    const visited = new Set();
    (function gather(n) {
        if (!n) return;
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !visited.has(linkedId)) {
                visited.add(linkedId);
                const linkedPage = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === linkedId) : null;
                if (linkedPage && linkedPage.root) gather(linkedPage.root);
            }
            return;
        }
        if (n.type !== 'gate') {
            const lid = n.logicalId != null ? n.logicalId : n.id;
            const arr = buckets.get(lid) || [];
            arr.push(n);
            buckets.set(lid, arr);
        }
        const kids = n.children || n._children;
        if (kids) kids.forEach(gather);
    })(rootNode);
    let touched = 0;
    buckets.forEach((arr) => {
        if (arr.length < 2) return;
        let strict = Infinity;
        arr.forEach(n => {
            const p = (typeof n.probability === 'number' && isFinite(n.probability)) ? n.probability : Infinity;
            if (p < strict) strict = p;
        });
        if (!isFinite(strict)) return;
        arr.forEach(n => {
            n.probability = strict;
            delete n.lambda;   // Phase 61 — allocation is probability-only (this path runs in top-down mode only)
            touched++;
        });
    });
    return touched;
}

function calculateAllProbabilities() {
    if (ftaConfig.mode === 'top-down') {
        // Phase 53.43 — apportion from the TRUE ROOT of the transfer chain so subtree roots
        // inherit their seed from the parent stub. allocateTopDown follows transferOutTo.
        const rootPage = (typeof getRootAncestorPageOfActive === 'function')
            ? getRootAncestorPageOfActive() : ftaPages.find(p => p.id === activeFTAPageId);
        if (rootPage && rootPage.root) {
            // Phase 32a — when a phase-restricted FHA is linked, the probability the allocator
            // distributes is the operational rate × exposure window (which equals the headline
            // averaged rate × total mission hours). This gives BE leaves the correct
            // operational-rate headroom for hazards that only matter during specific phases.
            const tc = _computeTopAllocatorContext();
            allocateTopDown(rootPage.root, tc.topProbAtExposure, ftaConfig.apportion, new Set());
            // Phase 56.18c — recompute gate effective probabilities with caps.
            _recomputeEffectiveWithExternalCaps(rootPage.root);
            // Phase 56.43 — MCS-aware rebalance when shared events present.
            // Bisects a uniform scale factor on the unique-variable rates so
            // BDD-exact reconstructs to the engineer's target. Replaces the
            // naive "divide evenly" with a Boolean-reduction-aware allocation.
            // Falls back to Phase 56.41 strictest-propagation when BDD isn't
            // available (computeExactProbability undefined).
            let rebalanced = false;
            if (typeof _hasRepeatedLogicalIds === 'function'
                && _hasRepeatedLogicalIds(rootPage.root)
                && typeof mcsAwareRebalance === 'function'
                && typeof computeExactProbability === 'function') {
                rebalanced = mcsAwareRebalance(rootPage.root, tc.topProbAtExposure);
                // Phase 56.46 — After uniform-scale rebalance closes the budget,
                // redistribute by Birnbaum importance so dominant cutset members
                // carry tighter rates while marginal contributors relax. Skips
                // for trees with >30 unique variables (latency guard).
                if (rebalanced && typeof mcsAwareImportanceRedistribute === 'function') {
                    mcsAwareImportanceRedistribute(rootPage.root, tc.topProbAtExposure);
                }
            }
            if (!rebalanced) {
                const touched = _propagateStrictestAcrossSharedEvents(rootPage.root);
                if (touched > 0) {
                    ftaPages.forEach(page => { if (page.root) calcBottomUp(page.root, new Set()); });
                }
            } else {
                // mcsAwareRebalance already set every leaf probability + lambda.
                // Re-run bottom-up across all pages so intermediate gate
                // probabilities reflect the rebalanced leaves. CAVEAT: bottom-up
                // is naive at the root (assumes children independent), so it
                // would overwrite root.probability with the wrong number when
                // shared events are present. Save the engineer's target and
                // restore it after — the BDD-exact override (further down) will
                // surface the true reconstruction on _bddActualProb.
                const targetTop = tc.topProbAtExposure;
                ftaPages.forEach(page => { if (page.root) calcBottomUp(page.root, new Set()); });
                if (typeof targetTop === 'number' && isFinite(targetTop)) {
                    rootPage.root.probability = targetTop;
                    delete rootPage.root.lambda;   // Phase 61 — allocation trees are probability-only
                }
            }
        }
    } else {
        // Bottom-up: calcBottomUp already flattens through transferOutTo, so computing each
        // page's root catches every node (transfer-only pages get computed when reached by
        // the parent's recursion).
        ftaPages.forEach(page => { if (page.root) calcBottomUp(page.root, new Set()); });
    }
    // Phase 56.41 / 56.42 — On the ACTIVE page, if shared logicalIds exist,
    // compute BDD-exact and surface it neutrally.
    //
    //   TOP-DOWN: TOP target is the engineer-set budget — preserve it.
    //             Store BDD-exact reconstruction on root._bddActualProb so the
    //             canvas can render Target / Actual side-by-side. The tool
    //             shows numbers, not judgments — the engineer decides whether
    //             the divergence is acceptable.
    //   BOTTOM-UP: TOP has no engineer-set target — replace root.probability
    //              with BDD-exact so the canvas shows the correct, cert-
    //              defensible value instead of the naive independent calc.
    try {
        const activePage = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === activeFTAPageId) : null;
        if (activePage && activePage.root && typeof computeExactProbability === 'function') {
            if (_hasRepeatedLogicalIds(activePage.root)) {
                _flagGatesWithSharedSubtreeEvents(activePage.root);
                // Phase 56.44 — Normalize every intermediate gate whose subtree
                // contains shared events. Each such gate's displayed probability
                // becomes its BDD-exact subtree reconstruction (not the naive
                // bottom-up multiplication). Runs BEFORE the root-level
                // computeExactProbability so the root sees corrected children.
                if (typeof _normalizeIntermediateGatesForSharedEvents === 'function') {
                    _normalizeIntermediateGatesForSharedEvents(activePage.root);
                }
                const exact = computeExactProbability(activePage.root);
                if (exact && typeof exact.prob === 'number' && isFinite(exact.prob)) {
                    const t = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) ? ftaConfig.exposureTime : 1;
                    const exactLambda = (exact.prob > 0 && exact.prob < 1) ? (-Math.log1p(-exact.prob) / t) : 0;
                    if (ftaConfig.mode === 'top-down') {
                        // Preserve engineer's TOP target. Surface actual alongside.
                        // Phase 61 — probability-only in allocation mode; no λ-equivalent stored.
                        activePage.root._bddActualProb   = exact.prob;
                        activePage.root._bddTargetProb   = activePage.root.probability;
                        delete activePage.root._bddActualLambda;
                    } else {
                        // Bottom-up: replace TOP with the cert-defensible exact value.
                        activePage.root._bddExactProb     = exact.prob;
                        activePage.root._bddBottomUpProb  = activePage.root.probability;
                        activePage.root.probability       = exact.prob;
                        activePage.root.lambda            = exactLambda;
                        // Clean any leftover top-down markers.
                        delete activePage.root._bddActualProb;
                        delete activePage.root._bddActualLambda;
                        delete activePage.root._bddTargetProb;
                    }
                }
            } else {
                // No shared events — clean up any stale markers from a prior
                // state and let the canvas render the standard λ / P line.
                delete activePage.root._bddExactProb;
                delete activePage.root._bddBottomUpProb;
                delete activePage.root._bddActualProb;
                delete activePage.root._bddActualLambda;
                delete activePage.root._bddTargetProb;
            }
        }
    } catch (e) { /* BDD optional — fall back silently */ }
    // Phase 53.43 — reactively propagate DAL allocation from the true root after every change.
    if (typeof propagateDalFromTrueRoot === 'function') propagateDalFromTrueRoot();
    // Phase 56.18b — sweep externally-linked events for staleness vs the snapshot.
    if (typeof _checkExternalSourceStaleness === 'function') _checkExternalSourceStaleness();
    // Phase 56.45 — sweep leaves for physical-feasibility violations
    // (allocated > achievable). Tags node._feasibilityViolation on violators.
    if (typeof _checkLeafFeasibility === 'function') {
        const activePage = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === activeFTAPageId) : null;
        if (activePage && activePage.root) _checkLeafFeasibility(activePage.root);
    }
}

// [OPT-1] getCombinations — deduped; single source: fta_engine.js (publishes identical global).
// Key cutset elements by logicalId so repeated events (same event in multiple branches)
// dedupe into a single occurrence in the AND-product result.
// [OPT-1] _eventKey — deduped; single source: fta_engine.js.
// [OPT-1] multiplyCutsets — deduped; single source: fta_engine.js.

// [OPT-1] getCutsets — deduped; single source: fta_engine.js (code-identical, verified 2026-07-05).
// NOTE: buildBDDFromFT / computeExactProbability / computeImportanceMeasures / _probMapFor /
// _bddCombinations remain here DELIBERATELY: they must bind to the page BDD instance from
// engine_modules.js — mixing BDD node graphs across instances breaks terminal identity.

// ==========================================
// PHASE 3E — BINARY DECISION DIAGRAMS
// Bryant-style reduced-ordered BDD for exact fault-tree quantification.
//   • Repeated events (same logicalId in multiple branches) map to a single BDD variable, so
//     P(top) is exact under common-mode coupling — no rare-event approximation needed.
//   • Importance measures (Birnbaum, Fussell-Vesely) fall out of cofactoring via probMap twiddles.
// ==========================================
// BDD — extracted to engine_modules.js (Phase 76; byte-identical, loaded after this file).

// Helper for VOTING gates — k-of-n via combinations.
function _bddCombinations(items, r) {
    const out = [];
    (function pick(start, current) {
        if (current.length === r) { out.push([...current]); return; }
        for (let i = start; i < items.length; i++) { current.push(items[i]); pick(i + 1, current); current.pop(); }
    })(0, []);
    return out;
}

// Build a BDD from a fault tree root. Returns { bdd, varOrder, lidToVar, varMeta, ccfGroupToVar }.
// varOrder is the full list of representative nodes — one entry per BDD variable.
// varMeta annotates each variable as either an 'indep' (independent failure of a basic event)
// or a 'group' (common-cause failure event shared by every basic event in the named CCF group).
// For an event in CCF group G with parameters β/γ/δ, its BDD leaf becomes:
//     v_indep  ∨  v_group2of  ∨  v_group3of  ∨  v_group4of
// and the probability assignments split the total q across the tiers:
//     P(v_indep)   = q · (1 − β)
//     P(v_group2)  = q · β · (1 − γ)
//     P(v_group3)  = q · β · γ · (1 − δ)
//     P(v_group4)  = q · β · γ · δ
// This makes BDD exact P(top) consistent with the CCF-decomposed cutset paths.
function buildBDDFromFT(rootNode) {
    BDD.reset();
    if (!rootNode) return { bdd: BDD.T0, varOrder: [], lidToVar: new Map(), varMeta: [], ccfGroupToVar: new Map() };
    const varOrder = [];
    const varMeta  = [];
    const lidToVar = new Map();
    // ccfGroupToVar.get(group) → { v2, v3, v4 } — variable indices for the 2/3/4-of-n CCF tiers.
    const ccfGroupToVar = new Map();
    function ensureGroupVars(refNode) {
        const g = refNode.ccfGroup;
        if (!g) return null;
        const beta  = refNode.beta  || 0;
        const gamma = refNode.gamma || 0;
        const delta = refNode.delta || 0;
        if (beta <= 0) return null;
        let entry = ccfGroupToVar.get(g);
        if (entry) return entry;
        entry = {};
        entry.v2 = varOrder.length; varOrder.push(refNode); varMeta.push({ type: 'group', tier: 2, group: g, refNode });
        if (gamma > 0) { entry.v3 = varOrder.length; varOrder.push(refNode); varMeta.push({ type: 'group', tier: 3, group: g, refNode }); }
        if (gamma > 0 && delta > 0) { entry.v4 = varOrder.length; varOrder.push(refNode); varMeta.push({ type: 'group', tier: 4, group: g, refNode }); }
        ccfGroupToVar.set(g, entry);
        return entry;
    }
    // Pass 1 — collect logicalIds + CCF group representatives in DFS order.
    (function collect(node, visitedNodes, visitedPages) {
        if (!node) return;
        if (visitedNodes.has(node.id)) return;
        visitedNodes.add(node.id);
        if (node.type !== 'gate') {
            const lid = node.logicalId != null ? node.logicalId : node.id;
            if (!lidToVar.has(lid)) {
                lidToVar.set(lid, varOrder.length);
                varOrder.push(node);
                varMeta.push({ type: 'indep', node });
                // Allocate group vars on first encounter of any CCF member of that group.
                ensureGroupVars(node);
            }
            return;
        }
        if (node.gateType === 'TRANSFER' || node.transferOutTo) {
            const linkedId = node.transferOutTo || node.linkedPageId;
            if (linkedId && !visitedPages.has(linkedId)) {
                visitedPages.add(linkedId);
                const page = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages.find(p => p.id === linkedId) : null;
                if (page && page.root) collect(page.root, visitedNodes, visitedPages);
            }
            return;
        }
        const kids = node.children || node._children;
        if (kids) kids.forEach(c => collect(c, visitedNodes, visitedPages));
    })(rootNode, new Set(), new Set());

    // Pass 2 — recursive BDD build. The pageCache memoizes a destination page's resolved BDD so
    // multiple TRANSFERs that all point at the same page don't rebuild it from scratch.
    const pageCache = new Map();
    function build(node, visitedPages) {
        if (!node) return BDD.T0;
        if (node.type !== 'gate') {
            const lid = node.logicalId != null ? node.logicalId : node.id;
            const v = lidToVar.get(lid);
            if (v == null) return BDD.T0;
            let result = BDD.variable(v);
            // OR in the CCF group tier variables so common-cause hits register on every group member.
            const groupVars = node.ccfGroup ? ccfGroupToVar.get(node.ccfGroup) : null;
            if (groupVars) {
                if (groupVars.v2 != null) result = BDD.apply('or', result, BDD.variable(groupVars.v2));
                if (groupVars.v3 != null) result = BDD.apply('or', result, BDD.variable(groupVars.v3));
                if (groupVars.v4 != null) result = BDD.apply('or', result, BDD.variable(groupVars.v4));
            }
            return result;
        }
        if (node.gateType === 'TRANSFER' || node.transferOutTo) {
            const linkedId = node.transferOutTo || node.linkedPageId;
            if (linkedId && !visitedPages.has(linkedId)) {
                if (pageCache.has(linkedId)) return pageCache.get(linkedId);
                const np = new Set(visitedPages); np.add(linkedId);
                const page = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages.find(p => p.id === linkedId) : null;
                if (page && page.root) {
                    const sub = build(page.root, np);
                    pageCache.set(linkedId, sub);
                    return sub;
                }
            }
            return BDD.T0;
        }
        const kids = node.children || node._children;
        if (!kids || kids.length === 0) return BDD.T0;
        const kidBdds = kids.map(c => build(c, visitedPages));
        if (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE') {
            // PAND and SPARE static-equivalent ≈ AND. For exact dynamic semantics, use DFT Monte Carlo.
            return kidBdds.reduce((acc, k) => BDD.apply('and', acc, k), BDD.T1);
        }
        if (node.gateType === 'FDEP') return BDD.T0; // modifier — contributes via dependents, not directly
        if (node.gateType === 'OR') {
            return kidBdds.reduce((acc, k) => BDD.apply('or', acc, k), BDD.T0);
        }
        if (node.gateType === 'XOR') {
            // "Exactly one input is true" — matches the legacy analytic-engine semantics.
            const n = kidBdds.length;
            let result = BDD.T0;
            for (let i = 0; i < n; i++) {
                let term = kidBdds[i];
                for (let j = 0; j < n; j++) if (j !== i) term = BDD.apply('and', term, BDD.not(kidBdds[j]));
                result = BDD.apply('or', result, term);
            }
            return result;
        }
        if (node.gateType === 'VOTING') {
            const k = Math.max(1, Math.min(node.votingK || 2, kidBdds.length));
            let result = BDD.T0;
            for (let size = k; size <= kidBdds.length; size++) {
                for (const subset of _bddCombinations(kidBdds, size)) {
                    const conj = subset.reduce((acc, b) => BDD.apply('and', acc, b), BDD.T1);
                    result = BDD.apply('or', result, conj);
                }
            }
            return result;
        }
        return BDD.T0;
    }
    const bdd = build(rootNode, new Set());
    return { bdd, varOrder, lidToVar, varMeta, ccfGroupToVar };
}

// BDD-derived minimal cutsets. For a monotone fault tree, every 1-path through the BDD is a
// cutset (positive literals only — the low branches contribute nothing). Subsumption keeps
// only minimal sets.
function bddCutsets(bdd, current, result) {
    current = current || [];
    result = result || [];
    if (bdd === BDD.T0) return result;
    if (bdd === BDD.T1) { result.push([...current]); return result; }
    // Low branch — variable is false; do not add it.
    bddCutsets(bdd.low, current, result);
    // High branch — variable is true; add it to the current cutset.
    current.push(bdd.varIdx);
    bddCutsets(bdd.high, current, result);
    current.pop();
    return result;
}
function _minimizeBDDCutsets(cutsets) {
    const sets = cutsets.map(c => new Set(c)).sort((a, b) => a.size - b.size);
    const min = [];
    for (const c of sets) {
        let subsumed = false;
        for (const m of min) {
            if (m.size > c.size) continue;
            let isSubset = true;
            for (const k of m) if (!c.has(k)) { isSubset = false; break; }
            if (isSubset) { subsumed = true; break; }
        }
        if (!subsumed) min.push(c);
    }
    return min.map(s => [...s]);
}
// Build BDD and return minimal cutsets as arrays of node references (not just varIdx).
function bddMinimalCutsets(rootNode) {
    const { bdd, varOrder } = buildBDDFromFT(rootNode);
    if (!bdd || bdd === BDD.T0) return [];
    const raw = bddCutsets(bdd);
    const minimal = _minimizeBDDCutsets(raw);
    return minimal.map(cs => cs.sort((a, b) => a - b).map(idx => varOrder[idx]));
}

// Build a probability map for the BDD's variables. For 'indep' vars the probability is
// q·(1−β) (independent failure share). For 'group' vars it is q·β·(1−γ) for tier 2,
// q·β·γ·(1−δ) for tier 3, q·β·γ·δ for tier 4. Falls back to plain q when varMeta isn't passed.
function _probMapFor(varOrder, varMeta) {
    const map = new Map();
    if (!varMeta || !varMeta.length) {
        varOrder.forEach((node, varIdx) => map.set(varIdx, node.probability || 0));
        return map;
    }
    varMeta.forEach((meta, varIdx) => {
        if (meta.type === 'indep') {
            const n = meta.node;
            const q = n.probability || 0;
            const b = (n.ccfGroup && n.beta > 0) ? n.beta : 0;
            map.set(varIdx, q * (1 - b));
        } else if (meta.type === 'group') {
            const r = meta.refNode;
            const q = r.probability || 0;
            const beta  = r.beta  || 0;
            const gamma = r.gamma || 0;
            const delta = r.delta || 0;
            let p = 0;
            if (meta.tier === 2) p = q * beta * (1 - gamma);
            else if (meta.tier === 3) p = q * beta * gamma * (1 - delta);
            else if (meta.tier === 4) p = q * beta * gamma * delta;
            map.set(varIdx, p);
        }
    });
    return map;
}

function computeExactProbability(rootNode) {
    const built = buildBDDFromFT(rootNode);
    const probMap = _probMapFor(built.varOrder, built.varMeta);
    const prob = BDD.probability(built.bdd, probMap);
    return { prob, bdd: built.bdd, varOrder: built.varOrder, lidToVar: built.lidToVar, varMeta: built.varMeta, probMap, bddSize: BDD.size(built.bdd) };
}

// Top-level wrappers invoked by the toolbar buttons. They render results into the dedicated
// summary divs without disturbing the main cutset summary.
// Monte-Carlo simulator for Dynamic Fault Trees. Per trial:
//   1. Sample failure time t_i ~ Exponential(λ_i) for each unique logicalId (repeated events share).
//   2. Apply FDEP modifications: trigger fail → dependent events fail at trigger time.
//   3. Evaluate the tree recursively with time-ordered semantics for PAND / SPARE.
// Returns the empirical P(top fails by mission time T).
function simulateDFT(rootNode, missionTime, N) {
    N = N || 20000;
    if (!rootNode) return { p: 0, stderr: 0, N: 0, dynGateCount: 0 };
    const eventMap = new Map(); // logicalId → representative node (for λ lookups)
    let dynGateCount = 0;
    const fdepGates = [];
    (function walk(n, visited) {
        if (!n || visited.has(n.id)) return;
        visited.add(n.id);
        if (n.type === 'gate') {
            if (n.gateType === 'PAND' || n.gateType === 'SPARE' || n.gateType === 'FDEP') dynGateCount++;
            if (n.gateType === 'FDEP') fdepGates.push(n);
            if (n.gateType === 'TRANSFER' || n.transferOutTo) {
                const linkedId = n.transferOutTo || n.linkedPageId;
                if (linkedId) {
                    const page = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages.find(p => p.id === linkedId) : null;
                    if (page && page.root) walk(page.root, visited);
                }
                return;
            }
            const kids = n.children || n._children;
            if (kids) kids.forEach(c => walk(c, visited));
        } else {
            const lid = n.logicalId != null ? n.logicalId : n.id;
            if (!eventMap.has(lid)) eventMap.set(lid, n);
        }
    })(rootNode, new Set());

    // Evaluate the gate's "fail time" given a snapshot of basic-event failure times.
    // Returns Infinity if the gate does not fail within finite time given the sample.
    function evalGate(node, failTimes, visited) {
        if (!node) return Infinity;
        if (visited.has(node.id)) return Infinity;
        visited = new Set(visited); visited.add(node.id);
        if (node.type !== 'gate') {
            const lid = node.logicalId != null ? node.logicalId : node.id;
            const t = failTimes.get(lid);
            return t != null ? t : Infinity;
        }
        if (node.gateType === 'TRANSFER' || node.transferOutTo) {
            const linkedId = node.transferOutTo || node.linkedPageId;
            if (linkedId) {
                const page = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages.find(p => p.id === linkedId) : null;
                if (page && page.root) return evalGate(page.root, failTimes, visited);
            }
            return Infinity;
        }
        const kids = node.children || node._children;
        if (!kids || !kids.length) return Infinity;
        if (node.gateType === 'AND' || node.gateType === 'INHIBIT')
            return Math.max(...kids.map(c => evalGate(c, failTimes, visited)));
        if (node.gateType === 'OR')
            return Math.min(...kids.map(c => evalGate(c, failTimes, visited)));
        if (node.gateType === 'PAND') {
            // Time-ordered AND: all kids must fail AND in declared order kids[0] → kids[1] → ...
            const times = kids.map(c => evalGate(c, failTimes, visited));
            for (let i = 1; i < times.length; i++) if (!(times[i - 1] < times[i])) return Infinity;
            return times[times.length - 1];
        }
        if (node.gateType === 'SPARE') {
            // Cold spare model: first child is the main; subsequent are spares activated
            // in sequence. Each spare's sampled time IS the time-to-fail once activated.
            const times = kids.map(c => evalGate(c, failTimes, visited));
            let cum = times[0];
            for (let i = 1; i < times.length; i++) cum += times[i];
            return cum;
        }
        if (node.gateType === 'FDEP')   return Infinity; // FDEPs are modifiers, never fail themselves.
        if (node.gateType === 'XOR') {
            // "Exactly one of the children has failed within mission time"
            const sorted = kids.map(c => evalGate(c, failTimes, visited)).sort((a, b) => a - b);
            return isFinite(sorted[0]) && !isFinite(sorted[1]) ? sorted[0] : Infinity;
        }
        if (node.gateType === 'VOTING') {
            const k = Math.max(1, Math.min(node.votingK || 2, kids.length));
            const sorted = kids.map(c => evalGate(c, failTimes, visited)).sort((a, b) => a - b);
            return sorted[k - 1];
        }
        return Infinity;
    }

    let failCount = 0;
    for (let trial = 0; trial < N; trial++) {
        // Sample failure times from Exp(λ) for each unique basic event.
        const failTimes = new Map();
        eventMap.forEach((node, lid) => {
            const lambda = getEffectiveLambda(node);
            if (lambda <= 0) { failTimes.set(lid, Infinity); return; }
            const u = Math.max(Math.random(), 1e-12);
            failTimes.set(lid, -Math.log(u) / lambda);
        });
        // Apply FDEP modifications: each trigger that fails before T forces its dependents.
        for (const fdep of fdepGates) {
            const kids = fdep.children || fdep._children;
            if (!kids || kids.length < 2) continue;
            const triggerKid = kids[0];
            if (triggerKid.type === 'gate') continue; // require a leaf trigger for now
            const triggerLid = triggerKid.logicalId != null ? triggerKid.logicalId : triggerKid.id;
            const triggerTime = failTimes.get(triggerLid);
            if (triggerTime == null || !isFinite(triggerTime) || triggerTime > missionTime) continue;
            for (let i = 1; i < kids.length; i++) {
                const dep = kids[i];
                if (dep.type === 'gate') continue;
                const lid = dep.logicalId != null ? dep.logicalId : dep.id;
                const natural = failTimes.get(lid);
                failTimes.set(lid, Math.min(natural || Infinity, triggerTime));
            }
        }
        const topT = evalGate(rootNode, failTimes, new Set());
        if (topT <= missionTime) failCount++;
    }
    const p = failCount / N;
    const stderr = Math.sqrt(p * (1 - p) / N);
    return { p, stderr, N, dynGateCount };
}

// ==========================================
// Multi-state Markov chain solver
// Steady-state probabilities π satisfying πQ = 0, Σπ = 1.
// Implementation: build Q (rate matrix), then solve Qᵀπᵀ = 0 with the last row replaced by all-1s and RHS [0,…,0,1].
// Gaussian elimination — adequate for the small n (typically 2–6 states) Markov models in aerospace use cases.
// ==========================================
function solveMarkovModel(model) {
    if (!model || !Array.isArray(model.states) || model.states.length === 0)
        return { pi: [], pFailed: 0, ok: false };
    const n = model.states.length;
    const stateIdx = new Map(model.states.map((s, i) => [s.name, i]));
    // Build the rate matrix Q (n×n).
    const Q = Array.from({ length: n }, () => Array(n).fill(0));
    (model.transitions || []).forEach(t => {
        const i = stateIdx.get(t.from), j = stateIdx.get(t.to);
        if (i == null || j == null || i === j) return;
        const r = parseFloat(t.rate) || 0;
        if (r > 0) Q[i][j] += r;
    });
    for (let i = 0; i < n; i++) {
        let off = 0;
        for (let j = 0; j < n; j++) if (j !== i) off += Q[i][j];
        Q[i][i] = -off;
    }
    // A = Qᵀ with the last row replaced by ones; b = [0,…,0,1].
    const A = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) A[j][i] = Q[i][j];
    for (let j = 0; j < n; j++) A[n - 1][j] = 1;
    const b = Array(n).fill(0); b[n - 1] = 1;
    // Gaussian elimination with partial pivoting.
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
        if (Math.abs(A[pivot][col]) < 1e-14) continue;
        if (pivot !== col) { [A[col], A[pivot]] = [A[pivot], A[col]]; [b[col], b[pivot]] = [b[pivot], b[col]]; }
        for (let r = col + 1; r < n; r++) {
            const f = A[r][col] / A[col][col];
            if (f === 0) continue;
            for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
            b[r] -= f * b[col];
        }
    }
    const pi = Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        if (Math.abs(A[r][r]) < 1e-14) continue;
        let s = b[r];
        for (let c = r + 1; c < n; c++) s -= A[r][c] * pi[c];
        pi[r] = s / A[r][r];
    }
    // Normalize (defensive — should already sum to ~1).
    const tot = pi.reduce((a, x) => a + x, 0);
    if (tot > 0 && Math.abs(tot - 1) > 1e-9) for (let i = 0; i < n; i++) pi[i] /= tot;
    const pFailed = pi.reduce((acc, p, i) => acc + (model.states[i].isFailed ? p : 0), 0);
    return { pi, pFailed, ok: true };
}

// Look up a Markov model by id from projectConfig.
function getMarkovModel(id) {
    const list = (projectConfig && projectConfig.markovModels) || [];
    return list.find(m => m.id === id);
}

// === Markov model CRUD + render ===
function addMarkovModel() {
    const m = {
        id: 'mkv-' + Date.now(),
        name: 'New Markov Model',
        states: [
            { name: 'Working', isFailed: false },
            { name: 'Failed',  isFailed: true  }
        ],
        transitions: [{ from: 'Working', to: 'Failed', rate: 1e-5 }]
    };
    (projectConfig.markovModels = projectConfig.markovModels || []).push(m);
    renderMarkovModels();
}
function deleteMarkovModel(id) {
    if (!confirm('Delete this Markov model? Events using it will fall back to their repair model.')) return;
    projectConfig.markovModels = (projectConfig.markovModels || []).filter(m => m.id !== id);
    renderMarkovModels();
    calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
}
function setMarkovName(id, val) { const m = getMarkovModel(id); if (m) m.name = val; }
function addMarkovState(id) {
    const m = getMarkovModel(id); if (!m) return;
    const base = 'State ' + (m.states.length + 1);
    let name = base, idx = 0;
    while (m.states.some(s => s.name === name)) { idx++; name = base + '·' + idx; }
    m.states.push({ name, isFailed: false });
    renderMarkovModels();
}
function deleteMarkovState(id, stateName) {
    const m = getMarkovModel(id); if (!m) return;
    m.states = m.states.filter(s => s.name !== stateName);
    m.transitions = m.transitions.filter(t => t.from !== stateName && t.to !== stateName);
    renderMarkovModels();
}
function setMarkovStateField(id, oldName, field, val) {
    const m = getMarkovModel(id); if (!m) return;
    const s = m.states.find(s => s.name === oldName); if (!s) return;
    if (field === 'name') {
        const trimmed = String(val).trim();
        if (!trimmed || m.states.some(o => o !== s && o.name === trimmed)) { renderMarkovModels(); return; }
        m.transitions.forEach(t => { if (t.from === oldName) t.from = trimmed; if (t.to === oldName) t.to = trimmed; });
        s.name = trimmed;
    } else if (field === 'isFailed') {
        s.isFailed = !!val;
    }
    renderMarkovModels();
}
function addMarkovTransition(id) {
    const m = getMarkovModel(id); if (!m || m.states.length < 2) return;
    m.transitions.push({ from: m.states[0].name, to: m.states[1].name, rate: 0 });
    renderMarkovModels();
}
function deleteMarkovTransition(id, idx) {
    const m = getMarkovModel(id); if (!m) return;
    m.transitions.splice(idx, 1);
    renderMarkovModels();
}
function setMarkovTransition(id, idx, field, val) {
    const m = getMarkovModel(id); if (!m || !m.transitions[idx]) return;
    if (field === 'rate') m.transitions[idx].rate = Math.max(0, parseFloat(val) || 0);
    else m.transitions[idx][field] = val;
    renderMarkovModels();
}
function renderMarkovModels() {
    const container = document.getElementById('markov-models-container');
    if (!container) return;
    const models = (projectConfig && projectConfig.markovModels) || [];
    if (models.length === 0) { container.innerHTML = '<p style="color: var(--text-secondary); font-style: italic; padding: 10px;">No Markov models defined. Click + Add Markov Model to create one.</p>'; return; }
    container.innerHTML = models.map(m => {
        const result = solveMarkovModel(m);
        const stateRows = m.states.map(s => `<tr>
            <td><input type="text" value="${esc(s.name)}" onchange="setMarkovStateField('${esc(m.id)}', '${esc(s.name)}', 'name', this.value)" class="u-mb0"></td>
            <td style="text-align:center;"><input type="checkbox" ${s.isFailed ? 'checked' : ''} onchange="setMarkovStateField('${esc(m.id)}', '${esc(s.name)}', 'isFailed', this.checked)"></td>
            <td style="font-family: monospace; text-align: right;">${result.ok ? (result.pi[m.states.indexOf(s)] || 0).toExponential(3) : '—'}</td>
            <td><button class="action-btn btn-red" onclick="deleteMarkovState('${esc(m.id)}', '${esc(s.name)}')">X</button></td>
        </tr>`).join('');
        const stateOpts = m.states.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
        const txRows = m.transitions.map((t, i) => `<tr>
            <td><select onchange="setMarkovTransition('${esc(m.id)}', ${i}, 'from', this.value)" class="u-mb0">${stateOpts.replace(`value="${esc(t.from)}"`, `value="${esc(t.from)}" selected`)}</select></td>
            <td style="text-align:center;">→</td>
            <td><select onchange="setMarkovTransition('${esc(m.id)}', ${i}, 'to', this.value)" class="u-mb0">${stateOpts.replace(`value="${esc(t.to)}"`, `value="${esc(t.to)}" selected`)}</select></td>
            <td><input type="number" step="any" min="0" value="${t.rate}" onchange="setMarkovTransition('${esc(m.id)}', ${i}, 'rate', this.value)" class="u-mb0"></td>
            <td><button class="action-btn btn-red" onclick="deleteMarkovTransition('${esc(m.id)}', ${i})">X</button></td>
        </tr>`).join('');
        const pFailedTxt = result.ok ? result.pFailed.toExponential(4) : 'n/a';
        return `<div class="controls" style="border-left-color: #0e7490;">
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
                <input type="text" value="${esc(m.name)}" onchange="setMarkovName('${esc(m.id)}', this.value)" style="flex:1; margin-bottom:0; font-weight:bold;">
                <span style="font-family: monospace; font-size: 0.9em; color: var(--header-color);">P(failed) = ${pFailedTxt}</span>
                <code style="font-size:0.75em; color: var(--text-secondary);">${esc(m.id)}</code>
                <button class="action-btn btn-red" onclick="deleteMarkovModel('${esc(m.id)}')">Delete Model</button>
            </div>
            <div class="grid-2-col">
                <div>
                    <h5 style="margin:0 0 6px 0; color: var(--header-color);">States</h5>
                    <table style="width:100%; font-size: 0.85em;"><thead><tr><th class="u-text-left">Name</th><th>Failed?</th><th style="text-align:right;">π (steady)</th><th></th></tr></thead><tbody>${stateRows}</tbody></table>
                    <button class="btn-cyan action-btn" onclick="addMarkovState('${esc(m.id)}')" style="margin-top:6px;">+ State</button>
                </div>
                <div>
                    <h5 style="margin:0 0 6px 0; color: var(--header-color);">Transitions (rate /hr)</h5>
                    <table style="width:100%; font-size: 0.85em;"><thead><tr><th>From</th><th></th><th>To</th><th>Rate</th><th></th></tr></thead><tbody>${txRows}</tbody></table>
                    <button class="btn-cyan action-btn" onclick="addMarkovTransition('${esc(m.id)}')" style="margin-top:6px;">+ Transition</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// Resolve a basic event's effective λ for the *active* FTA context. Falls back through:
//   • per-phase override (time-weighted average across the linked FHA's phases), then
//   • flat node.lambda.
function getEffectiveLambda(node) {
    const flat = node.lambda || 0;
    if (!node.lambdaByPhase || !ftaConfig.linkedFhaId) return flat;
    const isAC = ftaConfig.linkedFhaId.startsWith('AC_');
    const realId = ftaConfig.linkedFhaId.replace('AC_', '').replace('SYS_', '');
    const fha = isAC ? acFhaData.find(x => x.internalId === realId)
                     : getAllSysFha().find(x => x.internalId === realId);
    if (!fha || !fha.phases) return flat;
    const phases = fha.phases.split(',').map(s => s.trim()).filter(Boolean);
    let totalT = 0, weighted = 0;
    const _mpTbl = _activeTreeMissionPhases() || [];
    for (const phaseName of phases) {
        const pd = _mpTbl.find(p => p.phase === phaseName);
        if (!pd || !pd.duration) continue;
        let d = parseFloat(pd.duration) || 0;
        if (pd.durationUnit === 'seconds') d /= 3600;
        else if (pd.durationUnit === 'mins') d /= 60;
        const lp = node.lambdaByPhase[phaseName];
        weighted += (lp != null ? lp : flat) * d;
        totalT += d;
    }
    return totalT > 0 ? weighted / totalT : flat;
}

// Phase 57 — per-event exposure model. A basic event can be exposed to its failure
// condition for a different time than the whole-tree mission. Modes:
//   • 'continuous' (default / back-compat) — full mission; uses the global exposure.
//   • 'active'   — at-risk only during specific flight phases; exposure = Σ phase durations.
//   • 'latent'   — dormant failure accumulating between inspections; exposure = dormancyInterval.
//   • 'manual'   — explicit exposureTime value.
// Resolving here keeps allocation (P→λ) and reconstruction (λ→P) on the SAME t so the
// top-down/bottom-up round-trip stays exact.

// Duration of a single flight phase in hours (honors seconds/mins/hours unit).
function _phaseDurationHours(phaseName) {
    const tbl = (typeof _activeTreeMissionPhases === 'function') ? _activeTreeMissionPhases() : flightPhasesData;
    const pd = (tbl && tbl.length)
        ? tbl.find(p => p.phase === phaseName) : null;
    if (!pd || !pd.duration) return 0;
    let d = parseFloat(pd.duration) || 0;
    if (pd.durationUnit === 'seconds') d /= 3600;
    else if (pd.durationUnit === 'mins') d /= 60;
    return d;
}

// Resolve the list of phases during which a node's failure condition is hazardous.
// Source order: explicit node.exposurePhases → node.lambdaByPhase keys → linked FHA phases.
function _activeExposurePhases(node) {
    if (!node) return [];
    const norm = (v) => Array.isArray(v) ? v.slice()
        : (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
    let phases = norm(node.exposurePhases);
    if (phases.length) return phases;
    if (node.lambdaByPhase && typeof node.lambdaByPhase === 'object') {
        phases = Object.keys(node.lambdaByPhase);
        if (phases.length) return phases;
    }
    // Fall back to the linked FHA's applicable phases (same resolution as getEffectiveLambda).
    try {
        if (ftaConfig && ftaConfig.linkedFhaId) {
            const isAC = ftaConfig.linkedFhaId.startsWith('AC_');
            const realId = ftaConfig.linkedFhaId.replace('AC_', '').replace('SYS_', '');
            const fha = isAC ? acFhaData.find(x => x.internalId === realId)
                             : getAllSysFha().find(x => x.internalId === realId);
            if (fha && fha.phases) return norm(fha.phases);
        }
    } catch (e) { /* ignore */ }
    return [];
}

// Σ of the durations (hours) of a node's at-risk phases. 0 when none resolve.
function _activeExposureForNode(node) {
    const phases = _activeExposurePhases(node);
    let t = 0;
    for (const p of phases) t += _phaseDurationHours(p);
    return t;
}

// The effective exposure time (hours) to use when converting this node between P and λ.
// fallbackT is the global mission exposure; non-default modes override it. Gates and
// continuous-mode leaves always use the global value (existing behavior preserved).
function _nodeExposureTime(node, fallbackT) {
    const globalT = (fallbackT != null) ? fallbackT : ((typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1);
    if (!node || node.type === 'gate') return globalT;
    const mode = node.exposureMode || 'continuous';
    if (mode === 'manual') {
        const t = parseFloat(node.exposureTime);
        return (isFinite(t) && t > 0) ? t : globalT;
    }
    if (mode === 'latent') {
        const t = parseFloat(node.dormancyInterval);
        return (isFinite(t) && t > 0) ? t : globalT;
    }
    if (mode === 'active') {
        const t = _activeExposureForNode(node);
        return (isFinite(t) && t > 0) ? t : globalT;
    }
    return globalT; // 'continuous' and anything unrecognized
}

function effectiveProbFromLambda(lambda, node, exposureTime) {
    // Phase 57 — per-event exposure: a non-default exposureMode overrides the passed
    // (global) exposure so latent/active events accumulate over their own window. Continuous
    // mode and gates fall through to the global value, preserving existing behavior exactly.
    const t = _nodeExposureTime(node, exposureTime || 1);
    const model = (node && node.repairModel) || 'unmaintained';
    if (model === 'continuous') {
        const mu = (node && node.mu) || 0;
        if (mu > 0) return lambda / (lambda + mu);
    } else if (model === 'periodic') {
        const tau = (node && node.tau) || 0;
        if (tau > 0) return Math.min(1, (lambda * tau) / 2);
    }
    return -Math.expm1(-lambda * t);
}

// Convenience wrapper that resolves the node's current effective λ (phase-aware) then converts.
// When the event is attached to a Markov model, return Σπ(failed states) directly — Markov
// overrides the repair-model formula since it already captures repair/transition dynamics.
function effectiveProb(node, exposureTime) {
    if (node && node.markovModelId) {
        const model = getMarkovModel(node.markovModelId);
        if (model) {
            const res = solveMarkovModel(model);
            if (res.ok) return res.pFailed;
        }
    }
    return effectiveProbFromLambda(getEffectiveLambda(node), node, exposureTime);
}

function runDFTMonteCarlo() {
    const root = getActiveFTARoot();
    const out = document.getElementById('dft-summary');
    if (!root) { if (out) out.innerHTML = ''; return alert('Tree is empty.'); }
    const r = simulateDFT(root, ftaConfig.exposureTime || 1, 20000);
    if (!out) return;
    const dynCount = r.dynGateCount || 0;
    const note = dynCount === 0
        ? '<div style="margin-top:6px; padding:8px; background:#fef3c7; border:1px solid #f59e0b; border-radius:4px; color:#78350f; font-size:0.85em;">No dynamic gates (PAND / SPARE / FDEP) in this tree — Monte Carlo just confirms the BDD result. Add a dynamic gate to exercise time-ordered semantics.</div>'
        : `<div style="margin-top:6px; color: var(--text-secondary); font-size: 0.85em;">Tree contains ${dynCount} dynamic gate(s); Monte Carlo is the authoritative result for these.</div>`;
    out.innerHTML = `<div style="padding: 10px; background: var(--bg-control); border: 1px solid var(--border-primary); border-radius: 4px;">
        <strong>DFT Simulation (Monte Carlo, N = ${r.N.toLocaleString()}, mission t = ${(ftaConfig.exposureTime || 1).toFixed(3)} hr):</strong>
        <div style="margin-top:6px; font-family: monospace; font-size: 0.95em; color: #be185d;">
            P(top) ≈ ${r.p.toExponential(4)}  ±${r.stderr.toExponential(2)} (1σ)
        </div>${note}
    </div>`;
}

function runUncertaintyDisplay() {
    const root = getActiveFTARoot();
    const out = document.getElementById('uncertainty-summary');
    if (!root) { if (out) out.innerHTML = ''; return alert('Tree is empty.'); }
    // Warn if no basic event has a non-trivial EF — the sampler will produce a delta at the point estimate.
    const anyEF = (function check(n) {
        if (!n) return false;
        if (n.type !== 'gate' && (n.lambdaEF || 1) > 1) return true;
        const kids = n.children || n._children;
        return kids ? kids.some(check) : false;
    })(root);
    const r = runUncertaintyAnalysis(root, 10000);
    if (!out) return;
    const pad = anyEF ? '' : '<div style="margin-top:6px; padding:8px; background:#fef3c7; border:1px solid #f59e0b; border-radius:4px; color:#78350f; font-size:0.85em;">No basic events carry an Error Factor &gt; 1 — every sample reduces to the point estimate. Set <code>lambdaEF</code> on basic events (e.g., 3 or 10) for meaningful uncertainty.</div>';
    out.innerHTML = `<div style="padding: 10px; background: var(--bg-control); border: 1px solid var(--border-primary); border-radius: 4px;">
        <strong>Uncertainty Analysis (Monte Carlo, N = ${r.N.toLocaleString()}):</strong>
        <div style="margin-top:6px; font-family: monospace; font-size: 0.9em;">
            Mean    : ${r.mean.toExponential(4)}<br>
            Median  : ${r.median.toExponential(4)}<br>
            5%-ile  : ${r.p05.toExponential(4)}<br>
            95%-ile : ${r.p95.toExponential(4)}<br>
            90% CI  : [${r.p05.toExponential(2)}, ${r.p95.toExponential(2)}]
        </div>${pad}
    </div>`;
}

// Box-Muller standard normal sample. One call returns one z ~ N(0, 1).
function _normSample() {
    const u1 = Math.max(Math.random(), 1e-12);
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Monte-Carlo uncertainty propagation. Each basic event's λ is sampled from a lognormal
// distribution defined by (median = node.lambda, error factor EF = node.lambdaEF or 1).
// The BDD is built once and probMap is re-sampled every trial.
function runUncertaintyAnalysis(rootNode, N) {
    N = N || 10000;
    const { bdd, varOrder, varMeta } = buildBDDFromFT(rootNode);
    if (!varOrder.length) return { samples: [], mean: 0, median: 0, p05: 0, p95: 0, N: 0 };
    const exposure = ftaConfig.exposureTime || 1;
    // Pre-compute σ_ln per variable: σ = ln(EF) / 1.645 (since EF = exp(1.645·σ) for 90% CI).
    // The median λ here already accounts for phase-of-flight weighting if the event uses it.
    //
    // Phase 61 (F3 fix) — apply the SAME MGL/CCF tier splitting that _probMapFor uses for the
    // point estimate, so the sampled distribution is consistent with BDD-exact:
    //   indep var of a CCF member:  q·(1−β)
    //   group tier-2 var:           q·β·(1−γ)
    //   group tier-3 var:           q·β·γ·(1−δ)
    //   group tier-4 var:           q·β·γ·δ
    // Previously every variable (including the group tiers) received the FULL q, inflating
    // P(top) on CCF trees ~an order of magnitude and contradicting the point estimate.
    const meta = varOrder.map((node, idx) => {
        const vm = (varMeta && varMeta[idx]) || null;
        let refNode = node, factor = 1;
        if (vm && vm.type === 'group') {
            refNode = vm.refNode || node;
            const beta  = refNode.beta  || 0;
            const gamma = refNode.gamma || 0;
            const delta = refNode.delta || 0;
            if (vm.tier === 2)      factor = beta * (1 - gamma);
            else if (vm.tier === 3) factor = beta * gamma * (1 - delta);
            else if (vm.tier === 4) factor = beta * gamma * delta;
        } else {
            const n = (vm && vm.node) || node;
            refNode = n;
            factor = (n.ccfGroup && n.beta > 0) ? (1 - n.beta) : 1;
        }
        const median = getEffectiveLambda(refNode);
        const EF = refNode.lambdaEF && refNode.lambdaEF > 1 ? refNode.lambdaEF : 1;
        const sigma = EF > 1 ? Math.log(EF) / 1.645 : 0;
        return { node: refNode, median, sigma, factor };
    });
    const samples = new Array(N);
    for (let i = 0; i < N; i++) {
        const probMap = new Map();
        for (let v = 0; v < meta.length; v++) {
            const m = meta[v];
            const z = m.sigma > 0 ? _normSample() : 0;
            const lambdaSampled = m.median * Math.exp(m.sigma * z);
            // Phase 61 — leaves without rate data (probability-only allocation budgets)
            // contribute their stored probability; there is no λ to sample.
            const q = (m.median > 0)
                ? effectiveProbFromLambda(lambdaSampled, m.node, exposure)
                : (m.node.probability || 0);
            probMap.set(v, m.factor * q);
        }
        samples[i] = BDD.probability(bdd, probMap, new Map());
    }
    samples.sort((a, b) => a - b);
    return {
        samples, N,
        mean:   samples.reduce((a, b) => a + b, 0) / N,
        median: samples[Math.floor(N * 0.5)],
        p05:    samples[Math.floor(N * 0.05)],
        p95:    samples[Math.floor(N * 0.95)]
    };
}

// Importance measures for each variable. All derived from two BDD prob runs per event
// (cofactor x=1 and x=0), so adding more is essentially free given the existing infrastructure.
//   Birnbaum            ∂P_top/∂P_x       = P(f|x=1) − P(f|x=0)
//   Fussell-Vesely      fractional drop   = (P_top − P(f|x=0)) / P_top
//   RAW                 risk-achievement  = P(f|x=1) / P_top
//   RRW                 risk-reduction    = P_top / P(f|x=0)        (∞ when P(f|x=0) = 0)
//   Critical importance event-failure share = Birnbaum · P(x) / P_top
//   DIM                 ∂lnP_top/∂lnP_x   = (P(x) / P_top) · Birnbaum
function computeImportanceMeasures(rootNode) {
    const ex = computeExactProbability(rootNode);
    const { bdd, varOrder, varMeta, probMap, prob: pTop } = ex;
    const measures = [];
    varOrder.forEach((refNode, varIdx) => {
        const meta = varMeta[varIdx];
        if (meta && meta.type === 'group') return; // CCF group rows are derived — skip from the per-event ranking
        const m1 = new Map(probMap); m1.set(varIdx, 1);
        const m0 = new Map(probMap); m0.set(varIdx, 0);
        const pX1 = BDD.probability(bdd, m1, new Map());
        const pX0 = BDD.probability(bdd, m0, new Map());
        const p   = probMap.get(varIdx) || 0;
        const birnbaum = pX1 - pX0;
        const fv       = pTop > 0 ? (pTop - pX0) / pTop : 0;
        const raw      = pTop > 0 ? pX1 / pTop : 0;
        const rrw      = pX0 > 0 ? pTop / pX0 : Infinity;
        const critical = pTop > 0 ? (birnbaum * p) / pTop : 0;
        const dim      = pTop > 0 ? (p / pTop) * birnbaum : 0;
        measures.push({ node: refNode, varIdx, p, birnbaum, fv, raw, rrw, critical, dim });
    });
    return { measures, pTop, bddSize: ex.bddSize };
}

// Expand a list of minimal cutsets to include CCF decomposition rows.
//   Pure β model:      one independent path + one β-CCF path per group with ≥2 group members in the cutset.
//   MGL (β + γ + δ):   independent path + 2-component CCF + 3-component CCF + 4-component CCF rows
//                      based on the cutset's group multiplicity.
// Probabilities per MGL convention:
//   P_ind          = q(1−β)
//   P_CCF_2of2     = q·β·(1−γ)
//   P_CCF_3of≥3    = q·β·γ·(1−δ)
//   P_CCF_4of≥4    = q·β·γ·δ
function expandCCFCutsets(minimalCutsets) {
    const expanded = [];
    for (const cutset of minimalCutsets) {
        // Bucket events in this cutset by ccfGroup.
        const groups = {};
        for (const node of cutset) {
            if (node.ccfGroup && (node.beta > 0)) {
                if (!groups[node.ccfGroup]) groups[node.ccfGroup] = [];
                groups[node.ccfGroup].push(node);
            }
        }
        const groupKeys = Object.keys(groups).filter(g => groups[g].length >= 2);
        if (groupKeys.length === 0) { expanded.push(cutset); continue; }
        // Preserve dynamic-gate annotations across the CCF decomposition.
        const dynOrigin = cutset.dynamicOrigin;
        const dynOrder  = cutset.dynamicOrder;

        // For each multi-member group, generate one row per CCF tier.
        // To keep cardinality bounded, expand groups one at a time (Cartesian product would explode).
        let working = [cutset];
        for (const g of groupKeys) {
            const members = groups[g];
            const first = members[0];
            const beta  = first.beta || 0;
            const gamma = first.gamma || 0;
            const delta = first.delta || 0;
            const groupSize = Math.min(members.length, 4); // up to 4-component CCF
            const next = [];
            for (const cs of working) {
                // Independent path: each member's contribution is q·(1−β).
                const indCs = cs.map(n => (n.ccfGroup === g
                    ? { displayId: `${n.displayId} (Ind)`, name: `${n.name} (Independent)`, probability: n.probability * (1 - beta) }
                    : n));
                next.push(indCs);
                // 2-component CCF path: q·β·(1−γ)
                const ccf2Prob = first.probability * beta * (1 - gamma);
                const ccf2Cs = cs.filter(n => n.ccfGroup !== g).concat([
                    { displayId: `CCF₂-[${g}]`, name: `Common Cause (2-of-n): ${g}`, probability: ccf2Prob, isCCF: true, sourceGroup: g, ccfTier: 2 }
                ]);
                next.push(ccf2Cs);
                // 3-component CCF path: q·β·γ·(1−δ), only when group has ≥3 members and γ > 0
                if (groupSize >= 3 && gamma > 0) {
                    const ccf3Prob = first.probability * beta * gamma * (1 - delta);
                    const ccf3Cs = cs.filter(n => n.ccfGroup !== g).concat([
                        { displayId: `CCF₃-[${g}]`, name: `Common Cause (3-of-n): ${g}`, probability: ccf3Prob, isCCF: true, sourceGroup: g, ccfTier: 3 }
                    ]);
                    next.push(ccf3Cs);
                }
                // 4-component CCF path: q·β·γ·δ, only when group has ≥4 members and δ > 0
                if (groupSize >= 4 && delta > 0) {
                    const ccf4Prob = first.probability * beta * gamma * delta;
                    const ccf4Cs = cs.filter(n => n.ccfGroup !== g).concat([
                        { displayId: `CCF₄-[${g}]`, name: `Common Cause (4-of-n): ${g}`, probability: ccf4Prob, isCCF: true, sourceGroup: g, ccfTier: 4 }
                    ]);
                    next.push(ccf4Cs);
                }
            }
            working = next;
        }
        if (dynOrigin) working.forEach(cs => { cs.dynamicOrigin = dynOrigin; cs.dynamicOrder = dynOrder; });
        expanded.push(...working);
    }
    return expanded;
}

// The active top event (fault-tree page) the cut-set analysis is scoped to. Cut sets are
// always per top-level gate — never project-wide — so the report names which gate it analysed.
function _cutsetScopeLabel() {
    try {
        const root = (typeof getActiveFTARoot === 'function') ? getActiveFTARoot() : null;
        const page = (typeof ftaPages !== 'undefined' && typeof activeFTAPageId !== 'undefined') ? ftaPages.find(p => p && p.id === activeFTAPageId) : null;
        const pageName = (page && page.name) ? String(page.name).trim() : '';
        const topName = (root && root.name) ? String(root.name).trim() : '';
        if (pageName && topName && pageName.toLowerCase() !== topName.toLowerCase()) return pageName + ' — ' + topName;
        return pageName || topName || 'Active fault tree';
    } catch (_) { return 'Active fault tree'; }
}
// Cut-set enumeration aborted (tree too complex). Show a clear notice and still
// surface the BDD-exact P(top) — quantification is independent of the cut-set listing.
function _renderCutsetTooComplex(rootNode, err) {
    const tbody = document.getElementById('cutset-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:12px;color:var(--text-secondary);">Cut-set enumeration aborted — this fault tree exceeds ${_CUTSET_BUDGET.toLocaleString()} combinations. Simplify deep AND nesting / large voting gates, or split the tree with transfer gates. The exact P(top) below is computed by the BDD engine and is unaffected.</td></tr>`;
    const tbl = document.getElementById('cutset-table'); if (tbl) tbl.style.display = 'table';
    const summary = document.getElementById('cutset-summary');
    if (summary) {
        let bddResult = null;
        try { bddResult = computeImportanceMeasures(rootNode); } catch (e) { console.error('BDD computation failed:', e); }
        let html = `<div style="font-size:0.9em;color:var(--text-secondary);margin-bottom:6px;">Minimal cut sets for top event: <strong>${esc(_cutsetScopeLabel())}</strong> <span style="opacity:.85;">— this fault tree only, not the whole project</span></div><div style="padding:10px;background:var(--bg-control);border:1px solid var(--border-primary);border-radius:4px;">
            <div style="color:#b91c1c;font-weight:bold;">Cut-set list unavailable — tree too complex to enumerate (${err && err.count ? err.count.toLocaleString() + '+' : 'over budget'} combinations).</div>`;
        if (bddResult) {
            html += `<div style="margin-top:6px;"><strong>Exact P(top) via BDD:</strong>
                <span style="font-family:monospace;font-size:1.1em;color:#059669;">${bddResult.pTop.toExponential(4).toUpperCase()}</span>
                <span style="color:var(--text-secondary);font-size:0.85em;"> · BDD size: ${bddResult.bddSize} nodes</span></div>`;
        }
        html += `</div>`;
        summary.innerHTML = html;
    }
}

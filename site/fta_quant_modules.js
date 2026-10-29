// 28 Oct 2026 (beta in allocation, Waqas agreed): common cause in an allocation tree follows the independence of the AND gate where its members meet: counted for compromised or "None, no claim", left out for claimed or substantiated; see _allocCcfPlan and tests/regression_alloc_beta_20261028.test.js
// 13 Oct 2026 (fix3-M): Markov models are drawn too: the state and transition tables and the Markov state diagram (markov_diagram.js) are two views of the same model; states get stable ids and a type (operational / degraded / failed), the start can be a distribution (initialProbs), transitions are failure (λ) or repair (μ), a renamed state is renamed in its transitions and start. Solving is unchanged. See tests/regression_rbd_markov_diagrams_20261013b.test.js
// 13 Oct 2026 (fix G): SEQ (sequence-enforcing) gate solved exactly as a Markov chain when it is an independent constant-rate module (else the AND bound), NOT gate (NOR over several inputs) in calcBottomUp, the BDD, top-down allocation and the DFT Monte Carlo; prime implicants for trees with NOT (copies held identical to fta_engine.js v1.11). See tests/regression_fta_handbuild_20261013b.test.js
// 13 Oct 2026 (fix 3, MGL, merged with F1 and F4/F5): common cause groups use the real Multiple Greek Letter model (NUREG/CR-5485): one BDD variable per specific common cause event, shared _mgl* helpers held identical to fta_engine.js v1.9, order-invariant group parameters, MGL cut-set rows (expandCCFCutsets) and MGL-consistent uncertainty sampling (time-averaged like P(top)). FDEP forcing covers a member's whole leaf; common cause events of periodic latent members join their interval's time average. Before, gamma and delta did not change P(top) and the group took q and beta from the first member read. See tests/regression_ccf_mgl_20261013.test.js
// 13 Oct 2026 (math audit F1): calculateAllProbabilities puts the EXACT top (BDD, common cause and shared events included) on every result page, open or not, through _slApplyExactTops; allocation pages keep the engineer's budget with the exact reconstruction on _bddActualProb. Before, only the open page with repeated ids got it, so beta groups never did. See tests/regression_exact_top_20261013.test.js
// 13 Oct 2026 (math audit F4/F5): static P(top) counts FDEP gates, solves PAND/SPARE exactly when they are independent constant-rate modules (else a stated upper bound with the spare switchover as a visible event), and time-averages periodic latent events sharing an inspection interval (calcBottomUp and the BDD); DFT Monte Carlo handles gate triggers, gate dependents and chained FDEPs; see tests/regression_dynamic_static_20261013.test.js and tests/regression_latent_joint_20261013.test.js
// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// 13 Oct 2026 (fix 6): expandCCFCutsets rebuilt on SLFTAEngine.explicitCCFCutsets: every common cause event appears once, explicitly, in the minimal cut sets (audit F6).
// fta_quant_modules.js — v1.0 — Phase P2 batch 1: FTA quantification math layer.
// MOVED VERBATIM from safety_lab.js (byte-exact; classic script, all names remain
// global exactly as before). Runtime-only pure function declarations — zero
// load-time code, zero behavior change. Contents:
//   - allocateTopDown / calcBottomUp / external-source staleness
//   - shared-event propagation + calculateAllProbabilities
//   - cutset engine wrappers (getCutsets, multiplyCutsets, ...)
//   - effectiveProb / repair models / DFT Monte Carlo / uncertainty display
// Verified: node --check, name-uniqueness sweep, DO-330 benchmark suite.
// Phase 66.10 — apportionment weight, read safely.
// `weight` is a PERCENTAGE of the parent budget and a sibling group is kept
// summed to 100 by the UI. The old `(c.weight || 1)` fallback mixed scales: a
// node that arrived without a weight (every node in a tree authored bottom-up)
// counted as 1 against siblings holding 50, so it drew ~2% of the budget instead
// of its equal share — and a legitimate 0% weight was silently promoted to 1.
// A missing weight now defaults to the equal share of its own group.
function _apportionWeight(child, siblingCount, strategy) {
    if (strategy !== 'weighted') return 1;
    const w = parseFloat(child && child.weight);
    if (isFinite(w) && w >= 0) return w;
    return 100 / Math.max(1, siblingCount || 1);
}

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
        // Phase 66.19 — a shared event's strictest requirement, computed across every
        // allocation tree by slSharedStrictestPass(), arrives on the SAME channel as an
        // external link or a paste snapshot. Deliberate: that branch already holds the
        // constrained child verbatim and redistributes the remaining budget across the
        // FREE siblings by gate logic, which is exactly "loosen it for the others".
        // No new redistribution code, and the rebalancer is untouched.
        let shared = null;
        if (typeof slSharedStrictestTarget === 'function' && node._sharedStrictest) {
            shared = slSharedStrictestTarget(node);
        }
        const _caps = [extSrc, paste, shared].filter(function (v) { return v !== null && isFinite(v); });
        if (_caps.length) extTarget = Math.min.apply(null, _caps);
    } catch (e) { extTarget = null; }
    if (extTarget !== null && isFinite(extTarget)) {
        const effective = Math.min(apportionedTarget, extTarget);
        node.probability = effective;
        node._externalAllocation = {
            apportioned: apportionedTarget,
            external:    extTarget,
            effective:   effective,
            overrun:     apportionedTarget > extTarget * 1.0001,   // 0.01% tolerance
            headroom:    apportionedTarget < extTarget * 0.9999,
            // Phase 66.19 — which constraint won, so the panel can name it rather than
            // showing a number with no explanation.
            source:      (node._sharedStrictest && extTarget === slSharedStrictestTarget(node)) ? 'shared-strictest'
                       : (node._pasteOrigin ? 'paste-origin' : (node.externalSource ? 'external-source' : 'cap'))
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
            // Phase 66.19 — the strictest-across-trees cap is a child constraint too.
            // THIS is the line that makes "loosen it for the others" actually happen:
            // a child listed here is held verbatim and its siblings absorb the released
            // budget through the redistribute math below. Without it the capped child
            // was simply reduced and its budget was left on the table.
            let shared = null;
            if (typeof slSharedStrictestTarget === 'function' && c._sharedStrictest) {
                const sp = slSharedStrictestTarget(c);
                if (sp !== null && isFinite(sp)) shared = sp;
            }
            if (prescr !== null) return prescr;  // verbatim — overrides min
            const caps = [extSrc, paste, shared].filter(function (v) { return v !== null && isFinite(v); });
            if (caps.length) return Math.min.apply(null, caps);
        } catch (e) { /* fall through */ }
        return null;
    });
    const hasExtChild = childExt.some(e => e !== null);

    if (hasExtChild && (node.gateType === 'AND' || node.gateType === 'OR' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE' || node.gateType === 'SEQ')) {
        // ---------------- AND-family redistribute ----------------
        // p_top = Π p_i  =>  if some children fixed (p_ext), the free children
        // must satisfy  Π p_free = target / Π p_ext.
        // ---------------- OR redistribute ------------------------
        // p_top ≈ 1 - Π(1-p_i)  =>  Π(1-p_free) = (1-target) / Π(1-p_ext).
        const isAndFamily = (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE' || node.gateType === 'SEQ');
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
        // ------------------------------------------------------------- A9
        // 21 Aug 2026 — THE AUTOMATIC LOOSEN STOPS (OPEN_ITEMS A9, ruled:
        // "a budget that got EASIER needs no action; a budget that got HARDER
        // does"). Until 66.12 the free siblings silently absorbed whatever a
        // cap released. Now the default is: constrained children take their
        // caps verbatim, free children keep the NATURAL apportionment the
        // no-constraint path would give them, and the difference lives on the
        // gate as _budgetMargin — a third budget state (over-committed RED /
        // exact / under-allocated AMBER / signed reserve). The absorb still
        // exists as an OFFERED rebalance: a signed, reversible decision in
        // projectConfig.budgetDecisions (SLBudgetDecisions), consulted here,
        // never applied silently.
        let _a9Decision = null;
        try {
            const _BD = (typeof SLBudgetDecisions !== 'undefined') ? SLBudgetDecisions
                      : (typeof window !== 'undefined' ? window.SLBudgetDecisions : null);
            if (_BD && typeof _BD.decisionFor === 'function') _a9Decision = _BD.decisionFor(node.id) || null;
        } catch (e) { _a9Decision = null; }

        if (_a9Decision && _a9Decision.kind === 'absorb') {
            // The accepted rebalance — the pre-A9 redistribute, now opt-in.
            let wSumFree = 0;
            freeChildren.forEach(c => wSumFree += _apportionWeight(c, freeChildren.length, strategy));
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
                const w = _apportionWeight(child, freeChildren.length, strategy);
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
            // Flag the gate so the canvas + AutoReq know this gate's children
            // were rebalanced — by an accepted decision, with its id.
            node._externalRebalance = {
                constrainedCount: actualChildren.length - freeChildren.length,
                freeCount: freeChildren.length,
                mode: isAndFamily ? 'AND' : 'OR'
            };
            node._budgetMargin = { state: 'absorbed-by-decision', decisionId: _a9Decision.id,
                target: target, mode: isAndFamily ? 'AND' : 'OR',
                constrainedCount: actualChildren.length - freeChildren.length, freeCount: freeChildren.length };
            return;
        }

        // Default — no accepted absorb: caps verbatim, free children NATURAL.
        let wSumAll = 0;
        actualChildren.forEach(c => wSumAll += _apportionWeight(c, actualChildren.length, strategy));
        const _naturalFor = (child) => {
            const w = _apportionWeight(child, actualChildren.length, strategy);
            const ratio = wSumAll > 0 ? w / wSumAll : 0;
            let t = 0;
            if (ratio > 0) t = isAndFamily ? Math.pow(Math.max(0, Math.min(1, target)), ratio)
                                           : 1 - Math.pow(Math.max(0, Math.min(1, 1 - target)), ratio);
            if (!isFinite(t) || t < 0) t = 0;
            if (t > 1) t = 1;
            return t;
        };
        let achievedFactor = 1;
        const _a9Assigned = actualChildren.map((child, i) => {
            const t = childExt[i] !== null ? childExt[i] : _naturalFor(child);
            achievedFactor *= isAndFamily ? Math.max(1e-18, t) : Math.max(1e-18, 1 - t);
            return t;
        });
        const _a9Achieved = isAndFamily ? achievedFactor : 1 - achievedFactor;
        actualChildren.forEach((child, i) => allocateTopDown(child, _a9Assigned[i], strategy, visited));
        const _A9_TOL = 1e-4;
        const _a9State = _a9Achieved > target * (1 + _A9_TOL) ? 'over-committed'
                       : _a9Achieved < target * (1 - _A9_TOL) ? ((_a9Decision && _a9Decision.kind === 'reserve') ? 'reserve' : 'under-allocated')
                       : 'exact';
        node._budgetMargin = {
            state: _a9State, target: target, achieved: _a9Achieved,
            mode: isAndFamily ? 'AND' : 'OR',
            constrainedCount: actualChildren.length - freeChildren.length,
            freeCount: freeChildren.length,
            decisionId: _a9Decision ? _a9Decision.id : null
        };
        // The gate is not force-closed on its target any more, so the old
        // rebalance flag would be a lie here — it survives on the absorb path only.
        if (node._externalRebalance) delete node._externalRebalance;
        return;
    }

    // No external constraints among children (or gate type doesn't have a clean
    // redistribute recipe) — original logic.
    if (node._externalRebalance) delete node._externalRebalance;
    if (node._budgetMargin) delete node._budgetMargin;
    const _a9VotingMargin = hasExtChild && node.gateType === 'VOTING';
    let wSum = 0;
    actualChildren.forEach(c => wSum += _apportionWeight(c, actualChildren.length, strategy));
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
        const w = _apportionWeight(child, actualChildren.length, strategy);
        const ratio = wSum > 0 ? w / wSum : 0;
        let childTarget = 0;
        if (ratio > 0) {
            if (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE' || node.gateType === 'SEQ') {
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
            } else if (node.gateType === 'NOT') {
                // 13 Oct 2026 (fix G): NOT (NOR over several inputs): the output occurs when no input
                // does, so P(out) = PROD(1 - p_i) = target; the geometric split gives 1 - p_i = target^ratio.
                childTarget = 1 - Math.pow(Math.max(0, Math.min(1, target)), ratio);
            } else {
                childTarget = target * ratio;   // XOR — Σ pᵢ·Π(1−pⱼ) ≈ Σ pᵢ; linear split closes to <0.1% at cert magnitudes
            }
        }
        allocateTopDown(child, childTarget, strategy, visited);
    });
    // ---------------------------------------------------------------- A9
    // 21 Aug 2026 — margin for VOTING gates too (live-found on K350: every
    // constrained gate on the flagship data is a MAC-generated k-of-N, which
    // the redistribute recipe above never covered — so caps were honored at
    // the node level, siblings stayed natural, and the freed budget was
    // invisible). The assignment is already the A9 default; this records the
    // honest tri-state: exact P(≥k of N) over the children's ASSIGNED
    // probabilities by DP, compared to the gate's target.
    if (_a9VotingMargin) {
        try {
            const ps = actualChildren.map(function (c) { const v = c.probability; return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; });
            const kk = Math.max(1, Math.min(node.votingK || 2, ps.length));
            let dist = [1];
            ps.forEach(function (p) {
                const nd = new Array(dist.length + 1).fill(0);
                dist.forEach(function (q, di) { nd[di] += q * (1 - p); nd[di + 1] += q * p; });
                dist = nd;
            });
            let achieved = 0;
            dist.forEach(function (q, di) { if (di >= kk) achieved += q; });
            // The VOTING inverse is the rare-event C(N,K)·p^k approximation, so
            // the exact DP sits O(k·p_child) off a "perfect" allocation — a 1%
            // band keeps that noise quiet; real caps move the number by factors.
            const TOLV = 1e-2;
            const decV = (function () { try {
                const B = (typeof SLBudgetDecisions !== 'undefined') ? SLBudgetDecisions
                        : (typeof window !== 'undefined' ? window.SLBudgetDecisions : null);
                return (B && typeof B.decisionFor === 'function') ? (B.decisionFor(node.id) || null) : null;
            } catch (e) { return null; } })();
            node._budgetMargin = {
                state: achieved > target * (1 + TOLV) ? 'over-committed'
                     : achieved < target * (1 - TOLV) ? ((decV && decV.kind === 'reserve') ? 'reserve' : 'under-allocated')
                     : 'exact',
                target: target, achieved: achieved, mode: 'VOTING',
                constrainedCount: childExt.filter(function (e) { return e !== null; }).length,
                freeCount: childExt.filter(function (e) { return e === null; }).length,
                decisionId: decV ? decV.id : null
            };
        } catch (e) { /* margin is advisory — never break allocation */ }
    }
}

// 13 Oct 2026 (math audit F4 / F5): calcBottomUp is the gate-by-gate number (the headline on a
// tree without repeated events). It now carries each node's value at the points of the shared
// inspection-cycle grid (one point when no two periodic latent events share an interval, which
// reproduces the old arithmetic bit for bit), so latent events inspected at the same check are
// time-averaged jointly (lambda1*lambda2*tau^2/3 under AND, not tau^2/4). FDEP dependents count
// as failed when their trigger fails, and PAND / SPARE gates are solved exactly when they are an
// independent module of constant-rate basic events, else they hold the conservative bound. The
// rules are the same ones the BDD (buildBDDFromFT) applies; see the block above _bddCombinations.
function _cbuContext(root) {
    const lidCount = new Map(), periodic = new Map(), seen = new Set(), pages = new Set();
    let hasFdep = false;
    (function walk(n) {
        if (!n || seen.has(n)) return;   // F1: by the node itself, not its id
        seen.add(n);
        if (n.type !== 'gate') {
            const lid = n.logicalId != null ? n.logicalId : n.id;
            lidCount.set(lid, (lidCount.get(lid) || 0) + 1);
            const tau = parseFloat(n.tau);
            if (n.repairModel === 'periodic' && isFinite(tau) && tau > 0 && !n.markovModelId && n.eventClass !== 'dev-error' && _dynHasRate(n)) {
                if (!periodic.has(tau)) periodic.set(tau, new Set());
                periodic.get(tau).add(lid);
            }
            return;
        }
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !pages.has(linkedId)) {
                pages.add(linkedId);
                const page = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages.find(p => p.id === linkedId) : null;
                if (page && page.root) walk(page.root);
            }
            return;
        }
        if (n.gateType === 'FDEP') hasFdep = true;
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(root);
    const dims = [];
    periodic.forEach((lids, tau) => { if (lids.size >= 2) dims.push({ tau, K: Math.floor(lids.size / 2) + 1 }); });
    dims.sort((a, b) => a.tau - b.tau);
    let total = 1;
    dims.forEach(d => { total *= d.K; });
    const bound = total > 4096;
    let pts = [{ w: 1, s: new Map() }];
    if (!bound) dims.forEach(d => {
        const r = _glRule(d.K), next = [];
        pts.forEach(pt => { for (let k = 0; k < d.K; k++) { const s = new Map(pt.s); s.set(d.tau, r.x[k]); next.push({ w: pt.w * r.w[k], s }); } });
        pts = next;
    });
    return { pts, K: pts.length, taus: new Set(dims.map(d => d.tau)), bound, lidCount, fdep: hasFdep ? _collectFdep(root) : { byLid: new Map(), byGate: new Map(), gates: [] }, prof: new Map(), forcing: new Set(), unset: new Set(), forcedIn: new Map(), root };
}
function _cbuConst(ctx, p) { const v = new Array(ctx.K); for (let k = 0; k < ctx.K; k++) v[k] = p; return v; }
function _cbuMean(ctx, v) { if (ctx.K === 1) return v[0]; let s = 0; for (let k = 0; k < ctx.K; k++) s += ctx.pts[k].w * v[k]; return s; }
function _cbuForce(ctx, v, triggers, key, visited) {
    if (ctx.forcing.has(key)) return v;
    ctx.forcing.add(key);
    const out = v.slice();
    triggers.forEach(t => {
        const tv = _cbuNode(t, visited, ctx);
        for (let k = 0; k < ctx.K; k++) out[k] = 1 - (1 - out[k]) * (1 - tv[k]);
    });
    ctx.forcing.delete(key);
    return out;
}
function _cbuLeafVec(node, ctx) {
    const p = node.probability || 0;
    const tau = parseFloat(node.tau);
    if (ctx.K > 1 || ctx.bound) {
        if (ctx.taus.has(tau) && _periodicTau(node) === tau) {
            if (ctx.bound) return _cbuConst(ctx, Math.min(1, 2 * p));
            const v = new Array(ctx.K);
            for (let k = 0; k < ctx.K; k++) v[k] = Math.min(1, p * 2 * ctx.pts[k].s.get(tau));
            return v;
        }
    }
    return _cbuConst(ctx, p);
}
function _cbuDyn(node, kids, vecs, ctx) {
    const isSpare = node.gateType === 'SPARE';
    const ps = isSpare ? _spareSwitchP(node) : 1;
    const warmK = isSpare ? _spareWarmK(node) : 0;
    const info = { mode: 'bound', reason: '', exact: null, bound: null, switchP: ps, warmK };
    const xs = [], probs = [], lids = new Set();
    for (let i = 0; i < kids.length && !info.reason; i++) {
        const k = kids[i];
        const nm = k ? (k.displayId || k.name || String(k.id)) : '?';
        if (!k || k.type === 'gate') { info.reason = 'input ' + nm + ' is a gate, not a single basic event'; break; }
        const lid = k.logicalId != null ? k.logicalId : k.id;
        if (lids.has(lid)) { info.reason = 'input ' + nm + ' is entered twice'; break; }
        lids.add(lid);
        if ((ctx.lidCount.get(lid) || 0) !== 1) { info.reason = 'input ' + nm + ' also appears elsewhere in the tree'; break; }
        if (ctx.fdep.byLid.has(lid)) { info.reason = 'input ' + nm + ' is forced by a functional dependency'; break; }
        if (k.ccfGroup && k.beta > 0) { info.reason = 'input ' + nm + ' is in a common cause group'; break; }
        const x = _dynRateLeaf(k);
        if (x == null) { info.reason = 'input ' + nm + ' has no constant failure rate over the whole mission (probability only, repair model, latent or phase exposure)'; break; }
        xs.push(x); probs.push(k.probability);
    }
    if (!info.reason && kids.length < 2) info.reason = 'fewer than two inputs';
    if (!info.reason) {
        const exact = isSpare ? _spareExactProb(xs, warmK, ps) : (node.gateType === 'SEQ' ? _seqExactProb(xs) : _pandExactProb(xs));
        const bound = isSpare ? _spareBoundProb(probs, ps) : probs.reduce((a, b) => a * b, 1);
        if (exact == null) info.reason = 'too many inputs to solve exactly';
        else if (exact > bound * (1 + 1e-9) && bound > 0) info.reason = 'standby factor above 1';
        else { info.mode = 'exact'; info.exact = exact; info.bound = bound; }
    }
    node._dynStatic = info;
    if (info.mode === 'exact') return _cbuConst(ctx, info.exact);
    if (warmK > 1) return vecs[0].slice();
    const out = new Array(ctx.K);
    for (let k = 0; k < ctx.K; k++) {
        const pk = vecs.map(v => v[k]);
        out[k] = isSpare ? _spareBoundProb(pk, ps) : pk.reduce((a, b) => a * b, 1);
    }
    return out;
}
function _cbuNode(node, visited, ctx) {
    if (!node) return _cbuConst(ctx, 0);
    if (node.type !== 'gate') {
        const lid = node.logicalId != null ? node.logicalId : node.id;
        let v = ctx.prof.get(node);
        if (!v) {
            if (!visited.has(node)) {
                visited.add(node);
                // Phase 61: a leaf with no rate data (no λ, no Markov model) holds an allocated
                // probability BUDGET (or a directly-set value, e.g. a house event); that stored
                // probability is authoritative and must not be wiped by the λ→P conversion.
                // Leaves with real rate data (verification trees) compute P from λ + repair model.
                const _lamEff = (typeof getEffectiveLambda === 'function') ? (getEffectiveLambda(node) || 0) : (node.lambda || 0);
                if (!(_lamEff > 0) && !node.markovModelId) node.probability = node.probability || 0;
                else node.probability = effectiveProb(node, ftaConfig.exposureTime);
            }
            v = _cbuLeafVec(node, ctx);
            ctx.prof.set(node, v);
        }
        const trig = ctx.fdep.byLid.get(lid);
        return trig ? _cbuForce(ctx, v, trig, 'l:' + lid, visited) : v;
    }
    if (visited.has(node)) return ctx.prof.get(node) || _cbuConst(ctx, node.probability || 0);
    visited.add(node);
    let v = _cbuGate(node, visited, ctx);
    if (v === null) { ctx.unset.add(node); return _cbuConst(ctx, 0); }
    const gtrig = ctx.fdep.byGate.get(node.id);
    // A functional dependency makes its trigger a shared event of every dependent, which the
    // gate-by-gate product cannot see (it would multiply the trigger in twice). A gate whose
    // subtree holds a forced event therefore takes the exact BDD value, FDEPs from the whole tree
    // in scope. A prescribed (engineer-asserted) gate keeps its asserted value.
    const prescribed = (typeof _getPrescribedTarget === 'function') ? _getPrescribedTarget(node) : null;
    if (ctx.fdep.gates.length && node.gateType !== 'FDEP' && !(prescribed !== null && isFinite(prescribed))
        && _cbuForcedIn(node, ctx) && typeof computeExactProbability === 'function') {
        let ex = null;
        try { ex = computeExactProbability(node, ctx.root).prob; } catch (e) { ex = null; }
        if (ex !== null && isFinite(ex)) { v = _cbuConst(ctx, ex); node.probability = ex; }
        else if (gtrig) { v = _cbuForce(ctx, v, gtrig, 'g:' + node.id, visited); node.probability = _cbuMean(ctx, v); }
    } else if (gtrig) { v = _cbuForce(ctx, v, gtrig, 'g:' + node.id, visited); node.probability = _cbuMean(ctx, v); }
    ctx.prof.set(node, v);
    return v;
}
function _cbuForcedIn(node, ctx) {
    if (!node) return false;
    if (ctx.forcedIn.has(node)) return ctx.forcedIn.get(node);
    ctx.forcedIn.set(node, false);
    let r = false;
    if (node.type !== 'gate') r = ctx.fdep.byLid.has(node.logicalId != null ? node.logicalId : node.id);
    else if (node.gateType === 'FDEP') r = false;
    else if (ctx.fdep.byGate.has(node.id)) r = true;
    else if (node.gateType === 'TRANSFER' || node.transferOutTo) {
        const linkedId = node.transferOutTo || node.linkedPageId;
        const page = (linkedId && typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages.find(p => p.id === linkedId) : null;
        r = !!(page && page.root && _cbuForcedIn(page.root, ctx));
        if (!r && node.gateType !== 'TRANSFER') r = (node.children || node._children || []).some(c => _cbuForcedIn(c, ctx));
    }
    else r = (node.children || node._children || []).some(c => _cbuForcedIn(c, ctx));
    ctx.forcedIn.set(node, r);
    return r;
}
// Returns the gate's grid vector (and sets node.probability to its mean), or null for the
// legacy "no children / unresolved transfer → 0, probability untouched" cases.
function _cbuGate(node, visited, ctx) {
    // Phase 56.39d — Prescribed gate: value is engineer-asserted. Children
    // still calc bottom-up so divergence can be surfaced for DER review.
    if (typeof _getPrescribedTarget === 'function') {
        const pr = _getPrescribedTarget(node);
        if (pr !== null && isFinite(pr)) {
            const kids = node.children || node._children;
            if (kids && kids.length) {
                const childProbs = kids.map(c => _cbuMean(ctx, _cbuNode(c, visited, ctx)));
                let childImplied = 0;
                if (node.gateType === 'OR') childImplied = 1 - childProbs.reduce((a, b) => a * (1 - b), 1);
                else if (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE' || node.gateType === 'SEQ') childImplied = childProbs.reduce((a, b) => a * b, 1);
                else if (node.gateType === 'NOT') childImplied = childProbs.reduce((a, b) => a * (1 - b), 1);
                else childImplied = childProbs.reduce((a, b) => Math.max(a, b), 0);
                node._prescribedDivergence = (childImplied > 0 && Math.abs(Math.log10(childImplied / pr)) > 0.3)
                    ? { childImplied: childImplied, prescribed: pr, decadeDelta: Math.log10(childImplied / pr) }
                    : null;
            } else {
                delete node._prescribedDivergence;
            }
            node.probability = pr;
            return _cbuConst(ctx, pr);
        }
    }
    // Pure TRANSFER and logical-gate-with-transferOutTo both resolve to a linked page's root.
    if (node.gateType === 'TRANSFER' || node.transferOutTo) {
        const linkedId = node.transferOutTo || node.linkedPageId;
        if (linkedId) {
            const linkedPage = ftaPages.find(p => p.id === linkedId);
            if (linkedPage && linkedPage.root) { const lv = _cbuNode(linkedPage.root, visited, ctx); node.probability = _cbuMean(ctx, lv); return lv; }
        }
        if (node.gateType === 'TRANSFER') { node.probability = 0; return _cbuConst(ctx, 0); }
        // For a transfer-out logical gate with a missing destination, fall through to use its own (empty) children.
    }
    const actualChildren = node.children || node._children;
    if (!actualChildren || actualChildren.length === 0) return null;
    const vecs = actualChildren.map(c => _cbuNode(c, visited, ctx));
    let out;
    if (node.gateType === 'AND' || node.gateType === 'INHIBIT') {
        out = new Array(ctx.K);
        for (let k = 0; k < ctx.K; k++) out[k] = vecs.reduce((a, v) => a * v[k], 1);
    }
    else if (node.gateType === 'PAND' || node.gateType === 'SPARE' || node.gateType === 'SEQ') out = _cbuDyn(node, actualChildren, vecs, ctx);
    // 13 Oct 2026 (fix G): NOT (NOR over several inputs) = probability that no input occurs.
    else if (node.gateType === 'NOT') {
        out = new Array(ctx.K);
        for (let k = 0; k < ctx.K; k++) out[k] = vecs.reduce((a, v) => a * (1 - v[k]), 1);
    }
    // FDEP gates don't fail themselves: they force their dependents (see _cbuForce), counted where those are used.
    else if (node.gateType === 'FDEP') {
        node._dynStatic = { mode: 'fdep', dependents: actualChildren.length - 1 };
        out = _cbuConst(ctx, 0);
    }
    else if (node.gateType === 'OR') {
        out = new Array(ctx.K);
        for (let k = 0; k < ctx.K; k++) out[k] = 1 - vecs.reduce((a, v) => a * (1 - v[k]), 1);
    }
    else if (node.gateType === 'VOTING' || node.gateType === 'XOR') {
        out = new Array(ctx.K);
        for (let kk = 0; kk < ctx.K; kk++) {
            const probs = vecs.map(v => v[kk]);
            const dp = new Array(probs.length + 1).fill(0); dp[0] = 1.0;
            for (const p of probs) {
                for (let i = probs.length; i >= 1; i--) dp[i] = dp[i] * (1 - p) + dp[i - 1] * p;
                dp[0] = dp[0] * (1 - p);
            }
            if (node.gateType === 'XOR') out[kk] = dp[1];
            else { const k = Math.min(node.votingK || 2, probs.length); let sum = 0; for (let i = k; i <= probs.length; i++) sum += dp[i]; out[kk] = sum; }  /* Phase 44: default K=2 (not 1, which would degrade VOTING to OR). */
        }
    }
    else { return _cbuConst(ctx, node.probability || 0); }
    node.probability = _cbuMean(ctx, out);
    return out;
}
function calcBottomUp(node, visited = new Set()) {
    if (!node) return 0;
    if (visited.has(node)) return node.probability || 0;
    const ctx = _cbuContext(node);
    _cbuNode(node, visited, ctx);
    if (node.type === 'gate' && ctx.unset.has(node)) return 0;
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

// Phase 66.19 — PROJECT-WIDE STRICTEST-ACROSS-TREES ROUND.
// Two allocation rounds: the first gives every root tree its NATURAL apportionment
// (all shared-strictest marks cleared first, so the pass can never ratchet on its own
// output), the pass then computes the strictest rate per shared event and caps the
// looser instances, and the second round re-allocates with those caps in place — which
// is where the free siblings pick up the released budget, through the external-rebalance
// branch that already existed.
//
// Only ROOT pages are allocated here. A page reached through a transfer gate is
// allocated by its parent's recursion; allocating it independently would overwrite the
// seed it inherits from the parent stub.
let _slStrictestBusy = false;
function _slRootAllocationPages() {
    if (typeof ftaPages === 'undefined' || !Array.isArray(ftaPages)) return [];
    const transferTargets = new Set();
    ftaPages.forEach(function (p) {
        if (!p || !p.root) return;
        (function walk(n) {
            if (!n) return;
            const t = n.transferOutTo || (n.gateType === 'TRANSFER' ? n.linkedPageId : null);
            if (t) transferTargets.add(t);
            (n.children || n._children || []).forEach(walk);
        })(p.root);
    });
    return ftaPages.filter(function (p) {
        if (!p || !p.root || p.verifies) return false;        // allocation pages only
        if (p.mode === 'bottom-up') return false;             // verification-side pages allocate nothing
        if (transferTargets.has(p.id)) return false;          // reached from a parent stub
        const t = parseFloat(p.targetP);
        return isFinite(t) && t > 0;
    });
}
function _slAllocateRootPages(pages) {
    pages.forEach(function (p) {
        try { allocateTopDown(p.root, parseFloat(p.targetP), ftaConfig.apportion, new Set()); } catch (_) {}
    });
}
function _slSharedStrictestRound() {
    if (_slStrictestBusy) return null;
    if (typeof slSharedStrictestPass !== 'function' || typeof slClearSharedStrictest !== 'function') return null;
    const pages = _slRootAllocationPages();
    if (pages.length < 2) return null;                        // nothing to share between
    _slStrictestBusy = true;
    try {
        slClearSharedStrictest();
        _slAllocateRootPages(pages);                          // natural apportionment
        const res = slSharedStrictestPass();
        if (res && res.capped) _slAllocateRootPages(pages);   // re-allocate under the caps
        return res;
    } catch (_) { return null; }
    finally { _slStrictestBusy = false; }
}
try { window._slSharedStrictestRound = _slSharedStrictestRound; } catch (_) {}

// 13 Oct 2026 (math audit F1): see the note inside calculateAllProbabilities.
function _slAllocationRolePageIds() {
    const ids = new Set();
    const pages = (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : [];
    pages.forEach(p => { if (p && p.mode === 'top-down') ids.add(p.id); });
    if (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.mode === 'top-down') {
        const active = pages.find(p => p && p.id === activeFTAPageId);
        const rootPage = (typeof getRootAncestorPageOfActive === 'function') ? (getRootAncestorPageOfActive() || active) : active;
        const seen = new Set();
        (function reach(page) {
            if (!page || seen.has(page.id)) return;
            seen.add(page.id); ids.add(page.id);
            (function walk(n) {
                if (!n) return;
                if (n.gateType === 'TRANSFER' || n.transferOutTo) {
                    const linked = n.transferOutTo || n.linkedPageId;
                    if (linked) reach(pages.find(p => p && p.id === linked));
                }
                (n.children || n._children || []).forEach(walk);
            })(page.root);
        })(rootPage);
        if (active) ids.add(active.id);
    }
    return ids;
}
function _slExactTopOrNull(rootNode) {
    try {
        const p = (typeof exactTopProbability === 'function') ? exactTopProbability(rootNode) : computeExactProbability(rootNode).prob;
        return (typeof p === 'number' && isFinite(p) && p >= 0) ? p : null;
    } catch (_) { return null; }
}
// 28 Oct 2026 (Waqas: "once they confirm there is no independence that is when the beta factors apply"; agreed rule,
// with "None, no claim" counting as compromised): common cause in an ALLOCATION tree follows the independence of the
// AND gate where its members meet.
//   - compromised (set by hand, or a Common Mode Analysis finding) or "None, no claim": the group's beta / MGL terms
//     are part of the allocation. The tree is closed against its exact total with the common cause counted
//     (mcsAwareRebalance), so the members' budgets tighten, and the gate says why (_ccfAlloc).
//   - claimed or substantiated: the group is left out of the allocation tree's exact total, as ruled on 12 Oct 2026
//     (allocation comes before the design; the AND gate derives an independence requirement instead). No more
//     "tree adds up to 130 times its target" from a beta the engineer has not been asked to carry.
// Verification trees are not touched: they always count every common cause group.
// A group counts when any two of its members meet (lowest common gate) at an AND, INHIBIT or k-of-n (k >= 2) VOTING
// gate whose independence is compromised or none. TRANSFER links are followed, as everywhere in allocation.
function _allocAndLike(g) {
    if (!g || g.type !== 'gate') return false;
    if (g.gateType === 'AND' || g.gateType === 'INHIBIT') return true;
    if (g.gateType === 'VOTING') { const n = (g.children || g._children || []).length; return Math.min(parseInt(g.votingK, 10) || 2, n) >= 2; }
    return false;
}
function _allocIndepState(g, cmaIdx) {
    const raw = g && g.dalIndependence;
    if (raw === 'compromised' || (g && g._dalCompromised)) return 'compromised';
    try {
        const ids = cmaIdx ? (cmaIdx.ids || (typeof cmaIdx.has === 'function' ? cmaIdx : null)) : null;
        if (ids && ids.has(String(g.id))) return 'compromised';
        const pairs = (cmaIdx && cmaIdx.pairs && cmaIdx.pairs.size) ? cmaIdx.pairs : null;
        if (pairs) {
            const lids = (g.children || g._children || []).map(c => String(c.logicalId != null ? c.logicalId : c.id));
            for (let i = 0; i < lids.length; i++) for (let j = i + 1; j < lids.length; j++) if (pairs.get([lids[i], lids[j]].sort().join('|'))) return 'compromised';
        }
    } catch (_) {}
    if (raw === 'none') return 'none';
    return raw === 'substantiated' ? 'substantiated' : 'claimed';
}
// The common cause groups of one allocation tree and whether each counts. Returns
// { counted: [{ group, beta, gate, gateLabel, state }], excluded: [{ group, members }] }.
function _allocCcfPlan(rootNode) {
    const out = { counted: [], excluded: [] };
    if (!rootNode) return out;
    let cmaIdx = null;
    try { cmaIdx = (typeof _cmaCompromisedIndex === 'function') ? _cmaCompromisedIndex() : null; } catch (_) { cmaIdx = null; }
    const groups = new Map();   // group -> [{ node, chain: [gates from the root down] }]
    const visited = new Set();
    (function walk(n, chain) {
        if (!n) return;
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !visited.has(linkedId)) {
                visited.add(linkedId);
                const lp = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === linkedId) : null;
                if (lp && lp.root) walk(lp.root, chain);
            }
            return;
        }
        if (n.type !== 'gate') {
            if (n.ccfGroup) { if (!groups.has(n.ccfGroup)) groups.set(n.ccfGroup, []); groups.get(n.ccfGroup).push({ node: n, chain: chain }); }
            return;
        }
        const next = chain.concat([n]);
        (n.children || n._children || []).forEach(c => walk(c, next));
    })(rootNode, []);
    groups.forEach((members, group) => {
        let beta = 0;
        members.forEach(m => { const b = parseFloat(m.node.beta); if (isFinite(b) && b > beta) beta = b; });
        if (!(beta > 0) || members.length < 2) return;   // no common cause modeled: nothing to decide
        let hit = null;
        for (let i = 0; i < members.length && !hit; i++) for (let j = i + 1; j < members.length && !hit; j++) {
            const a = members[i].chain, b = members[j].chain;
            let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
            const meet = k > 0 ? a[k - 1] : null;
            if (meet && _allocAndLike(meet)) {
                const st = _allocIndepState(meet, cmaIdx);
                if (st === 'compromised' || st === 'none') hit = { gate: meet, state: st };
            }
        }
        if (hit) out.counted.push({ group: group, beta: beta, gate: hit.gate, gateLabel: String(hit.gate.displayId || hit.gate.name || hit.gate.id), state: hit.state });
        else out.excluded.push({ group: group, members: members.map(m => m.node) });
    });
    return out;
}
// Run fn with the allocation view of the tree: the groups that do not count are taken out for the duration (their
// members' ccfGroup set aside and put back, whatever happens). The P(top) cache keys on ccfGroup, so the two views
// never share an answer.
function _withAllocCcfView(rootNode, fn, plan) {
    plan = plan || _allocCcfPlan(rootNode);
    const held = [];
    plan.excluded.forEach(x => x.members.forEach(n => { held.push([n, n.ccfGroup]); delete n.ccfGroup; }));
    try { return fn(plan); }
    finally { held.forEach(h => { h[0].ccfGroup = h[1]; }); }
}
// What each counted group says on its gate and on the top event (the warning pill reads _ccfAlloc).
function _markAllocCcf(rootNode, plan) {
    const visited = new Set();
    (function clear(n) {
        if (!n) return;
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !visited.has(linkedId)) { visited.add(linkedId); const lp = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === linkedId) : null; if (lp && lp.root) clear(lp.root); }
            return;
        }
        delete n._ccfAlloc;
        (n.children || n._children || []).forEach(clear);
    })(rootNode);
    delete rootNode._ccfAllocAll;
    if (!plan || !plan.counted.length) return;
    plan.counted.forEach(c => {
        const why = c.state === 'none' ? 'no independence claim' : 'independence compromised';
        const note = { group: c.group, beta: c.beta, state: c.state, gate: c.gateLabel,
            text: 'Common cause counted at ' + c.gateLabel + ' (beta ' + Number(c.beta) + ', group ' + c.group + '): ' + why + '. The budgets are set so the total, common cause included, meets the target.' };
        if (!Array.isArray(c.gate._ccfAlloc)) c.gate._ccfAlloc = [];
        c.gate._ccfAlloc.push(note);
        if (!Array.isArray(rootNode._ccfAllocAll)) rootNode._ccfAllocAll = [];
        rootNode._ccfAllocAll.push(note);
    });
}
try { window._allocCcfPlan = _allocCcfPlan; window._withAllocCcfView = _withAllocCcfView; window._allocIndepState = _allocIndepState; } catch (_) {}

function _slApplyExactTops() {
    if (typeof computeExactProbability !== 'function' || typeof ftaPages === 'undefined' || !Array.isArray(ftaPages)) return;
    const activePage = ftaPages.find(p => p && p.id === activeFTAPageId) || null;
    // Display normalization of intermediate gates on the open page (Phase 56.44), unchanged.
    if (activePage && activePage.root && typeof _hasRepeatedLogicalIds === 'function' && _hasRepeatedLogicalIds(activePage.root)) {
        if (typeof _flagGatesWithSharedSubtreeEvents === 'function') _flagGatesWithSharedSubtreeEvents(activePage.root);
        if (typeof _normalizeIntermediateGatesForSharedEvents === 'function') _normalizeIntermediateGatesForSharedEvents(activePage.root);
    }
    const t = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) ? ftaConfig.exposureTime : 1;
    const allocIds = _slAllocationRolePageIds();
    const topDownActive = typeof ftaConfig === 'object' && ftaConfig && ftaConfig.mode === 'top-down';
    ftaPages.forEach(page => {
        if (!page || !page.root || page.root.type !== 'gate') return;
        const r = page.root;
        const isOpen = !!activePage && page.id === activePage.id;
        if (allocIds.has(page.id)) {
            // Allocation role: the engineer's budget stays on the root.
            delete r._bddExactProb; delete r._bddBottomUpProb; delete r._exactTopRefused; delete r._topIsRollup;
            if (topDownActive && isOpen) {
                const exact = _withAllocCcfView(r, () => _slExactTopOrNull(r));   // 28 Oct 2026: common cause by the gate's independence
                if (exact != null) { r._bddActualProb = exact; r._bddTargetProb = r.probability; }
                else { delete r._bddActualProb; delete r._bddTargetProb; }
                delete r._bddActualLambda;   // Phase 61 — probability-only in allocation mode
            }
            return;
        }
        delete r._bddActualProb; delete r._bddActualLambda; delete r._bddTargetProb;
        if (!isOpen) {
            // Result page that is not on screen: lazy compute (8 Sep 2026 directive), nothing
            // is computed for it here. Its root keeps whatever the last roll-up left and is
            // MARKED as such; no verdict reads it (they call SLTopBasis.exactTop, cached), and
            // the moment the page is opened it gets the exact value below.
            if (r._bddExactProb !== r.probability) { r._topIsRollup = true; delete r._bddExactProb; delete r._bddBottomUpProb; }
            return;
        }
        // The open result page: the exact top replaces the gate-by-gate roll-up.
        const naive = r.probability;
        const exact = _slExactTopOrNull(r);
        delete r._topIsRollup;
        if (exact == null) { r._exactTopRefused = true; r._topIsRollup = true; delete r._bddExactProb; delete r._bddBottomUpProb; return; }
        delete r._exactTopRefused;
        r._bddExactProb = exact;
        r._bddBottomUpProb = naive;
        r.probability = exact;
        r.lambda = (exact > 0 && exact < 1) ? (-Math.log1p(-exact) / t) : 0;
    });
}

function calculateAllProbabilities() {
    if (ftaConfig.mode === 'top-down') {
        // Phase 66.19 — resolve shared events across every tree BEFORE this page is
        // apportioned, so the active tree already sees any cap its events carry.
        try { _slSharedStrictestRound(); } catch (_) {}
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
            delete rootPage.root._exactCloseRefused;
            // 27 Oct 2026: not only a repeated event: an FDEP or a NOT gate also make the exact total
            // differ from the split (_allocNeedsExactClose). 28 Oct 2026: and a common cause group whose
            // members meet at an AND gate with no independence claim, or a compromised one (_allocCcfPlan);
            // the close then runs in the allocation view, which leaves out the groups that do not count.
            const _ccfPlan = _allocCcfPlan(rootPage.root);
            _markAllocCcf(rootPage.root, _ccfPlan);
            if (typeof _allocNeedsExactClose === 'function'
                && (_allocNeedsExactClose(rootPage.root) || _ccfPlan.counted.length > 0)
                && typeof mcsAwareRebalance === 'function'
                && typeof computeExactProbability === 'function') _withAllocCcfView(rootPage.root, () => {
                // ENG-1 — BDD-aware rebalance is an ENHANCEMENT over strictest-
                // propagation. If the BDD refuses (node budget on adversarial
                // repeated-event structure), fall back to the same documented
                // path used when the BDD engine is unavailable — never let an
                // allocation render die on a refusal.
                try {
                    rebalanced = mcsAwareRebalance(rootPage.root, tc.topProbAtExposure);
                    // Phase 56.46 — After uniform-scale rebalance closes the budget,
                    // redistribute by Birnbaum importance so dominant cutset members
                    // carry tighter rates while marginal contributors relax. Skips
                    // for trees with >30 unique variables (latency guard).
                    if (rebalanced && typeof mcsAwareImportanceRedistribute === 'function') {
                        mcsAwareImportanceRedistribute(rootPage.root, tc.topProbAtExposure);
                    }
                } catch (e) {
                    if (!(e && e.name === 'BDDExplosionError')) throw e;
                    rebalanced = false;   // → strictest-propagation fallback below
                    rootPage.root._exactCloseRefused = true;   // 27 Oct 2026: the warning pill says so
                }
            }, _ccfPlan);
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
    // 13 Oct 2026 (math audit F1): ONE EXACT TOP.
    // Before today the BDD value replaced the gate-by-gate roll-up only when the open
    // tree had repeated logicalIds. A common cause (beta) group has no repeated ids,
    // so its term never reached root.probability, and the pass/fail screens read
    // root.probability on pages that were not open, where it was always the
    // independent roll-up (T4: 1.0e-8 shown against an exact 5.0e-6). Now:
    //   - every pass/fail screen calls SLTopBasis.exactTop (top_basis.js): the cached
    //     BDD with common cause and shared events, on any page, open or not. None of
    //     them reads root.probability any more.
    //   - the OPEN result page (bottom-up / verification) shows that exact value on its
    //     root, always (common cause included, not only with repeated ids); the
    //     gate-by-gate value stays on root._bddBottomUpProb for transparency.
    //   - the OPEN allocation page keeps the engineer's budget on its root and carries
    //     the exact reconstruction on root._bddActualProb ("Actual" on the canvas when
    //     it differs from the target by more than 1%).
    //   - pages NOT on screen are not computed here (lazy compute, 8 Sep 2026): their
    //     root is marked _topIsRollup until the page is opened.
    //   - intermediate gates keep their gate-by-gate value (display only), with the
    //     existing shared-event normalization on the open page.
    // A BDD refusal keeps the roll-up on screen, marks root._exactTopRefused, and the
    // verdict screens withhold a verdict.
    try { _slApplyExactTops(); } catch (e) { /* BDD optional at runtime; never break a recompute */ }
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
// ── 13 Oct 2026 (math audit F4 / F5): dynamic gates and periodic latent events in the
// STATIC number. Pure functions of node fields and baked probabilities (no app state), kept
// identical in fta_engine.js and fta_quant_modules.js (regression_engine_parity holds them).
//
// FDEP. A functional dependency (kids[0] = trigger, kids[1..] = dependents) is the standard
// static reduction: every occurrence of a dependent becomes OR(dependent, trigger). Exact for
// the static gates (a dependent is failed by T exactly when it failed on its own or its trigger
// did). The FDEP gate itself still outputs nothing.
//
// SPARE / PAND. The static structure is the gate's conservative bound: PAND = AND of its inputs;
// SPARE = primary AND (switch-1 fails OR (spare-1 AND (switch-2 fails OR (spare-2 AND ...)))),
// where "switch-j fails" is a visible event with probability 1 - switch success. When every
// input is a basic event with a constant failure rate over the mission, used nowhere else in
// the tree, the gate is an independent dynamic module and is solved EXACTLY as a Markov chain
// (the same model the DFT Monte Carlo samples: cold/warm standby, switch success on demand,
// strict order for PAND). The bound is then multiplied by a time-order factor
// (exact / bound, never above 1) carried as one BDD variable ANDed onto the gate, so P(top) is
// exact and the cut sets keep their real members. Otherwise the bound stands and the gate says
// it is an upper bound.
//
// Periodic latent events (repairModel 'periodic', interval tau, mean lambda*tau/2). Events with
// the SAME interval are taken to be inspected at the same check, so their unavailabilities rise
// together: q_i(t) = lambda_i * t over the cycle. The static number is the time average of
// P(top) over the cycle, (1/tau) * integral P(top | q(t)) dt, evaluated exactly with
// Gauss-Legendre points (P(top) is a polynomial in t of degree <= the number of such events, so
// floor(n/2) + 1 points are exact). Two events under AND give lambda1*lambda2*tau^2/3, the
// ARP4761A practice, instead of the product of the means (tau^2/4). A single periodic event,
// or one combined with active per-flight events, keeps exactly its old value (the average of a
// linear term is its mean). Different intervals stay independent of each other, as before.
function _dynHasRate(n) {
    if (parseFloat(n.lambda) > 0) return true;
    const lp = n.lambdaByPhase;
    return !!(lp && typeof lp === 'object' && Object.keys(lp).some(function (k) { return parseFloat(lp[k]) > 0; }));
}
function _dynRateLeaf(n) {
    if (!n || n.type === 'gate' || n.eventClass === 'dev-error' || n.markovModelId) return null;
    const model = n.repairModel || 'unmaintained';
    if (model === 'continuous' && ((n.mu || 0) > 0)) return null;
    if (model === 'periodic' && ((n.tau || 0) > 0)) return null;
    if ((n.exposureMode || 'continuous') !== 'continuous') return null;
    if (!_dynHasRate(n)) return null;
    const p = n.probability;
    if (typeof p !== 'number' || !isFinite(p) || p < 0 || p >= 1) return null;
    return -Math.log1p(-p);
}
function _periodicTau(n) {
    if (!n || n.type === 'gate' || n.eventClass === 'dev-error' || n.markovModelId || n._synthetic) return 0;
    if (n.repairModel !== 'periodic') return 0;
    const tau = parseFloat(n.tau);
    if (!(isFinite(tau) && tau > 0)) return 0;
    if (!_dynHasRate(n)) return 0;
    const p = n.probability;
    if (typeof p !== 'number' || !(p > 0) || p > 0.5) return 0;
    return tau;
}
function _ctmcFailProb(nStates, trans, failState) {
    const out = new Float64Array(nStates);
    for (let i = 0; i < trans.length; i++) out[trans[i][0]] += trans[i][2];
    let L = 0;
    for (let i = 0; i < nStates; i++) if (out[i] > L) L = out[i];
    if (!(L > 0)) return 0;
    let v = new Float64Array(nStates); v[0] = 1;
    const logL = Math.log(L);
    let logw = -L, p = 0;
    const nMax = Math.ceil(L + 12 * Math.sqrt(L) + 60) + nStates;
    for (let n = 0; n <= nMax; n++) {
        if (n > 0) {
            const nv = new Float64Array(nStates);
            for (let i = 0; i < nStates; i++) nv[i] = v[i] * (1 - out[i] / L);
            for (let i = 0; i < trans.length; i++) { const t = trans[i]; nv[t[1]] += v[t[0]] * (t[2] / L); }
            v = nv;
            logw += logL - Math.log(n);
        }
        p += Math.exp(logw) * v[failState];
        if (n >= nStates && n + 2 > L) {
            const tail = Math.exp(logw + logL - Math.log(n + 1)) / (1 - L / (n + 2));
            if (p > 0 ? tail <= 1e-17 * p : tail < 1e-300) break;
        }
    }
    return Math.min(1, p);
}
function _spareExactProb(xs, warmK, ps) {
    const m = xs.length - 1;
    if (m < 1 || m > 8) return null;
    let full = 0;
    for (let b = 1; b <= m; b++) full |= (1 << b);
    const idx = new Map(), states = [], pend = [];
    const sid = function (i, mask) { const k = i * 1024 + mask; if (!idx.has(k)) { idx.set(k, states.length); states.push([i, mask]); } return idx.get(k); };
    sid(0, full);
    for (let s = 0; s < states.length; s++) {
        const i = states[s][0], mask = states[s][1];
        let j = -1;
        for (let b = i + 1; b <= m; b++) if (mask & (1 << b)) { j = b; break; }
        if (xs[i] > 0) {
            if (j < 0) pend.push([s, -1, xs[i]]);
            else {
                if (ps > 0) pend.push([s, sid(j, mask & ~(1 << j)), xs[i] * ps]);
                if (ps < 1) pend.push([s, -1, xs[i] * (1 - ps)]);
            }
        }
        if (warmK > 0) for (let b = i + 1; b <= m; b++) if ((mask & (1 << b)) && xs[b] > 0) pend.push([s, sid(i, mask & ~(1 << b)), warmK * xs[b]]);
    }
    const F = states.length;
    return _ctmcFailProb(F + 1, pend.map(function (t) { return [t[0], t[1] < 0 ? F : t[1], t[2]]; }), F);
}
function _pandExactProb(xs) {
    const n = xs.length;
    if (n < 2 || n > 64) return null;
    const trans = [];
    for (let k = 0; k < n; k++) {
        if (xs[k] > 0) trans.push([k, k + 1, xs[k]]);
        let later = 0;
        for (let j = k + 1; j < n; j++) later += xs[j];
        if (later > 0) trans.push([k, n + 1, later]);
    }
    return _ctmcFailProb(n + 2, trans, n);
}
function _spareBoundProb(probs, ps) {
    let r = 1;
    for (let j = probs.length - 1; j >= 1; j--) r = (1 - ps) + ps * probs[j] * r;
    return probs[0] * r;
}

// ── 13 Oct 2026 (hand-built fault trees, fix G): the SEQ and NOT gates ─────────────────────────
// SEQ (sequence-enforcing gate, the fourth standard dynamic gate): its inputs can only fail in
// left-to-right order (input i+1 cannot start failing until input i has failed); the output fails
// when all of them have failed. For an independent module of constant-rate basic events the time
// to failure is the sum of the inputs' lives: the pure-birth Markov chain 0 -> 1 -> ... -> n,
// solved exactly with the same uniformization as PAND and SPARE (the DFT Monte Carlo samples the
// same model). Otherwise the static number is the AND of the inputs: the lives can only sum to
// less than t if every one of them is less than t, so the AND product is an upper bound.
function _seqExactProb(xs) {
    const n = xs.length;
    if (n < 2 || n > 64) return null;
    const trans = [];
    for (let k = 0; k < n; k++) if (xs[k] > 0) trans.push([k, k + 1, xs[k]]);
    return _ctmcFailProb(n + 1, trans, n);
}
// NOT (IEC 61025): the output occurs when its input does NOT occur (several inputs: when none of
// them occurs, i.e. NOR). Non-coherent logic, allowed only when the project turns it on. The BDD
// is exact (BDD.not). Cut sets become PRIME IMPLICANTS: the smallest combinations of events that
// occur and events that do NOT occur ("NOT X") which cause the top event, found by iterated
// consensus with absorption over the BDD's disjoint paths (Blake canonical form, complete by
// Quine's theorem). Above _PRIME_BUDGET terms the list is refused with a plain message rather
// than shown incomplete; P(top) is unaffected (the BDD never enumerates terms).
var _PRIME_BUDGET = 2000;
function _treeHasNot(rootNode) {
    let has = false;
    const pages = new Set();
    (function walk(n, seen) {
        if (!n || has || seen.has(n)) return;
        seen.add(n);
        if (n.type !== 'gate') return;
        if (n.gateType === 'NOT') { has = true; return; }
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !pages.has(linkedId) && typeof ftaPages !== 'undefined' && ftaPages) {
                pages.add(linkedId);
                const lp = ftaPages.find(function (p) { return p && p.id === linkedId; });
                if (lp && lp.root) walk(lp.root, seen);
            }
            if (n.gateType === 'TRANSFER') return;
        }
        (n.children || n._children || []).forEach(function (c) { walk(c, seen); });
    })(rootNode, new Set());
    return has;
}
function _primeBudgetError(count) {
    const e = new Error('This fault tree uses NOT logic, so its cut sets are prime implicants (events that occur together with events that do not). It has more than ' + _PRIME_BUDGET.toLocaleString() + ' of them, so the list is not shown rather than shown incomplete. P(top) is still exact.');
    e.name = 'NonCoherentCutsetError';
    e.count = count;
    return e;
}
function _notLiteralNode(n) {
    const p = (n && typeof n.probability === 'number' && isFinite(n.probability)) ? n.probability : 0;
    const lid = n ? (n.logicalId != null ? n.logicalId : n.id) : '?';
    return { id: 'not:' + (n ? n.id : '?'), logicalId: 'not:' + lid, type: 'basic', probability: Math.max(0, Math.min(1, 1 - p)), children: [],
        _synthetic: 'not', _negated: true, negatedId: n ? n.id : null,
        displayId: 'NOT ' + ((n && (n.displayId || n.name)) || String(lid)),
        name: ((n && (n.name || n.displayId)) || 'event') + ' (does not occur)' };
}
function _bddPrimeImplicants(bdd, skip) {
    const terms = [];
    const subsumes = function (a, b) { if (a.size > b.size) return false; for (const [v, p] of a) if (b.get(v) !== p) return false; return true; };
    let live = [];
    const add = function (t) {
        for (let i = 0; i < live.length; i++) if (subsumes(live[i], t)) return false;
        live = live.filter(function (u) { return !subsumes(t, u); });
        live.push(t);
        if (live.length > _PRIME_BUDGET) throw _primeBudgetError(live.length);
        return true;
    };
    const lits = [];
    let paths = 0;
    (function go(n) {
        if (n === BDD.T0) return;
        if (n === BDD.T1) {
            const t = new Map();
            for (let i = 0; i < lits.length; i++) if (!(skip && skip(lits[i][0]))) t.set(lits[i][0], lits[i][1]);
            if (++paths > 4 * _PRIME_BUDGET) throw _primeBudgetError(paths);
            add(t);
            return;
        }
        lits.push([n.varIdx, false]); go(n.low); lits.pop();
        lits.push([n.varIdx, true]); go(n.high); lits.pop();
    })(bdd);
    let changed = true;
    while (changed) {
        changed = false;
        const snap = live.slice();
        for (let i = 0; i < snap.length; i++) {
            for (let j = i + 1; j < snap.length; j++) {
                const a = snap[i], b = snap[j];
                let opp = null, clash = false;
                for (const [v, p] of a) { if (b.has(v) && b.get(v) !== p) { if (opp !== null) { clash = true; break; } opp = v; } }
                if (clash || opp === null) continue;
                const c = new Map(a);
                for (const [v, p] of b) c.set(v, p);
                c.delete(opp);
                if (add(c)) changed = true;
            }
        }
    }
    const key = function (t) { return [...t.keys()].sort(function (x, y) { return x - y; }).map(function (v) { return (t.get(v) ? '+' : '-') + v; }).join(','); };
    live.forEach(function (t) { terms.push({ t: t, k: key(t) }); });
    terms.sort(function (a, b) { return (a.t.size - b.t.size) || (a.k < b.k ? -1 : (a.k > b.k ? 1 : 0)); });
    return terms.map(function (x) { return x.t; });
}
function _primeImplicantCutsets(rootNode) {
    const built = buildBDDFromFT(rootNode);
    if (!built.bdd || built.bdd === BDD.T0) return [];
    const skip = function (v) { return !!(built.varMeta[v] && built.varMeta[v].synthetic === 'order'); };
    return _bddPrimeImplicants(built.bdd, skip).map(function (t) {
        return [...t.keys()].sort(function (x, y) { return x - y; }).map(function (v) { return t.get(v) ? built.varOrder[v] : _notLiteralNode(built.varOrder[v]); });
    });
}
function _glRule(K) {
    const x = [], w = [];
    for (let i = 1; i <= K; i++) {
        let z = Math.cos(Math.PI * (i - 0.25) / (K + 0.5)), pp = 1;
        for (let it = 0; it < 100; it++) {
            let p1 = 1, p2 = 0;
            for (let j = 1; j <= K; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
            pp = K * (z * p1 - p2) / (z * z - 1);
            const z1 = z;
            z = z1 - p1 / pp;
            if (Math.abs(z - z1) < 1e-16) break;
        }
        x.push((1 - z) / 2);
        w.push(1 / ((1 - z * z) * pp * pp));
    }
    return { x: x, w: w };
}
function _periodicGrid(varOrder, varMeta) {
    const groups = new Map();
    for (let v = 0; v < varOrder.length; v++) {
        const meta = varMeta && varMeta[v];
        const n = (meta && (meta.node || meta.refNode)) || varOrder[v];
        const tau = (meta && meta.type === 'group' && meta.ccf) ? _mglEventTau(meta.ccf, meta.ccfIdx) : _periodicTau(n);
        if (!tau) continue;
        if (!groups.has(tau)) groups.set(tau, []);
        groups.get(tau).push(v);
    }
    const dims = [];
    groups.forEach(function (vars, tau) { if (vars.length >= 2) dims.push({ tau: tau, vars: vars, K: Math.floor(vars.length / 2) + 1 }); });
    if (!dims.length) return null;
    dims.sort(function (a, b) { return a.tau - b.tau; });
    let total = 1;
    dims.forEach(function (d) { total *= d.K; });
    if (total > 4096) {
        const f = [];
        dims.forEach(function (d) { d.vars.forEach(function (v) { f.push([v, 2]); }); });
        return { bound: true, groups: dims.map(function (d) { return { tau: d.tau, count: d.vars.length }; }), points: [{ w: 1, f: f }] };
    }
    let points = [{ w: 1, f: [] }];
    dims.forEach(function (d) {
        const r = _glRule(d.K), next = [];
        points.forEach(function (pt) {
            for (let k = 0; k < d.K; k++) {
                const f = pt.f.slice();
                d.vars.forEach(function (v) { f.push([v, 2 * r.x[k]]); });
                next.push({ w: pt.w * r.w[k], f: f });
            }
        });
        points = next;
    });
    return { bound: false, groups: dims.map(function (d) { return { tau: d.tau, count: d.vars.length }; }), points: points };
}
function _bddGridMaps(built, probMap) {
    const grid = built && built.grid;
    if (!grid) return [{ w: 1, map: probMap }];
    return grid.points.map(function (pt) {
        const m = new Map(probMap);
        for (let i = 0; i < pt.f.length; i++) m.set(pt.f[i][0], Math.min(1, (probMap.get(pt.f[i][0]) || 0) * pt.f[i][1]));
        return { w: pt.w, map: m };
    });
}
function _bddAvgProbability(built, probMap, fixVar, fixVal) {
    const pts = _bddGridMaps(built, probMap);
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
        let m = pts[i].map;
        if (fixVar != null) { m = new Map(m); m.set(fixVar, fixVal); }
        s += pts[i].w * BDD.probability(built.bdd, m);
    }
    return s;
}
function _collectFdep(scope) {
    const byLid = new Map(), byGate = new Map(), gates = [];
    const seen = new Set(), pages = new Set();
    (function walk(n) {
        if (!n || seen.has(n)) return;   // F1: by the node itself, not its id
        seen.add(n);
        if (n.type !== 'gate') return;
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !pages.has(linkedId)) {
                pages.add(linkedId);
                const page = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages.find(function (p) { return p.id === linkedId; }) : null;
                if (page && page.root) walk(page.root);
            }
            return;
        }
        const kids = n.children || n._children;
        if (n.gateType === 'FDEP' && kids && kids.length >= 2 && kids[0]) {
            gates.push(n);
            for (let i = 1; i < kids.length; i++) {
                const d = kids[i];
                if (!d) continue;
                const m = d.type === 'gate' ? byGate : byLid;
                const key = d.type === 'gate' ? d.id : (d.logicalId != null ? d.logicalId : d.id);
                if (!m.has(key)) m.set(key, []);
                if (m.get(key).indexOf(kids[0]) < 0) m.get(key).push(kids[0]);
            }
        }
        if (kids) kids.forEach(walk);
    })(scope);
    return { byLid: byLid, byGate: byGate, gates: gates };
}
function _dynSyntheticNode(gate, kind, j, p, spare) {
    const gid = gate.id;
    const label = gate.displayId || gate.name || gate.gateType;
    const id = 'dyn:' + gid + ':' + (kind === 'switch' ? 'sw' + j : 'order');
    return {
        id: id, logicalId: id, type: 'basic', probability: p, children: [], _synthetic: kind, _dynGateId: gid,
        displayId: kind === 'switch' ? label + '-SW' + j : label + ' order',
        name: kind === 'switch'
            ? 'Switchover to ' + ((spare && (spare.displayId || spare.name)) || ('spare ' + j)) + ' fails on demand (' + label + ')'
            : 'Time-order factor of ' + label + ' (exact dynamic solution / static bound)'
    };
}

// ── 13 Oct 2026: common cause failure, the Multiple Greek Letter model ────────────────────────
// NUREG/CR-5485 (Mosleh et al., 1998) and NUREG/CR-4780: for a common cause component group
// of m alike members, each with total failure probability Q_t, the probability of ONE SPECIFIC
// common cause basic event that fails ONE SPECIFIC set of k members is
//     Q_k^(m) = (1 / C(m-1, k-1)) · (ρ_1 · ρ_2 · … · ρ_k) · (1 − ρ_{k+1}) · Q_t
// with ρ_1 = 1, ρ_2 = β, ρ_3 = γ, ρ_4 = δ, ρ_{m+1} = 0 (and Q_1 = (1 − β) · Q_t, the member's
// own independent failure). Every specific subset of 2 or more members is its OWN event (its own
// BDD variable), so the cut sets name each common cause event explicitly.
// Defaults, stated once: β alone is the beta factor model, which is MGL with γ = δ = 1 (every
// common cause failure takes out the whole group). A γ or δ that was not entered is 1. Letters
// past δ (groups of 5 or more) are 1: a common cause failure that reaches 4 members reaches all.
// What "entered" means: node.ccfModel === 'mgl' → any number stored in gamma/delta (0 included);
// node.ccfModel === 'beta' → gamma/delta are ignored; no ccfModel (projects saved before this
// change) → a gamma/delta above 0 counts as entered, 0 or blank means "not entered" (the old
// screen's "leave 0 for the beta factor" instruction), so every beta-only project computes the
// same number it did before.
// Group parameters belong to the GROUP. The screens write them onto every member; if members
// still disagree (an import, an old project), the group uses the largest β, γ and δ found on any
// member, in any order, and reports a 'params-differ' issue. Members with different Q_t: each
// common cause event uses the largest Q_t among the members it fails (conservative; NUREG/CR-5485
// assumes alike members) and the group reports a 'qt-differ' issue.
// Group size m: the members this tree reaches, or the project-wide count the screens stamp on the
// members (ccfGroupSize) when the group also has members this tree does not reach. Those absent
// members still matter: a common cause event that fails {A, B, X} with X outside this tree fails
// exactly {A, B} here, so every in-tree subset's event is the union of all whole-group events
// that land on it (and the ones that land on one member join that member's own variable).
var _MGL_MAX_EVENTS = 2048;
function _mglNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const x = (typeof v === 'number') ? v : parseFloat(v);
    return isFinite(x) ? Math.min(1, Math.max(0, x)) : null;
}
function _mglBinom(n, k) {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return Math.round(r);
}
function _mglLid(n) { return n.logicalId != null ? n.logicalId : n.id; }
function _mglMemberParams(n) {
    const beta = _mglNum(n && n.beta) || 0;
    const model = n && n.ccfModel;
    const g = _mglNum(n && n.gamma), d = _mglNum(n && n.delta);
    const gammaGiven = model === 'beta' ? false : (g !== null && (model === 'mgl' || g > 0));
    const deltaGiven = model === 'beta' ? false : (d !== null && (model === 'mgl' || d > 0));
    return { beta: beta, gamma: gammaGiven ? g : 1, delta: deltaGiven ? d : 1, gammaGiven: gammaGiven, deltaGiven: deltaGiven };
}
// The group's model, from its members (any order). Returns null when the group's β is 0
// (no common cause modeled: the members are ordinary independent events).
function _mglPlanGroup(group, memberNodes) {
    const byLid = new Map();
    (memberNodes || []).forEach(n => { const k = String(_mglLid(n)); if (!byLid.has(k)) byLid.set(k, n); });
    const lids = [...byLid.keys()].sort();
    const members = lids.map(k => byLid.get(k));
    const ps = members.map(_mglMemberParams);
    let beta = 0, gamma = 0, delta = 0;
    ps.forEach(p => { if (p.beta > beta) beta = p.beta; if (p.gamma > gamma) gamma = p.gamma; if (p.delta > delta) delta = p.delta; });
    if (!(beta > 0)) return null;
    const issues = [];
    const p0 = ps[0];
    const same = ps.every(p => p.beta === p0.beta && p.gamma === p0.gamma && p.delta === p0.delta && p.gammaGiven === p0.gammaGiven && p.deltaGiven === p0.deltaGiven);
    if (!same) issues.push({ code: 'params-differ', group: group,
        message: 'The members of common cause group "' + group + '" carry different beta, gamma or delta values. The group uses the largest of each (beta ' + beta + ', gamma ' + gamma + ', delta ' + delta + '). Set the group parameters once so every member agrees.' });
    const qs = members.map(n => (n && n.eventClass === 'dev-error') ? 0 : ((n && n.probability) || 0));
    const qMin = Math.min.apply(null, qs), qMax = Math.max.apply(null, qs);
    if (qMax > 0 && qMin !== qMax) issues.push({ code: 'qt-differ', group: group,
        message: 'The members of common cause group "' + group + '" have different failure probabilities (' + qMin.toExponential(2) + ' to ' + qMax.toExponential(2) + '). The model assumes alike members, so each common cause event uses the largest probability among the members it fails.' });
    const t = members.length;
    let declared = 0;
    members.forEach(n => { const s = parseInt(n && n.ccfGroupSize, 10); if (isFinite(s) && s > declared) declared = s; });
    if (declared && declared < t) issues.push({ code: 'size-below-members', group: group,
        message: 'Common cause group "' + group + '" is recorded as ' + declared + ' members but this tree reaches ' + t + '. The tree count is used.' });
    const m = Math.max(t, declared);
    const rho = [0, 1, beta, gamma, delta];
    for (let k = 5; k <= m; k++) rho[k] = 1;
    rho[m + 1] = 0;
    const f = [0];
    let prod = 1;
    for (let k = 1; k <= m; k++) { prod *= rho[k]; f[k] = prod * (1 - rho[k + 1]) / _mglBinom(m - 1, k - 1); }
    const h = m - t;
    const sizes = [];
    for (let j = 2; j <= t; j++) {
        let any = false;
        for (let i = 0; i <= h; i++) if (f[j + i] > 0) { any = true; break; }
        if (any) sizes.push(j);
    }
    let count = 0;
    sizes.forEach(j => { count += _mglBinom(t, j); });
    if (count > _MGL_MAX_EVENTS) {
        const e = new Error('Common cause group "' + group + '" (' + t + ' members) needs ' + count + ' common cause events, over the ' + _MGL_MAX_EVENTS + ' limit. Split the group or enter gamma and delta so fewer subsets carry probability.');
        e.name = 'CCFGroupTooLargeError'; e.group = group; e.count = count;
        throw e;
    }
    const subsets = [];
    sizes.forEach(j => {
        (function pick(start, cur) {
            if (cur.length === j) { subsets.push(cur.slice()); return; }
            for (let i = start; i < t; i++) { cur.push(i); pick(i + 1, cur); cur.pop(); }
        })(0, []);
    });
    const gammaGiven = ps.every(p => p.gammaGiven), deltaGiven = ps.every(p => p.deltaGiven);
    const srcs = [];
    members.forEach(n => { const v = n && n.ccfParamSource ? String(n.ccfParamSource).trim() : ''; if (v && srcs.indexOf(v) === -1) srcs.push(v); });
    return { group: group, members: members, lids: lids, m: m, t: t, h: h, beta: beta, gamma: gamma, delta: delta,
             gammaGiven: gammaGiven, deltaGiven: deltaGiven, model: (gammaGiven || deltaGiven) ? 'mgl' : 'beta-factor',
             f: f, subsets: subsets, issues: issues, paramSource: srcs.join(' | ') };
}
// Probability of the event that fails exactly the in-tree members `idxs` (indexes into
// plan.members). One index = that member's own variable (its independent part plus every
// whole-group event that reaches only it here). qOf(node) gives each member's Q_t.
function _mglEventProb(plan, idxs, qOf) {
    const j = idxs.length;
    let qt = 0;
    for (let a = 0; a < j; a++) { const q = qOf(plan.members[idxs[a]]); if (q > qt) qt = q; }
    if (!(qt > 0)) return 0;
    if (plan.h === 0) return Math.min(1, plan.f[j] * qt);
    let s = 0;
    for (let i = 0; i <= plan.h; i++) {
        const x = (plan.f[j + i] || 0) * qt;
        if (!(x > 0)) continue;
        if (x >= 1) return 1;
        s += _mglBinom(plan.h, i) * Math.log1p(-x);
    }
    return -Math.expm1(s);
}
// The same event's failure rate (per hour), when every member it fails has a rate: the MGL
// share of the largest member rate. 0 when any member has no rate.
function _mglEventRate(plan, idxs) {
    let lam = 0;
    for (let a = 0; a < idxs.length; a++) {
        const l = parseFloat(plan.members[idxs[a]].lambda);
        if (!(isFinite(l) && l > 0)) return 0;
        if (l > lam) lam = l;
    }
    let share = 0;
    for (let i = 0; i <= plan.h; i++) share += _mglBinom(plan.h, i) * (plan.f[idxs.length + i] || 0);
    return share * lam;
}
// The visible common cause basic event for one subset: what cut sets, reports and the
// common cause screens show. It is not a tree node and never carries ccfGroup itself.
function _mglEventNode(plan, idxs) {
    const mem = idxs.map(i => plan.members[i]);
    const labels = mem.map(n => String(n.displayId || n.name || _mglLid(n)));
    const key = 'ccf:' + plan.group + ':' + idxs.map(i => plan.lids[i]).join('+');
    return {
        id: key, logicalId: key, type: 'basic', isCCF: true, sourceGroup: plan.group, ccfTier: idxs.length,
        displayId: 'CCF-' + plan.group + '[' + labels.join('+') + ']',
        name: 'CCF ' + plan.group + ': ' + labels.join('+'),
        probability: 0, lambda: 0, children: [],
        ccf: { group: plan.group, k: idxs.length, groupSize: plan.m, membersInTree: plan.t,
               memberLids: idxs.map(i => plan.lids[i]), memberIds: mem.map(n => n.id), memberDisplayIds: labels,
               beta: plan.beta, gamma: plan.gamma, delta: plan.delta, gammaGiven: plan.gammaGiven, deltaGiven: plan.deltaGiven,
               model: plan.model, method: 'NUREG/CR-5485 Multiple Greek Letter', paramSource: plan.paramSource }
    };
}
// 13 Oct 2026 (fix 3 x F5): the inspection interval a common cause event shares with its members,
// so the shared-interval time average scales it with them (its probability is linear in its
// members' q). 0 when its members are not all periodic latent events with one interval.
function _mglEventTau(plan, idxs) {
    let tau = 0;
    for (let a = 0; a < idxs.length; a++) {
        const t = _periodicTau(plan.members[idxs[a]]);
        if (!t || (tau && t !== tau)) return 0;
        tau = t;
    }
    return tau;
}

function _bddCombinations(items, r) {
    const out = [];
    (function pick(start, current) {
        if (current.length === r) { out.push([...current]); return; }
        for (let i = start; i < items.length; i++) { current.push(items[i]); pick(i + 1, current); current.pop(); }
    })(0, []);
    return out;
}

// Build a BDD from a fault tree root. Returns { bdd, varOrder, lidToVar, varMeta, ccfGroupToVar, ccfGroups }.
// varOrder is the full list of representative nodes, one entry per BDD variable.
// varMeta annotates each variable as either 'indep' (a basic event's own variable) or 'group'
// (ONE specific common cause event of a CCF group: the event that fails one specific set of
// k members). 13 Oct 2026 (fix 3): real MGL per NUREG/CR-5485, see the block above. Before,
// the group had three tier variables ORed into EVERY member, which is the beta factor model
// whatever gamma and delta said (2-out-of-3 came out 0.67 to 0.86 of MGL), and the group took
// q and beta from whichever member was read first (5x swing on child order). Now each specific
// subset is its own variable, a member's leaf is
//     v_own  ∨  (every subset event that contains the member)
// and varOrder[v] for a subset event is a visible CCF event object ("CCF G: A+B", isCCF, with
// the group, members, k and parameters in .ccf), so the BDD cut sets list it by name.
// Merged with F4/F5 (v1.9 engine): FDEP forcing applies to the whole member leaf (own and common
// cause events), dynamic-gate synthetic variables are 'indep' with meta.synthetic.
function buildBDDFromFT(rootNode, scopeRoot) {
    BDD.reset();
    if (!rootNode) return { bdd: BDD.T0, varOrder: [], lidToVar: new Map(), varMeta: [], ccfGroupToVar: new Map(), ccfGroups: [], dyn: [], fdepCount: 0, grid: null };
    const varOrder = [];
    const varMeta  = [];
    const lidToVar = new Map();
    // 13 Oct 2026 (fix 3, MGL): ccfGroupToVar.get(group) = { plan, vars, events, memberVars }:
    // one variable per specific common cause event (the MGL block above).
    const ccfGroupToVar = new Map();
    const leaves = [];
    const seenLid = new Set();
    // 13 Oct 2026 (F4): functional dependencies in scope (the whole tree by default; a caller
    // evaluating a sub-gate passes the tree root so FDEPs outside the sub-gate still apply).
    const fdep = _collectFdep(scopeRoot || rootNode);
    const lidCount = new Map();
    const seenNodes = new Set(), seenPages = new Set();
    // Pass 1: collect logicalIds + CCF group representatives in DFS order.
    function collect(node, visitedNodes, visitedPages) {
        if (!node) return;
        if (visitedNodes.has(node)) return;   // F1: by the node itself, not its id (a transferred page may reuse an id)
        visitedNodes.add(node);
        if (node.type !== 'gate') {
            const lid = node.logicalId != null ? node.logicalId : node.id;
            lidCount.set(lid, (lidCount.get(lid) || 0) + 1);
            if (!seenLid.has(lid)) { seenLid.add(lid); leaves.push(node); }
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
    }
    collect(rootNode, seenNodes, seenPages);
    // Triggers of FDEPs outside the evaluated tree whose dependents are in it (scoped calls only).
    for (let grew = true; grew;) {
        grew = false;
        fdep.gates.forEach(g => {
            const kids = g.children || g._children;
            if (!kids || seenNodes.has(kids[0])) return;
            const hit = kids.slice(1).some(d => d && (d.type === 'gate' ? seenNodes.has(d) : seenLid.has(d.logicalId != null ? d.logicalId : d.id)));
            if (hit) { collect(kids[0], seenNodes, seenPages); grew = true; }
        });
    }

    // 13 Oct 2026 (fix 3, MGL): variables in DFS order, each common cause group's events right
    // after its first member's own variable (only once every leaf, FDEP triggers included, is known).
    const groupMembers = new Map();
    leaves.forEach(n => {
        if (!n.ccfGroup) return;
        if (!groupMembers.has(n.ccfGroup)) groupMembers.set(n.ccfGroup, []);
        groupMembers.get(n.ccfGroup).push(n);
    });
    const plans = new Map();
    groupMembers.forEach((mem, g) => { const plan = _mglPlanGroup(g, mem); if (plan) plans.set(g, plan); });
    leaves.forEach(n => {
        const lid = n.logicalId != null ? n.logicalId : n.id;
        const plan = n.ccfGroup ? plans.get(n.ccfGroup) : null;
        lidToVar.set(lid, varOrder.length);
        varOrder.push(n);
        if (!plan) { varMeta.push({ type: 'indep', node: n }); return; }
        varMeta.push({ type: 'indep', node: n, ccf: plan, ccfIdx: [plan.lids.indexOf(String(lid))] });
        if (ccfGroupToVar.has(plan.group)) return;
        const entry = { plan: plan, vars: [], events: [], memberVars: plan.lids.map(() => []) };
        plan.subsets.forEach(idxs => {
            const ev = _mglEventNode(plan, idxs);
            const v = varOrder.length;
            entry.vars.push(v); entry.events.push(ev);
            idxs.forEach(i => entry.memberVars[i].push(v));
            varOrder.push(ev);
            varMeta.push({ type: 'group', tier: idxs.length, group: plan.group, ccf: plan, ccfIdx: idxs, event: ev, refNode: ev });
        });
        ccfGroupToVar.set(plan.group, entry);
    });

    // Pass 2: recursive BDD build. The pageCache memoizes a destination page's resolved BDD so
    // multiple TRANSFERs that all point at the same page don't rebuild it from scratch.
    const pageCache = new Map();
    const forcing = new Set(), forcedCache = new Map();
    const dynInfo = new Map();
    function forced(base, triggers, key, visitedPages) {
        if (forcing.has(key)) return base;
        if (!forcing.size && forcedCache.has(key)) return forcedCache.get(key);
        const top = !forcing.size;
        forcing.add(key);
        let r = base;
        triggers.forEach(t => { r = BDD.apply('or', r, build(t, visitedPages)); });
        forcing.delete(key);
        if (top) forcedCache.set(key, r);
        return r;
    }
    function synthVar(node) {
        const v = varOrder.length;
        varOrder.push(node);
        varMeta.push({ type: 'indep', node, synthetic: node._synthetic });
        return v;
    }
    // F4: classify a PAND / SPARE gate once: exact independent module, or conservative bound.
    function dynClassify(node, kids) {
        const isSpare = node.gateType === 'SPARE';
        const ps = isSpare ? _spareSwitchP(node) : 1;
        const warmK = isSpare ? _spareWarmK(node) : 0;
        const info = { gateId: node.id, displayId: node.displayId, gateType: node.gateType, ps, warmK, mode: 'bound', reason: '', sw: [], orderVar: null, primaryOnly: false, exact: null, bound: null };
        if (isSpare && ps < 1) for (let j = 1; j < kids.length; j++) info.sw.push(synthVar(_dynSyntheticNode(node, 'switch', j, 1 - ps, kids[j])));
        const xs = [], probs = [], lids = new Set();
        for (let i = 0; i < kids.length && !info.reason; i++) {
            const k = kids[i];
            const nm = k ? (k.displayId || k.name || String(k.id)) : '?';
            if (!k || k.type === 'gate') { info.reason = 'input ' + nm + ' is a gate, not a single basic event'; break; }
            const lid = k.logicalId != null ? k.logicalId : k.id;
            if (lids.has(lid)) { info.reason = 'input ' + nm + ' is entered twice'; break; }
            lids.add(lid);
            if ((lidCount.get(lid) || 0) !== 1) { info.reason = 'input ' + nm + ' also appears elsewhere in the tree'; break; }
            if (fdep.byLid.has(lid)) { info.reason = 'input ' + nm + ' is forced by a functional dependency'; break; }
            if (lidToVar.has(lid) && varMeta[lidToVar.get(lid)].ccf) { info.reason = 'input ' + nm + ' is in a common cause group'; break; }
            const x = _dynRateLeaf(k);
            if (x == null) { info.reason = 'input ' + nm + ' has no constant failure rate over the whole mission (probability only, repair model, latent or phase exposure)'; break; }
            xs.push(x); probs.push(k.probability);
        }
        if (!info.reason && kids.length < 2) info.reason = 'fewer than two inputs';
        if (!info.reason) {
            const exact = isSpare ? _spareExactProb(xs, warmK, ps) : (node.gateType === 'SEQ' ? _seqExactProb(xs) : _pandExactProb(xs));
            const bound = isSpare ? _spareBoundProb(probs, ps) : probs.reduce((a, b) => a * b, 1);
            if (exact == null) info.reason = 'too many inputs to solve exactly';
            else if (exact > bound * (1 + 1e-9) && bound > 0) info.reason = 'standby factor above 1';
            else {
                info.mode = 'exact'; info.exact = exact; info.bound = bound;
                const f = bound > 0 ? Math.min(1, exact / bound) : 1;
                if (f < 1 - 1e-12) info.orderVar = synthVar(_dynSyntheticNode(node, 'order', 0, f));
            }
        }
        if (info.mode !== 'exact' && warmK > 1) info.primaryOnly = true;
        return info;
    }
    function dynGate(node, kids, kidBdds) {
        let info = dynInfo.get(node);
        if (!info) { info = dynClassify(node, kids); dynInfo.set(node, info); }
        if (info.primaryOnly) return kidBdds[0];
        let f;
        if (info.sw.length) {
            let r = BDD.T1;
            for (let j = kidBdds.length - 1; j >= 1; j--) r = BDD.apply('or', BDD.variable(info.sw[j - 1]), BDD.apply('and', kidBdds[j], r));
            f = BDD.apply('and', kidBdds[0], r);
        } else {
            f = kidBdds.reduce((acc, k) => BDD.apply('and', acc, k), BDD.T1);
        }
        if (info.orderVar != null) f = BDD.apply('and', f, BDD.variable(info.orderVar));
        return f;
    }
    function build(node, visitedPages) {
        if (!node) return BDD.T0;
        if (node.type !== 'gate') {
            const lid = node.logicalId != null ? node.logicalId : node.id;
            const v = lidToVar.get(lid);
            if (v == null) return BDD.T0;
            let result = BDD.variable(v);
            // A common cause member fails on its own or by any common cause event that contains it;
            // a functional dependency then forces the whole leaf (own and common cause) below.
            const meta = varMeta[v];
            const entry = (meta && meta.ccf) ? ccfGroupToVar.get(meta.ccf.group) : null;
            if (entry) entry.memberVars[meta.ccfIdx[0]].forEach(gv => { result = BDD.apply('or', result, BDD.variable(gv)); });
            const trig = fdep.byLid.get(lid);
            if (trig) result = forced(result, trig, 'l:' + lid, visitedPages);
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
        const g = buildGate(node, visitedPages);
        const gtrig = fdep.byGate.get(node.id);
        return gtrig ? forced(g, gtrig, 'g:' + node.id, visitedPages) : g;
    }
    function buildGate(node, visitedPages) {
        const kids = node.children || node._children;
        if (!kids || kids.length === 0) return BDD.T0;
        // FDEP is a modifier: it contributes through its dependents (see forced()), not directly.
        if (node.gateType === 'FDEP') return BDD.T0;
        const kidBdds = kids.map(c => build(c, visitedPages));
        if (node.gateType === 'AND' || node.gateType === 'INHIBIT') {
            return kidBdds.reduce((acc, k) => BDD.apply('and', acc, k), BDD.T1);
        }
        if (node.gateType === 'PAND' || node.gateType === 'SPARE' || node.gateType === 'SEQ') return dynGate(node, kids, kidBdds);
        // 13 Oct 2026 (fix G): NOT negates its input (several inputs: NOR). Non-coherent; see _bddPrimeImplicants.
        if (node.gateType === 'NOT') return BDD.not(kidBdds.reduce((acc, k) => BDD.apply('or', acc, k), BDD.T0));
        if (node.gateType === 'OR') {
            return kidBdds.reduce((acc, k) => BDD.apply('or', acc, k), BDD.T0);
        }
        if (node.gateType === 'XOR') {
            // "Exactly one input is true": matches the legacy analytic-engine semantics.
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
            let row = [BDD.T1];
            for (let j = 1; j <= k; j++) row.push(BDD.T0);
            for (let i = kidBdds.length - 1; i >= 0; i--) {
                const next = [BDD.T1];
                for (let j = 1; j <= k; j++) next.push(BDD.apply('or', BDD.apply('and', kidBdds[i], row[j - 1]), row[j]));
                row = next;
            }
            return row[k];
        }
        return BDD.T0;
    }
    const bdd = build(rootNode, new Set());
    const dyn = [];
    dynInfo.forEach(i => dyn.push({ gateId: i.gateId, displayId: i.displayId, gateType: i.gateType, mode: i.mode, reason: i.reason, exact: i.exact, bound: i.bound, switchP: i.ps, warmK: i.warmK }));
    const grid = _periodicGrid(varOrder, varMeta);
    return { bdd, varOrder, lidToVar, varMeta, ccfGroupToVar, ccfGroups: [...plans.values()], dyn, fdepCount: fdep.gates.length, grid };
}

// BDD-derived minimal cutsets. For a monotone fault tree, every 1-path through the BDD is a
// cutset (positive literals only — the low branches contribute nothing). Subsumption keeps
// only minimal sets.
function bddCutsets(bdd, current, result) {
    current = current || [];
    result = result || [];
    if (bdd === BDD.T0) return result;
    if (bdd === BDD.T1) {
        result.push([...current]);
        // #7b hardening — the BDD 1-path enumeration had NO budget guard, so a
        // compact BDD (thousands of nodes) with combinatorially many paths could
        // grind the main thread indefinitely (ipLedger calls this on every Cat/Haz
        // tree). Same discipline as the classic enumerator: ABORT deterministically
        // at the budget, never truncate — an incomplete cut-set list would silently
        // under-report failure combinations. P(top) is unaffected (BDD.probability
        // never enumerates paths).
        const _budget = (typeof _CUTSET_BUDGET !== 'undefined') ? _CUTSET_BUDGET : 200000;
        if (result.length > _budget) {
            if (typeof CutsetExplosionError === 'function') throw new CutsetExplosionError(result.length);
            const e = new Error('BDD cut-set enumeration exceeds ' + _budget.toLocaleString() + ' sets.'); e.name = 'CutsetExplosionError'; e.count = result.length; throw e;
        }
        return result;
    }
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
    if (_treeHasNot(rootNode)) return _primeImplicantCutsets(rootNode);   // 13 Oct 2026 (fix G): non-coherent tree -> prime implicants
    const { bdd, varOrder, varMeta } = buildBDDFromFT(rootNode);
    if (!bdd || bdd === BDD.T0) return [];
    const raw = bddCutsets(bdd).map(cs => cs.filter(i => !(varMeta[i] && varMeta[i].synthetic === 'order')));
    const minimal = _minimizeBDDCutsets(raw);
    return minimal.map(cs => cs.sort((a, b) => a - b).map(idx => varOrder[idx]));
}

// Build a probability map for the BDD's variables. A plain event gets its own q. A CCF member's
// own variable gets Q_1 = (1 − β)·Q_t (plus any whole-group event that lands only on it in this
// tree); a CCF subset event gets Q_k^(m) (_mglEventProb), and the visible event object is
// stamped with that probability and its rate. Backlog #4: a development error (ARP 4761A
// 4.1.1.1) enters at p = 0, so P(top) is P(top | no development error); its variable stays in
// the BDD so the cut-set structure is untouched. Falls back to plain q without varMeta.
function _probMapFor(varOrder, varMeta) {
    const map = new Map();
    const _q = n => (n && n.eventClass === 'dev-error') ? 0 : (n && n.probability) || 0;
    if (!varMeta || !varMeta.length) {
        varOrder.forEach((node, varIdx) => map.set(varIdx, _q(node)));
        return map;
    }
    varMeta.forEach((meta, varIdx) => {
        if (meta.type === 'indep') {
            map.set(varIdx, meta.ccf ? _mglEventProb(meta.ccf, meta.ccfIdx, _q) : _q(meta.node));
        } else if (meta.type === 'group') {
            const p = _mglEventProb(meta.ccf, meta.ccfIdx, _q);
            if (meta.event) { meta.event.probability = p; meta.event.lambda = _mglEventRate(meta.ccf, meta.ccfIdx); }
            map.set(varIdx, p);
        }
    });
    return map;
}

function computeExactProbability(rootNode, scopeRoot) {
    const built = buildBDDFromFT(rootNode, scopeRoot);
    const probMap = _probMapFor(built.varOrder, built.varMeta);
    const prob = _bddAvgProbability(built, probMap);
    return { prob, bdd: built.bdd, varOrder: built.varOrder, lidToVar: built.lidToVar, varMeta: built.varMeta, probMap, bddSize: BDD.size(built.bdd), grid: built.grid, dyn: built.dyn, fdepCount: built.fdepCount, upperBound: built.dyn.some(d => d.mode !== 'exact') || !!(built.grid && built.grid.bound), ccfGroups: built.ccfGroups };
}

// 23 Sep 2026 (perf fix 4) — P(top) RESULT CACHE for read-only callers.
// Dashboard, PASA and FTA arrivals asked for the exact P(top) of every tree
// on every arrival (budget ledger, CCMR NTE, stale watch), and each call
// re-allocated the BDD tables and rebuilt the diagram from scratch: at 20x
// that was ~0.5 s of the dashboard's arrival. exactTopProbability(root)
// returns ONLY the number, keyed by a full-content key of everything
// buildBDDFromFT and _probMapFor read (every reachable node's structure,
// gate semantics, CCF parameters and probability, and every page reached
// through a transfer). The key is the complete content, not a hash, so a
// hit can only happen when the inputs are identical: any edit to the tree or
// to a page it transfers into is a miss and a fresh BDD computation. Callers
// that need the diagram itself (bdd, varOrder, probMap) keep calling
// computeExactProbability, which is unchanged. Errors are never cached.
// See tests/regression_perf_ptop_cache.test.js.
// Bounded by entries AND by total key size (a key is the tree's full content),
// evicting oldest first. Sized for a large project's whole tree set (seeded
// MF&MS pages included) so a sweep over every tree does not thrash.
function _boundedCache(maxEntries, maxChars) {
    const m = new Map(); let chars = 0;
    return {
        has: k => m.has(k),
        get: k => m.get(k),
        set(k, v) {
            if (m.has(k)) return;
            m.set(k, v); chars += k.length;
            while (m.size > maxEntries || (chars > maxChars && m.size > 1)) { const old = m.keys().next().value; chars -= old.length; m.delete(old); }
        },
        get size() { return m.size; },
        get chars() { return chars; }
    };
}
const _PTOP_CACHE_MAX = 20000;
const _ptopCache = _boundedCache(_PTOP_CACHE_MAX, 16e6);
// Every node field buildBDDFromFT / _probMapFor read (probability: leaves only, see
// _ptopKey). Each value is encoded
// unambiguously (strings length-prefixed), so two different inputs never share a key.
const _PTOP_FIELDS = ['id', 'type', 'gateType', 'logicalId', 'votingK', 'probability', 'eventClass',
    'ccfGroup', 'beta', 'gamma', 'delta', 'ccfModel', 'ccfGroupSize', 'transferOutTo', 'linkedPageId'];
// 13 Oct 2026 (math audit F1, cost): every pass/fail screen and the result-page
// swap in calculateAllProbabilities now ask for the exact top on every tree, so this
// key walk runs over the whole project per recompute. Same content, same
// unambiguity, about 3x cheaper: strings are length-prefixed instead of
// JSON-quoted (s<len>:<text> cannot be confused with any other encoding), and the
// key is built by concatenation instead of an array of small strings.
// 13 Oct 2026 (F4 / F5): the BDD now also reads the dynamic-gate settings and the fields that
// decide whether an event is a constant-rate or periodically inspected latent event.
_PTOP_FIELDS.push('spareSwitchP', 'spareWarmK', 'lambda', 'lambdaByPhase', 'repairModel', 'mu', 'tau', 'markovModelId', 'exposureMode');
function _ptopVal(v) {
    if (v === undefined) return 'u';
    if (v === null) return 'z';
    const t = typeof v;
    if (t === 'number') return 'n' + v;
    if (t === 'string') return 's' + v.length + ':' + v;
    if (t === 'boolean') return v ? 'T' : 'F';
    return 'j' + JSON.stringify(v);   // throws on an unencodable value -> the caller bypasses the cache
}
// NOT memoized per render pass on purpose: code inside a pass (the CCMR interval
// search, bindings checklist) changes leaf probabilities transiently and asks
// for P(top) again; a key remembered by object identity would answer for the
// old content. The key is always walked from the tree as it is now.
function _ptopKey(rootNode, fields) {
    fields = fields || _PTOP_FIELDS;
    const nf = fields.length;
    // A gate's own probability is NOT an input of the diagram (buildBDDFromFT and
    // _probMapFor read only leaf probabilities; a gate's value is its output). It is
    // left out of the key so the open page's roll-up / exact swap and the shared-event
    // normalization of intermediate gates do not turn an unchanged tree into a miss.
    // 13 Oct 2026 (merge of F1 with F4/F5): the same holds for the leaf-only rate fields F4/F5
    // added (lambda, lambdaByPhase): the roll-up writes a gate's lambda AFTER the open page's exact
    // top is cached, which made every recompute miss on the open page.
    const pIdx = fields.indexOf('probability'), lIdx = fields.indexOf('lambda'), lpIdx = fields.indexOf('lambdaByPhase');
    let out = '';
    const pagesSeen = new Set();
    const pages = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages : [];
    (function walk(n) {
        if (!n) { out += '~'; return; }
        out += '(';
        const isGate = n.type === 'gate';
        for (let i = 0; i < nf; i++) out += (isGate && (i === pIdx || i === lIdx || i === lpIdx) ? 'g' : _ptopVal(n[fields[i]])) + ',';
        if (n.type === 'gate' && (n.gateType === 'TRANSFER' || n.transferOutTo)) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !pagesSeen.has(String(linkedId))) {
                pagesSeen.add(String(linkedId));
                const page = pages.find(p => p && p.id === linkedId);
                out += '{';
                if (page && page.root) walk(page.root); else out += '∅';
                out += '}';
            }
        }
        const kids = n.children || n._children;
        if (kids) { out += (kids === n.children ? '[' : '_['); for (let i = 0; i < kids.length; i++) walk(kids[i]); out += ']'; }
        out += ')';
    })(rootNode);
    return out;
}
function exactTopProbability(rootNode) {
    if (!rootNode) return computeExactProbability(rootNode).prob;
    let key;
    try { key = _ptopKey(rootNode); } catch (_) { return computeExactProbability(rootNode).prob; }
    if (_ptopCache.has(key)) return _ptopCache.get(key);
    const prob = computeExactProbability(rootNode).prob;
    _ptopCache.set(key, prob);
    return prob;
}
try { window.exactTopProbability = exactTopProbability; } catch (_) {}

// 23 Sep 2026 (perf round 2) — MINIMAL CUT SETS, cached the same way, for the
// independence ledger (ipLedger), which rebuilt every Cat/Haz tree's cut sets
// on every call (the FTA-proposals sweep and the CRA called it on a timer).
// Returns the cut sets as SNAPSHOTS of the member events (the fields the ledger
// reads), never live node objects, so a cached answer cannot hand out a node
// that has since been replaced. The key adds the label fields to the P(top)
// key, so any change to what a snapshot carries is a miss.
// See tests/regression_perf_round2.test.js.
const _MCS_FIELDS = _PTOP_FIELDS.concat(['displayId', 'name', 'ccfParamSource']);   // 13 Oct 2026: a common cause event snapshot carries the group's parameter source
const _MCS_CACHE_MAX = 20000;
const _mcsCache = _boundedCache(_MCS_CACHE_MAX, 16e6);
// Kept here (the page must not depend on the engine namespace at call time —
// several harnesses load this file alone); fta_engine.js has the identical
// cutsetSnapshot for the worker, held equal by tests/regression_engine_parity.
function cutsetSnapshot(n) {
    const s = { id: n.id, logicalId: n.logicalId, displayId: n.displayId, name: n.name,
             ccfGroup: n.ccfGroup, beta: n.beta, eventClass: n.eventClass };
    if (n.isCCF) { s.isCCF = true; s.sourceGroup = n.sourceGroup; s.ccfTier = n.ccfTier; s.ccf = n.ccf ? JSON.parse(JSON.stringify(n.ccf)) : null; }
    return s;
}
const _mcsSnap = cutsetSnapshot;
function minimalCutsetSnapshots(rootNode) {
    let key = null;
    try { key = _ptopKey(rootNode, _MCS_FIELDS); } catch (_) { key = null; }
    if (key !== null && _mcsCache.has(key)) return _mcsCache.get(key).map(cs => cs.map(m => Object.assign({}, m)));
    const snaps = (bddMinimalCutsets(rootNode) || []).map(cs => cs.map(_mcsSnap));
    if (key !== null) {
        _mcsCache.set(key, snaps);
    }
    return snaps.map(cs => cs.map(m => Object.assign({}, m)));
}
try { window.minimalCutsetSnapshots = minimalCutsetSnapshots; } catch (_) {}
// tree_warm.js hands in results the worker computed for an exact content key.
// A key is the tree's full content, so a primed entry can only ever be read
// back for identical content.
function _ptopPrime(key, prob) { if (typeof key === 'string' && typeof prob === 'number') _ptopCache.set(key, prob); }
function _mcsPrime(key, snaps) { if (typeof key === 'string' && Array.isArray(snaps)) _mcsCache.set(key, snaps); }
try { window.ptopCachePrime = _ptopPrime; window.ptopCacheHas = k => _ptopCache.has(k); window.mcsCachePrime = _mcsPrime; window.mcsCacheHas = k => _mcsCache.has(k); } catch (_) {}

// Top-level wrappers invoked by the toolbar buttons. They render results into the dedicated
// summary divs without disturbing the main cutset summary.
// MC-SEED — every Monte Carlo in this file is SEEDED (mulberry32, same discipline as
// rbd_mc.js and mc_crosscheck.js). A safety figure that changes on refresh is not
// evidence; same seed + same tree ⇒ same figure, and the seed is shown on the result.
// Math.random() is BANNED in this file (regression-checked).
function _mcMulberry(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// DFT-WARM — SPARE gate parameters. Both defaults reproduce the historical
// cold-spare / perfect-switch model EXACTLY, so an existing tree's numbers do
// not move when this ships.
//   spareWarmK   — dormancy factor α. A spare waiting its turn accrues failure
//                  at λ·α: 0 = cold (no exposure while dormant — the old
//                  model), 1 = hot (same rate standing by as carrying load),
//                  in between = warm. Same meaning as warmK in rbd_mc.js.
//   spareSwitchP — probability that a takeover succeeds when it is demanded.
//                  1 = perfect switch (the old model). A failed takeover fails
//                  the gate at the instant of the demand.
function _spareWarmK(node) {
    const k = parseFloat(node && node.spareWarmK);
    return (isFinite(k) && k > 0) ? k : 0;
}
function _spareSwitchP(node) {
    const p = parseFloat(node && node.spareSwitchP);
    return (isFinite(p) && p >= 0 && p < 1) ? p : 1;
}

// Monte-Carlo simulator for Dynamic Fault Trees. Per trial:
//   1. Sample failure time t_i ~ Exponential(λ_i) for each unique logicalId (repeated events share).
//   2. Apply FDEP modifications: trigger fail → dependent events fail at trigger time.
//   3. Evaluate the tree recursively with time-ordered semantics for PAND / SPARE.
// Returns the empirical P(top fails by mission time T). Seeded: default seed 42.
function simulateDFT(rootNode, missionTime, N, seed) {
    N = N || 20000;
    const usedSeed = (seed == null ? 42 : seed) >>> 0;
    const rng = _mcMulberry(usedSeed);
    if (!rootNode) return { p: 0, stderr: 0, N: 0, dynGateCount: 0, warmSpares: 0, imperfectSwitches: 0, seed: usedSeed };
    const eventMap = new Map(); // logicalId → representative node (for λ lookups)
    let dynGateCount = 0;
    const fdepGates = [];
    const imperfectSpares = []; // SPARE gates with switchP < 1 — these need a coin per demand
    let warmSpareCount = 0, imperfectSwitchCount = 0; // receipts for the result card
    (function walk(n, visited) {
        if (!n || visited.has(n)) return;
        visited.add(n);
        if (n.type === 'gate') {
            if (n.gateType === 'PAND' || n.gateType === 'SPARE' || n.gateType === 'SEQ' || n.gateType === 'FDEP') dynGateCount++;
            if (n.gateType === 'FDEP') fdepGates.push(n);
            if (n.gateType === 'SPARE') {
                if (_spareWarmK(n) > 0) warmSpareCount++;
                if (_spareSwitchP(n) < 1) { imperfectSwitchCount++; imperfectSpares.push(n); }
            }
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

    // Per-trial switch coins, keyed by SPARE gate id → one uniform per takeover
    // demand. Drawn up front rather than inside evalGate so the value a given
    // demand sees does not depend on the order the tree happens to be walked,
    // and so a gate reached twice (shared subtree) sees the SAME switch — one
    // physical changeover, one outcome.
    let switchCoins = null;
    let forcedGates = null;   // gate id -> forcing time from an FDEP whose dependent is a gate

    // Evaluate the gate's "fail time" given a snapshot of basic-event failure times.
    // Returns Infinity if the gate does not fail within finite time given the sample.
    // A gate that is an FDEP dependent fails at the earlier of its own time and its trigger's.
    function evalGate(node, failTimes, visited) {
        const t = evalGateRaw(node, failTimes, visited);
        if (forcedGates && node && forcedGates.has(node.id) && !visited.has(node)) return Math.min(t, forcedGates.get(node.id));
        return t;
    }
    function evalGateRaw(node, failTimes, visited) {
        if (!node) return Infinity;
        if (visited.has(node)) return Infinity;
        visited = new Set(visited); visited.add(node);
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
            // Spare pool: kids[0] is the primary, kids[1..] are spares taken in
            // declared order. A spare accrues failure at λ·warmK while it waits
            // and at λ once it carries the load; each takeover succeeds with
            // probability switchP. warmK = 0 and switchP = 1 is the cold-spare,
            // perfect-switch model this gate has always had — and that path
            // touches neither the arithmetic nor the random stream below, which
            // is why existing trees reproduce bit-for-bit.
            const warmK = _spareWarmK(node);
            const switchP = _spareSwitchP(node);
            const coins = (switchP < 1 && switchCoins) ? switchCoins.get(node.id) : null;
            let cum = evalGate(kids[0], failTimes, visited);
            if (!isFinite(cum)) return Infinity;
            for (let i = 1; i < kids.length; i++) {
                const spare = kids[i];
                let life = evalGate(spare, failTimes, visited); // time-to-fail at full rate
                if (!isFinite(life)) return Infinity;           // a spare that never fails ⇒ gate never fails
                // Dormancy. The sampled life is an Exp(λ) draw, so λ·life is this
                // spare's unit-exponential quantile; subtract the hazard λ·warmK·cum
                // it burned through while dormant. Exact, and it consumes no extra
                // random numbers — which is what keeps the cold path identical.
                if (warmK > 0 && spare.type !== 'gate') {
                    const lam = getEffectiveLambda(spare);
                    if (lam > 0) {
                        const dormantHazard = lam * warmK * cum;
                        const totalHazard = lam * life;
                        // Died in standby: it is not there when demanded, so it adds
                        // no load-carrying life. The next spare in line is tried at
                        // the same instant (same as rbd_mc.js).
                        if (totalHazard <= dormantHazard) continue;
                        life = (totalHazard - dormantHazard) / lam;
                    }
                    // A spare that is itself a gate keeps full-rate life — a subtree's
                    // hazard cannot be rescaled from one sampled time. Logged, not faked.
                }
                // Takeover demand. A spare already dead in standby is never demanded,
                // so it never spends a coin — the `continue` above ran first.
                if (coins && coins[i - 1] >= switchP) return cum;
                cum += life;
            }
            return cum;
        }
        if (node.gateType === 'SEQ') {
            // 13 Oct 2026 (fix G): sequence-enforcing gate. Input i+1 cannot start failing until
            // input i has failed, so each input's sampled life runs from the previous failure and
            // the gate fails when the last one does: the sum of the lives (cold standby, perfect switch).
            let cum = 0;
            for (let i = 0; i < kids.length; i++) {
                const life = evalGate(kids[i], failTimes, visited);
                if (!isFinite(life)) return Infinity;
                cum += life;
            }
            return cum;
        }
        if (node.gateType === 'NOT') {
            // 13 Oct 2026 (fix G): NOT (NOR over several inputs) is judged at the mission end: true
            // from the start when no input has failed by then, never true otherwise.
            const tin = Math.min(...kids.map(c => evalGate(c, failTimes, visited)));
            return (tin <= missionTime) ? Infinity : 0;
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
            const u = Math.max(rng(), 1e-12);
            failTimes.set(lid, -Math.log(u) / lambda);
        });
        // Draw this trial's switch coins — one per takeover demand, only for gates
        // that actually declare an imperfect switch. When no gate does, the random
        // stream is untouched and the run is identical to the pre-DFT-WARM engine.
        if (imperfectSpares.length) {
            switchCoins = new Map();
            for (const sg of imperfectSpares) {
                const sk = sg.children || sg._children;
                const demands = sk ? Math.max(0, sk.length - 1) : 0;
                const arr = new Array(demands);
                for (let i = 0; i < demands; i++) arr[i] = rng();
                switchCoins.set(sg.id, arr);
            }
        }
        // Apply FDEP modifications: each trigger that fails before T forces its dependents.
        // 13 Oct 2026 (F4): a trigger may be a gate (its failure time is evaluated), a dependent
        // may be a gate (its output is forced), and chained FDEPs (a trigger that is itself a
        // dependent) are applied to a fixed point, so the order the FDEPs were drawn in no longer
        // matters. No random numbers are drawn here, so seeded results are unchanged wherever the
        // old single pass was already right.
        forcedGates = fdepGates.length ? new Map() : null;
        for (let pass = 0; pass <= fdepGates.length; pass++) {
            let changed = false;
            for (const fdep of fdepGates) {
                const kids = fdep.children || fdep._children;
                if (!kids || kids.length < 2 || !kids[0]) continue;
                const triggerKid = kids[0];
                const triggerTime = triggerKid.type === 'gate'
                    ? evalGate(triggerKid, failTimes, new Set())
                    : failTimes.get(triggerKid.logicalId != null ? triggerKid.logicalId : triggerKid.id);
                if (triggerTime == null || !isFinite(triggerTime) || triggerTime > missionTime) continue;
                for (let i = 1; i < kids.length; i++) {
                    const dep = kids[i];
                    if (!dep) continue;
                    if (dep.type === 'gate') {
                        const cur = forcedGates.get(dep.id);
                        if (cur == null || triggerTime < cur) { forcedGates.set(dep.id, triggerTime); changed = true; }
                        continue;
                    }
                    const lid = dep.logicalId != null ? dep.logicalId : dep.id;
                    const natural = failTimes.get(lid);
                    if (!(natural <= triggerTime)) { failTimes.set(lid, triggerTime); changed = true; }
                }
            }
            if (!changed) break;
        }
        const topT = evalGate(rootNode, failTimes, new Set());
        if (topT <= missionTime) failCount++;
    }
    const p = failCount / N;
    const stderr = Math.sqrt(p * (1 - p) / N);
    return { p, stderr, N, dynGateCount, warmSpares: warmSpareCount, imperfectSwitches: imperfectSwitchCount, seed: usedSeed };
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
// 13 Oct 2026 (fix3-M): the state and transition tables and the Markov state diagram (markov_diagram.js)
// are two views of the same model. Every state and transition carries a stable id (assigned the first time
// the model is edited; models saved before keep their meaning exactly), states have a type (operational,
// degraded, failed; failed = isFailed as before, degraded counts as working), the start is a state or a
// starting distribution (initialProbs), and transitions are failure (λ) or repair (μ). Renaming a state
// renames it everywhere it is used (transitions, start).
function _mkEnsureIds(m) {
    if (!m) return;
    (m.states || []).forEach((s, i) => { if (s && !s.id) s.id = 'st-' + i; });
    (m.transitions || []).forEach((t, i) => { if (t && !t.id) t.id = 'tr-' + i; });
}
var _mkIdSeq = 0;
function _mkNewId(prefix) {
    try { if (window.SLDiagramEditor) return SLDiagramEditor.uuid(); } catch (_) {}
    return prefix + '-' + Date.now().toString(36) + '-' + (++_mkIdSeq);   // a counter, not a random number: this file uses no unseeded randomness
}
function _mkTouched(label) {
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
    try { if (label && window.SLChangeAck && typeof SLChangeAck.describe === 'function') SLChangeAck.describe({ summary: label }); } catch (_) {}
}
function addMarkovModel() {
    const m = {
        id: 'mkv-' + Date.now(),
        name: 'New Markov Model',
        states: [
            { id: _mkNewId('st'), name: 'Working', isFailed: false },
            { id: _mkNewId('st'), name: 'Failed',  isFailed: true  }
        ],
        transitions: [{ id: _mkNewId('tr'), from: 'Working', to: 'Failed', rate: 1e-5, kind: 'failure' }],
        initialState: 'Working'
    };
    // 24 Oct 2026 (tree_homes.js): a model made now belongs to the level being worked on (until a tree uses it)
    try { if (typeof SLTreeHomes !== 'undefined' && SLTreeHomes.stamp) SLTreeHomes.stamp(m); } catch (_) {}
    (projectConfig.markovModels = projectConfig.markovModels || []).push(m);
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}   // 13 Sep 2026 (R18)
    renderMarkovModels();
}
async function deleteMarkovModel(id) {
    if (!(await slConfirm('Delete this Markov model? Events using it will fall back to their repair model.', { danger: true, okText: 'Delete' }))) return;
    projectConfig.markovModels = (projectConfig.markovModels || []).filter(m => m.id !== id);
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}   // 13 Sep 2026 (R18)
    renderMarkovModels();
    calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
}
function setMarkovName(id, val) { const m = getMarkovModel(id); if (m) m.name = val; }
function addMarkovState(id) {
    const m = getMarkovModel(id); if (!m) return;
    _mkEnsureIds(m);
    const base = 'State ' + (m.states.length + 1);
    let name = base, idx = 0;
    while (m.states.some(s => s.name === name)) { idx++; name = base + '·' + idx; }
    m.states.push({ id: _mkNewId('st'), name, isFailed: false });
    _mkTouched('Markov model "' + m.name + '": added state "' + name + '"');
    renderMarkovModels();
}
function deleteMarkovState(id, stateName) {
    const m = getMarkovModel(id); if (!m) return;
    _mkEnsureIds(m);
    m.states = m.states.filter(s => s.name !== stateName);
    m.transitions = m.transitions.filter(t => t.from !== stateName && t.to !== stateName);
    if (m.initialState === stateName) delete m.initialState;
    if (m.initialProbs && Object.prototype.hasOwnProperty.call(m.initialProbs, stateName)) { delete m.initialProbs[stateName]; if (!Object.keys(m.initialProbs).length) delete m.initialProbs; }
    _mkTouched('Markov model "' + m.name + '": removed state "' + stateName + '"');
    renderMarkovModels();
}
function setMarkovStateField(id, oldName, field, val) {
    const m = getMarkovModel(id); if (!m) return;
    _mkEnsureIds(m);
    const s = m.states.find(s => s.name === oldName); if (!s) return;
    if (field === 'name') {
        const trimmed = String(val).trim();
        if (!trimmed || m.states.some(o => o !== s && o.name === trimmed)) { renderMarkovModels(); return; }
        m.transitions.forEach(t => { if (t.from === oldName) t.from = trimmed; if (t.to === oldName) t.to = trimmed; });
        if (m.initialState === oldName) m.initialState = trimmed;   // 13 Oct 2026: the start follows the rename
        if (m.initialProbs && Object.prototype.hasOwnProperty.call(m.initialProbs, oldName)) { m.initialProbs[trimmed] = m.initialProbs[oldName]; delete m.initialProbs[oldName]; }
        s.name = trimmed;
    } else if (field === 'isFailed') {
        s.isFailed = !!val;
        if (s.isFailed) delete s.degraded;
    } else if (field === 'type') {                                  // 13 Oct 2026: operational | degraded | failed
        s.isFailed = val === 'failed';
        if (val === 'degraded') s.degraded = true; else delete s.degraded;
    } else if (field === 'start') {                                 // 13 Oct 2026: starting probability of this state
        const raw = String(val == null ? '' : val).trim(), p = raw === '' ? 0 : parseFloat(raw);
        if (!(isFinite(p) && p >= 0 && p <= 1)) { if (typeof showToast === 'function') showToast('A starting probability is a number between 0 and 1.', 'warning'); renderMarkovModels(); return; }
        const cur = _markovStartProbs(m);
        cur[s.name] = p;
        if (p === 1) { m.initialState = s.name; delete m.initialProbs; }   // certain to start here: the plain starting state
        else { const ip = {}; m.states.forEach(x => { if (cur[x.name]) ip[x.name] = cur[x.name]; }); m.initialProbs = ip; delete m.initialState; }
    }
    _mkTouched('Markov model "' + m.name + '": changed state "' + s.name + '"');
    renderMarkovModels();
}
// The starting probability of every state as the solver reads it (initialProbs, else the starting
// state, else the first state).
function _markovStartProbs(m) {
    const out = {};
    if (!m || !Array.isArray(m.states) || !m.states.length) return out;
    if (m.initialProbs && typeof m.initialProbs === 'object') { Object.keys(m.initialProbs).forEach(k => { out[k] = parseFloat(m.initialProbs[k]) || 0; }); return out; }
    const nm = m.initialState != null && m.states.some(s => s.name === m.initialState) ? m.initialState : m.states[0].name;
    out[nm] = 1;
    return out;
}
// Failure (λ) or repair (μ): what the transition says it is, else read from the states it joins
// (out of a failed state into a working one is a repair, as the phased multiplier reads it).
function _markovTransitionKind(m, t) {
    if (t && (t.kind === 'failure' || t.kind === 'repair')) return t.kind;
    try { if (window.SLMarkovDiagram) return SLMarkovDiagram.transKind(m, t); } catch (_) {}   // one rule for the table and the diagram
    const f = (m.states || []).find(s => s.name === t.from), to = (m.states || []).find(s => s.name === t.to);
    return f && f.isFailed && to && !to.isFailed ? 'repair' : 'failure';
}
function addMarkovTransition(id) {
    const m = getMarkovModel(id); if (!m || m.states.length < 2) return;
    _mkEnsureIds(m);
    m.transitions.push({ id: _mkNewId('tr'), from: m.states[0].name, to: m.states[1].name, rate: 0 });
    _mkTouched('Markov model "' + m.name + '": added a transition');
    renderMarkovModels();
}
function deleteMarkovTransition(id, idx) {
    const m = getMarkovModel(id); if (!m) return;
    _mkEnsureIds(m);
    m.transitions.splice(idx, 1);
    _mkTouched('Markov model "' + m.name + '": removed a transition');
    renderMarkovModels();
}
function setMarkovTransition(id, idx, field, val) {
    const m = getMarkovModel(id); if (!m || !m.transitions[idx]) return;
    _mkEnsureIds(m);
    if (field === 'rate') m.transitions[idx].rate = Math.max(0, parseFloat(val) || 0);
    else if (field === 'kind') m.transitions[idx].kind = val === 'repair' ? 'repair' : 'failure';
    else m.transitions[idx][field] = val;
    _mkTouched('Markov model "' + m.name + '": changed a transition');
    renderMarkovModels();
}
// Backlog #8 — closed-form steady-state availability NEXT TO the exact Markov
// result, clearly labeled as the estimate lane. For a single 2-state model the
// identity A = μ/(λ+μ) is EXACT — rendered as a live cross-check of the solver.
// The μ≫λ form (Q ≈ λ/μ) is shown only as the approximation, never the result.
// Multi-state models get no closed-form line: the exact solver is the only lane.
function markovClosedForm(m) {
    if (!m || !Array.isArray(m.states) || m.states.length !== 2) return null;
    const failedIdx = m.states.map((s, i) => s.isFailed ? i : -1).filter(i => i >= 0);
    if (failedIdx.length !== 1) return null;
    const bad = m.states[failedIdx[0]].name;
    const ok = m.states[1 - failedIdx[0]].name;
    let lam = 0, mu = 0;
    (m.transitions || []).forEach(t => {
        const r = parseFloat(t.rate) || 0;
        if (r <= 0) return;
        if (t.from === ok && t.to === bad) lam += r;
        if (t.from === bad && t.to === ok) mu += r;
    });
    if (!(lam > 0 && mu > 0)) return null;
    return { lambda: lam, mu: mu, A: mu / (lam + mu), Q: lam / (lam + mu), Qapprox: lam / mu };
}
function _markovClosedFormHtml(m, result) {
    try {
        const cf = markovClosedForm(m);
        if (!cf) return '';
        const match = result && result.ok && Math.abs(cf.Q - result.pFailed) <= Math.max(1e-15, Math.abs(result.pFailed) * 1e-9);
        const tip = 'Closed-form steady state for a single 2-state repairable unit: A = μ/(λ+μ), Q = λ/(λ+μ) — exact here, so it cross-checks the solver. The μ≫λ form is an approximation only and never the result. λ and μ are the user-entered transition rates.';
        return `<div style="font-family: monospace; font-size: 0.78em; color: var(--text-secondary); margin: -4px 0 10px;" title="${esc(tip)}">
            closed-form steady state: A = μ/(λ+μ) = ${cf.A.toPrecision(6)} · Q = λ/(λ+μ) = ${cf.Q.toExponential(4)}
            ${match ? '<span style="color:#1D6E3E; font-weight:600;">— matches exact solver ✓</span>' : '<span style="color:#8E2A2A; font-weight:600;">— differs from exact solver (check transitions)</span>'}
            · μ≫λ approximation only: Q ≈ λ/μ = ${cf.Qapprox.toExponential(4)}
            <span class="ai-est-pill" style="display:inline-block; font-size:9.5px; font-weight:600; padding:1px 7px; margin-left:6px; border-radius:999px; box-shadow:inset 0 0 0 1.5px currentColor; color:#9A6200; cursor:help;">CLOSED FORM · 2-STATE EXACT</span>
        </div>`;
    } catch (_) { return ''; }
}
function renderMarkovModels() {
    if (typeof SLLazy !== 'undefined' && SLLazy.defer('markov-models-container', 'renderMarkovModels', arguments)) return;   // lazy_render.js: off screen -> pending, runs on arrival
    const container = document.getElementById('markov-models-container');
    if (!container) return;
    // 24 Oct 2026 (tree_homes.js): the models of the level being worked on: those the level's trees use, else
    // the level a model was made at, else Standalone
    const _allModels = (projectConfig && projectConfig.markovModels) || [];
    const models = (typeof SLTreeHomes !== 'undefined' && SLTreeHomes.inLevel) ? _allModels.filter(m => SLTreeHomes.inLevel('markov', m)) : _allModels;
    if (models.length === 0) { container.innerHTML = '<p style="color: var(--text-secondary); font-style: italic; padding: 10px;">No Markov models at this level. Click + Add Markov Model to create one.</p>'; try { if (window.SLMarkovDiagram) SLMarkovDiagram.attach(container); } catch (_) {} return; }
    container.innerHTML = models.map(m => {
        const result = solveMarkovModel(m);
        const starts = _markovStartProbs(m);
        const typeOf = s => s.isFailed ? 'failed' : (s.degraded ? 'degraded' : 'operational');
        const stateRows = m.states.map(s => `<tr>
            <td><input type="text" value="${esc(s.name)}" onchange="setMarkovStateField('${esc(m.id)}', '${esc(s.name)}', 'name', this.value)" class="u-mb0"></td>
            <td><select onchange="setMarkovStateField('${esc(m.id)}', '${esc(s.name)}', 'type', this.value)" class="u-mb0" style="min-width:118px;" aria-label="State type of ${esc(s.name)}">${[['operational', 'Operational'], ['degraded', 'Degraded'], ['failed', 'Failed']].map(o => `<option value="${o[0]}"${typeOf(s) === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></td>
            <td><input type="text" inputmode="decimal" value="${starts[s.name] ? esc(String(starts[s.name])) : ''}" placeholder="0" onchange="setMarkovStateField('${esc(m.id)}', '${esc(s.name)}', 'start', this.value)" class="u-mb0" style="width:62px;" aria-label="Starting probability of ${esc(s.name)}"></td>
            <td style="font-family: monospace; text-align: right;">${result.ok ? (result.pi[m.states.indexOf(s)] || 0).toExponential(3) : '—'}</td>
            <td><button class="action-btn btn-red" onclick="deleteMarkovState('${esc(m.id)}', '${esc(s.name)}')">X</button></td>
        </tr>`).join('');
        const stateOpts = m.states.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
        const txRows = m.transitions.map((t, i) => `<tr>
            <td><select onchange="setMarkovTransition('${esc(m.id)}', ${i}, 'from', this.value)" class="u-mb0">${stateOpts.replace(`value="${esc(t.from)}"`, `value="${esc(t.from)}" selected`)}</select></td>
            <td style="text-align:center;">→</td>
            <td><select onchange="setMarkovTransition('${esc(m.id)}', ${i}, 'to', this.value)" class="u-mb0">${stateOpts.replace(`value="${esc(t.to)}"`, `value="${esc(t.to)}" selected`)}</select></td>
            <td><select onchange="setMarkovTransition('${esc(m.id)}', ${i}, 'kind', this.value)" class="u-mb0" style="min-width:58px;" aria-label="Transition type: failure (λ) or repair (μ)" title="λ: a failure. μ: a repair (restoration).">${[['failure', 'λ'], ['repair', 'μ']].map(o => `<option value="${o[0]}"${_markovTransitionKind(m, t) === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></td>
            <td><input type="number" step="any" min="0" value="${t.rate}" onchange="setMarkovTransition('${esc(m.id)}', ${i}, 'rate', this.value)" class="u-mb0"></td>
            <td><button class="action-btn btn-red" onclick="deleteMarkovTransition('${esc(m.id)}', ${i})">X</button></td>
        </tr>`).join('');
        const pFailedTxt = result.ok ? result.pFailed.toExponential(4) : 'n/a';
        return `<div class="controls mk-card" data-mk-id="${esc(m.id)}" style="border-left-color: #0e7490;">
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
                <input type="text" value="${esc(m.name)}" onchange="setMarkovName('${esc(m.id)}', this.value)" style="flex:1; margin-bottom:0; font-weight:bold;">
                <span style="font-family: monospace; font-size: 0.9em; color: var(--header-color);">P(failed) = ${pFailedTxt}</span>
                <code style="font-size:0.75em; color: var(--text-secondary);">${esc(m.id)}</code>
                <button class="action-btn btn-red" onclick="deleteMarkovModel('${esc(m.id)}')">Delete Model</button>
            </div>
            ${_markovClosedFormHtml(m, result)}
            <div class="mk-diagram-host" data-mk-id="${esc(m.id)}" style="margin:0 0 12px;"></div>
            <div class="grid-2-col">
                <div>
                    <h5 style="margin:0 0 6px 0; color: var(--header-color);">States</h5>
                    <table style="width:100%; font-size: 0.85em;"><thead><tr><th class="u-text-left">Name</th><th>Type</th><th title="Probability of starting in this state (the start arrows on the diagram). Blank is 0; together they add up to 1.">Start</th><th style="text-align:right;">π (steady)</th><th></th></tr></thead><tbody>${stateRows}</tbody></table>
                    <button class="btn-cyan action-btn" onclick="addMarkovState('${esc(m.id)}')" style="margin-top:6px;">+ State</button>
                </div>
                <div>
                    <h5 style="margin:0 0 6px 0; color: var(--header-color);">Transitions (rate /hr)</h5>
                    <table style="width:100%; font-size: 0.85em;"><thead><tr><th>From</th><th></th><th>To</th><th>Type</th><th>Rate</th><th></th></tr></thead><tbody>${txRows}</tbody></table>
                    <button class="btn-cyan action-btn" onclick="addMarkovTransition('${esc(m.id)}')" style="margin-top:6px;">+ Transition</button>
                </div>
            </div>
            <div class="mk-phase-host" data-mk-id="${esc(m.id)}"></div>
        </div>`;
    }).join('');
    try { if (window.SLMarkovDiagram) SLMarkovDiagram.attach(container); } catch (e) { try { console.warn('[markov] diagram attach failed', e); } catch (_) {} }
}

// Resolve a basic event's effective λ for the *active* FTA context. Falls back through:
//   • per-phase override (time-weighted average across the linked FHA's phases), then
//   • flat node.lambda.
function getEffectiveLambda(node) {
    const flat = node.lambda || 0;
    if (!node.lambdaByPhase || !ftaConfig.linkedFhaId) return flat;
    const isAC = ftaConfig.linkedFhaId.startsWith('AC_');
    const realId = ftaConfig.linkedFhaId.replace('AC_', '').replace('SYS_', '');
    const fha = isAC ? acFhaData.find(x => String(x.internalId) === String(realId))
                     : getAllSysFha().find(x => String(x.internalId) === String(realId));
    if (!fha || !fha.phases) return flat;
    const phases = String(fha.phases).split(',').map(s => s.trim()).filter(Boolean);   // 28 Aug 2026 — array-tolerant; this reader threw inside selectNode and killed the drawer on AI trees
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
            const fha = isAC ? acFhaData.find(x => String(x.internalId) === String(realId))
                             : getAllSysFha().find(x => String(x.internalId) === String(realId));
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
    if (!root) { if (out) out.innerHTML = ''; showToast('Tree is empty.', 'warning', 4000); return; }
    const r = simulateDFT(root, ftaConfig.exposureTime || 1, 20000);
    if (!out) return;
    const dynCount = r.dynGateCount || 0;
    // DFT-WARM receipt — a warm spare or an imperfect switch changes what the number
    // MEANS, so the result says which spare model produced it rather than leaving the
    // reader to open the gate and check.
    const spareBits = [];
    if (r.warmSpares) spareBits.push(`${r.warmSpares} warm spare gate(s) (dormant exposure charged)`);
    if (r.imperfectSwitches) spareBits.push(`${r.imperfectSwitches} imperfect switch(es) (takeover can fail on demand)`);
    const spareNote = spareBits.length
        ? `<div style="margin-top:4px; color: var(--text-secondary); font-size: 0.8em;">Spare model: ${spareBits.join(' · ')}. Cold spares with a perfect switch are the default and are not listed.</div>`
        : '';
    const note = dynCount === 0
        ? '<div style="margin-top:6px; padding:8px; background:#fef3c7; border:1px solid #f59e0b; border-radius:4px; color:#78350f; font-size:0.85em;">No dynamic gates (PAND / SPARE / SEQ / FDEP) in this tree — Monte Carlo just confirms the BDD result. Add a dynamic gate to exercise time-ordered semantics.</div>'
        : `<div style="margin-top:6px; color: var(--text-secondary); font-size: 0.85em;">Tree contains ${dynCount} dynamic gate(s). The static number counts functional dependencies exactly, solves a priority AND or spare exactly when its inputs are constant-rate basic events used nowhere else, and holds an upper bound otherwise (the canvas line under each gate says which). This simulation is the independent cross-check.</div>`;
    out.innerHTML = `<div style="padding: 10px; background: var(--bg-control); border: 1px solid var(--border-primary); border-radius: 4px;">
        <strong>DFT Simulation (Monte Carlo, N = ${r.N.toLocaleString()}, mission t = ${(ftaConfig.exposureTime || 1).toFixed(3)} hr):</strong>
        <div style="margin-top:6px; font-family: monospace; font-size: 0.95em; color: #be185d;">
            P(top) ≈ ${r.p.toExponential(4)}  ±${r.stderr.toExponential(2)} (1σ)
        </div>
        <div style="margin-top:4px; color: var(--text-secondary); font-size: 0.8em;">Seed ${r.seed} (mulberry32) — same seed, same tree ⇒ same figure. Reproducible by construction.</div>${spareNote}${note}
    </div>`;
}

function runUncertaintyDisplay() {
    const root = getActiveFTARoot();
    const out = document.getElementById('uncertainty-summary');
    if (!root) { if (out) out.innerHTML = ''; showToast('Tree is empty.', 'warning', 4000); return; }
    // Warn if no basic event has a non-trivial EF — the sampler will produce a delta at the point estimate.
    const anyEF = (function check(n) {
        if (!n) return false;
        if (n.type !== 'gate' && (n.lambdaEF || 1) > 1) return true;
        const kids = n.children || n._children;
        return kids ? kids.some(check) : false;
    })(root);
    let r;
    try { r = runUncertaintyAnalysis(root, 10000); }
    catch (e) {
        // ENG-1 — BDD refusal surfaces as a message, not a dead button.
        if (out) out.innerHTML = '<div style="padding:10px; background:var(--bg-control); border:1px solid var(--border-primary); border-radius:4px; color:#b91c1c; font-size:0.9em;">' + esc((e && e.message) || String(e)) + '</div>';
        return;
    }
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
        </div>
        <div style="margin-top:4px; color: var(--text-secondary); font-size: 0.8em;">Seed ${r.seed} (mulberry32) — same seed, same tree ⇒ same figure. Reproducible by construction.</div>${pad}
    </div>`;
}

// Box-Muller standard normal sample from the SUPPLIED seeded rng. One call → one z ~ N(0, 1).
// MC-SEED: no rng, no sample — Math.random() is banned in this file.
function _normSample(rng) {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Monte-Carlo uncertainty propagation. Each basic event's λ is sampled from a lognormal
// distribution defined by (median = node.lambda, error factor EF = node.lambdaEF or 1).
// The BDD is built once and probMap is re-sampled every trial.
function runUncertaintyAnalysis(rootNode, N, seed) {
    N = N || 10000;
    const usedSeed = (seed == null ? 42 : seed) >>> 0;
    const rng = _mcMulberry(usedSeed);
    const built = buildBDDFromFT(rootNode);
    const { varOrder, varMeta } = built;
    if (!varOrder.length) return { samples: [], mean: 0, median: 0, p05: 0, p95: 0, N: 0, seed: usedSeed };
    const exposure = ftaConfig.exposureTime || 1;
    // Pre-compute σ_ln per variable: σ = ln(EF) / 1.645 (since EF = exp(1.645·σ) for 90% CI).
    // The median λ here already accounts for phase-of-flight weighting if the event uses it.
    //
    // Phase 61 (F3 fix): the sampled distribution uses the SAME common cause split as the point
    // estimate. 13 Oct 2026 (fix 3, MGL): each CCF member's q is sampled ONCE per trial and every
    // variable that depends on it (the member's own variable and each common cause event that
    // contains it) is computed from those sampled values with _mglEventProb, exactly the function
    // _probMapFor uses. Variables without CCF are sampled in variable order as before, so trees
    // without common cause draw the same random sequence and give the same samples.
    const _sampleSpec = node => {
        const median = getEffectiveLambda(node);
        const EF = node.lambdaEF && node.lambdaEF > 1 ? node.lambdaEF : 1;
        return { node, median, sigma: EF > 1 ? Math.log(EF) / 1.645 : 0 };
    };
    const _sampleQ = sp => {
        const z = sp.sigma > 0 ? _normSample(rng) : 0;
        const lambdaSampled = sp.median * Math.exp(sp.sigma * z);
        // Phase 61: leaves without rate data (probability-only allocation budgets) contribute
        // their stored probability; there is no λ to sample.
        return (sp.median > 0) ? effectiveProbFromLambda(lambdaSampled, sp.node, exposure) : (sp.node.probability || 0);
    };
    const meta = varOrder.map((node, idx) => {
        const vm = (varMeta && varMeta[idx]) || null;
        if (vm && vm.ccf) return { ccf: vm.ccf, idxs: vm.ccfIdx };
        return { spec: _sampleSpec((vm && vm.node) || node) };
    });
    const memberSpecs = new Map();
    meta.forEach(m => { if (m.ccf) m.ccf.members.forEach(n => { if (!memberSpecs.has(n)) memberSpecs.set(n, _sampleSpec(n)); }); });
    const samples = new Array(N);
    for (let i = 0; i < N; i++) {
        const probMap = new Map();
        const qMember = new Map();
        const qOf = n => {
            if (!qMember.has(n)) qMember.set(n, (n && n.eventClass === 'dev-error') ? 0 : _sampleQ(memberSpecs.get(n)));
            return qMember.get(n);
        };
        for (let v = 0; v < meta.length; v++) {
            const m = meta[v];
            probMap.set(v, m.ccf ? _mglEventProb(m.ccf, m.idxs, qOf) : _sampleQ(m.spec));
        }
        samples[i] = _bddAvgProbability(built, probMap);   // 13 Oct 2026 (F5): same time average as P(top)
    }
    samples.sort((a, b) => a - b);
    return {
        samples, N, seed: usedSeed,
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
        if (meta && meta.synthetic === 'order') return; // 13 Oct 2026 (F4): a time-order factor is not an event
        if (meta && meta.type === 'group') return; // CCF group rows are derived — skip from the per-event ranking
        // 13 Oct 2026 (F5): cofactors are time-averaged over a shared inspection cycle like P(top).
        const pX1 = _bddAvgProbability(ex, probMap, varIdx, 1);
        const pX0 = _bddAvgProbability(ex, probMap, varIdx, 0);
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

// Expand a list of minimal cutsets so every common cause event is explicit.
// 13 Oct 2026 (fix 6): REBUILT. The old body assumed the β/γ/δ tier model, read the numbers
// from whichever group member came first, expanded only cut sets holding two members, and
// repeated a "CCF" row inside every such cut set, so the same common cause showed many times
// and never as the minimal cut set of one it is when it alone fails an AND of its members. It
// now delegates to SLFTAEngine.explicitCCFCutsets, which reads the group variables of the
// page's own BDD build (computeExactProbability below, the copy the panel's P(top) comes from)
// and returns the minimal cut sets of exactly the function the BDD evaluates: each common
// cause event once, as one named event (isCCF, sourceGroup, members), and each member's
// independent part as "<id> (Ind)" carrying the BDD's own probability and rate. Works for any
// group-variable model. 13 Oct 2026 (fix 6 merged with fix 3): fix 3's own rewrite of this function
// (_expandCcfPlans / _mglMinimalCovers: covers built from _mglPlanGroup, rows only for cut sets
// holding two or more members) is replaced by this one implementation: the catalog reads the
// MGL subset events and their labels from the same BDD build, so the rows are exactly that
// build's minimal cut sets, a single-member cut set shows its common cause events too, and the
// frequency (computeFailureFrequency) uses the same rows. One implementation, not two.
// rootNode: the tree the sets came from (optional; without it the sets' leaves define the
// groups). Trees without a common cause group come back unchanged.
function expandCCFCutsets(minimalCutsets, rootNode) {
    if (typeof SLFTAEngine === 'undefined' || !SLFTAEngine || typeof SLFTAEngine.explicitCCFCutsets !== 'function') return (minimalCutsets || []).slice();
    return SLFTAEngine.explicitCCFCutsets(minimalCutsets, rootNode || null, { computeExact: computeExactProbability });
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
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:12px;color:var(--text-secondary);">
        <b>Cut-set enumeration refused</b> — the deterministic budget guard (cap: ${_CUTSET_BUDGET.toLocaleString()} combinations${err && err.count ? '; this tree reached ' + err.count.toLocaleString() + '+' : ''}) aborted rather than truncate: an incomplete cut-set list would silently under-report failure combinations.
        <div style="margin-top:6px;">Your options: <b>partition the tree with transfer gates</b> (each partition enumerates within its own budget); <b>reduce large VOTING gate spans</b> (k-of-n over many inputs is the classic combinatorial source); or <b>review deep AND nesting</b> — each AND level multiplies the set count. The exact P(top) below is computed by the BDD engine and is unaffected by this refusal.</div></td></tr>`;
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

// Phase 66 — ALLOCATION SELF-HEAL. Top-down budgets are DERIVED state: they must
// never depend on what a save happened to capture. This re-derives each root
// page's target from its linked FHA severity (cert-basis ladder) and re-runs the
// allocator, so every consumer (canvas, bow-ties, reports, AutoReq) reads fresh
// numbers on load and on page switch — stale or zeroed saves can no longer
// surface as P=0 on the moat surface.
function bakeAllAllocations() {
    if (typeof ftaPages === 'undefined' || !Array.isArray(ftaPages)) return 0;
    const keep = (typeof activeFTAPageId !== 'undefined') ? activeFTAPageId : null;
    let baked = 0;
    ftaPages.forEach(function (p) {
        if (!p || !p.root) return;
        // transfer-chain subtrees are seeded from their root ancestor's pass
        if (p.transferInFrom && p.transferInFrom.sourcePageId) return;
        try {
            activeFTAPageId = p.id;
            if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
            if (typeof refreshFTARequiredTarget === 'function') refreshFTARequiredTarget();
            calculateAllProbabilities();
            baked++;
        } catch (_) {}
    });
    try {
        if (keep != null) {
            activeFTAPageId = keep;
            if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
            if (typeof refreshFTARequiredTarget === 'function') refreshFTARequiredTarget();
        }
    } catch (_) {}
    return baked;
}
try { window.bakeAllAllocations = bakeAllAllocations; } catch (_) {}

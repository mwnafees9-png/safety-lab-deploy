/* ============================================================================
 * Safety Lab Aero — FTA cut-set engine (single source of truth)
 * ============================================================================
 * Moved verbatim out of safety_lab.js so the SAME deterministic code runs in:
 *   (a) the main page  — loaded as a classic <script> BEFORE safety_lab.js, so
 *       getCutsets / multiplyCutsets / getCombinations / _eventKey / _CUTSET_BUDGET /
 *       CutsetExplosionError are globals the app keeps calling unchanged; and
 *   (b) the cut-set Web Worker (#19) — via importScripts('fta_engine.js').
 *
 * Determinism: there is ONE implementation; the worker cannot diverge from the
 * main thread because it is literally the same file. The worker is fed a tree
 * with transfer gates pre-flattened (so it needs no app state), and returns
 * id-encoded cut sets the main thread maps back to real node objects.
 *
 * Air-gap / ITAR: no CDN, no network — importScripts is same-origin only; the
 * worker computes locally and emits nothing off-device.
 *
 * v1.8 (13 Oct 2026, math audit F4/F5): the static P(top) now counts FDEP gates (each dependent
 * becomes OR(dependent, trigger)), solves PAND/SPARE exactly when they are independent modules of
 * constant-rate basic events (cold/warm spare, imperfect switch, strict order) and otherwise holds
 * a conservative bound with the switchover failure as a visible event, and time-averages periodic
 * latent events that share an inspection interval over the shared cycle (lambda1*lambda2*tau^2/3
 * for two under AND). The classic cut-set enumerator follows the same FDEP and switch rules.
 * See the block above _bddCombinations and tests/regression_dynamic_static_20261013.test.js,
 * tests/regression_latent_joint_20261013.test.js.
 *
 * v1.9 (13 Oct 2026, fix 3 merged with F4/F5): common cause groups are the real Multiple Greek
 * Letter model of NUREG/CR-5485: one BDD variable per specific common cause event (the event
 * that fails one specific set of members), probability Q_k^(m); beta alone = beta factor
 * (gamma = delta = 1), so beta-only projects keep their numbers; group parameters resolved in
 * any member order (largest of each, flagged). Interactions with v1.8: a CCF member's leaf is
 * its own variable ORed with its common cause events and THEN forced by any FDEP trigger; a
 * PAND/SPARE with a common cause member stays the conservative bound; a common cause event
 * whose members are periodic latent events with one interval joins that interval's time
 * average. VOTING uses the at-least-k recursion. ccfModelNotes() reports inconsistent groups
 * and the beta-only voting warning. See tests/regression_ccf_mgl_20261013.test.js.
 *
 * v1.10 (13 Oct 2026, fix 6 merged with fix 3 and F4/F5): common cause events are explicit in the
 * cut sets. ccfCatalog / explicitCCFCutsets read the BDD's own group variables (varMeta type
 * 'group': the MGL subset events with their plan, members and labels) and make each one a single
 * named event ("CCF G: A+B") in the minimal cut sets; the page's expandCCFCutsets and the
 * Vesely-Goldberg w_TE both use them, so the frequency includes common cause instead of leaving it
 * out with no flag (audit F6), with each event's MGL rate and each member's independent part.
 *
 * v1.11 (13 Oct 2026, fix G, hand-built fault trees): the SEQ gate (sequence-enforcing, the fourth
 * standard dynamic gate) is solved exactly as a pure-birth Markov chain when it is an independent
 * module of constant-rate basic events (_seqExactProb), else it holds the AND bound with the reason;
 * its cut sets carry the order. The NOT gate (non-coherent, off unless the project allows it) is
 * BDD.not of its input (NOR over several); getCutsets and bddMinimalCutsets list PRIME IMPLICANTS
 * for a tree that has one ("NOT X" members, _bddPrimeImplicants), or refuse in plain words above
 * _PRIME_BUDGET. Coherent trees are unchanged. See tests/regression_fta_handbuild_20261013b.test.js.
 * ========================================================================== */
(function (root) {
'use strict';

// ── Cut-set explosion guard (deterministic-core safeguard) ───────────────────
// Minimal cut-set enumeration is an AND-product (Cartesian) that can blow up
// combinatorially on deep AND nesting / large voting gates. The guard ABORTS the
// whole enumeration (throws) the instant it would exceed _CUTSET_BUDGET — it NEVER
// truncates and returns a partial set (an incomplete cut-set set would silently
// under-report failure combinations). Under the budget, behaviour is byte-identical
// to before, so the deterministic result is unchanged. P(top) is computed by the BDD
// engine, not by cut sets, so an abort here never affects the certification probability.
var _CUTSET_BUDGET = 200000;
function CutsetExplosionError(count) {
    this.name = 'CutsetExplosionError';
    this.count = count || 0;
    this.message = 'Fault tree too complex to enumerate cut sets (' + (count ? count.toLocaleString() : 'over budget') + ' combinations exceeds the ' + _CUTSET_BUDGET.toLocaleString() + ' limit).';
    if (Error.captureStackTrace) Error.captureStackTrace(this, CutsetExplosionError);
}
CutsetExplosionError.prototype = Object.create(Error.prototype);
CutsetExplosionError.prototype.constructor = CutsetExplosionError;
function getCombinations(array, k) { let result = []; function combine(elements, k, start, current) { if (current.length === k) { result.push([...current]); if (result.length > _CUTSET_BUDGET) throw new CutsetExplosionError(result.length); return; } for (let i = start; i < elements.length; i++) { current.push(elements[i]); combine(elements, k, i + 1, current); current.pop(); } } combine(array, k, 0, []); return result; }
// Key cutset elements by logicalId so repeated events (same event in multiple branches)
// dedupe into a single occurrence in the AND-product result.
function _eventKey(e) { return e.logicalId != null ? e.logicalId : e.id; }
function multiplyCutsets(listA, listB) {
    let result = [];
    if (listA.length === 0) return listB;
    if (listB.length === 0) return listA;
    if (listA.length * listB.length > _CUTSET_BUDGET) throw new CutsetExplosionError(listA.length * listB.length);
    for (let a of listA) for (let b of listB) {
        let map = new Map();
        [...a, ...b].forEach(e => map.set(_eventKey(e), e));
        result.push(Array.from(map.values()));
    }
    return result;
}

// 13 Oct 2026 (math audit F4): the classic enumerator follows the same static reductions as the
// BDD: an FDEP dependent's cut sets are its own plus its trigger's (dependent OR trigger), and a
// SPARE with an imperfect switch adds the visible "switchover fails on demand" event:
// primary AND (switch-1 OR (spare-1 AND (switch-2 OR ...))). ctx carries the FDEPs found from the
// top-level call; callers keep calling getCutsets(root) unchanged.
function _csForce(r, triggers, key, visited, ctx) {
    if (ctx.forcing.has(key)) return r;
    ctx.forcing.add(key);
    const out = r.slice();
    for (const t of triggers) {
        const sub = getCutsets(t, new Set(visited), ctx);
        for (let si = 0; si < sub.length; si++) out.push(sub[si]);
        if (out.length > _CUTSET_BUDGET) throw new CutsetExplosionError(out.length);
    }
    ctx.forcing.delete(key);
    return out;
}
function getCutsets(node, visited = new Set(), ctx) {
    if (!ctx) {
        // 13 Oct 2026 (fix G): a tree with a NOT gate is non-coherent; its cut sets are prime implicants.
        if (node && _treeHasNot(node)) return _primeImplicantCutsets(node);
        ctx = { fdep: _collectFdep(node), forcing: new Set() };
    }
    if (!node) return []; if (visited.has(node)) return []; visited.add(node);   // F1: by the node itself, not its id (ids repeat across pages)
    if (node.type !== 'gate') {
        const trig = ctx.fdep.byLid.get(_eventKey(node));
        return trig ? _csForce([[node]], trig, 'l:' + _eventKey(node), visited, ctx) : [[node]];
    }
    const r = _gateCutsets(node, visited, ctx);
    const gtrig = ctx.fdep.byGate.get(node.id);
    return gtrig ? _csForce(r, gtrig, 'g:' + node.id, visited, ctx) : r;
}
function _gateCutsets(node, visited, ctx) {
    if (node.gateType === 'TRANSFER' || node.transferOutTo) {
        const linkedId = node.transferOutTo || node.linkedPageId;
        // Resolve transfers via the page table when available (main thread). In a Worker the tree
        // is pre-flattened (no transfers remain), so this lookup is guarded and simply not needed.
        if (linkedId && typeof ftaPages !== 'undefined' && ftaPages) { const linkedPage = ftaPages.find(p => p.id === linkedId); if (linkedPage && linkedPage.root) return getCutsets(linkedPage.root, visited, ctx); }
        if (node.gateType === 'TRANSFER') return [];
        // Logical transfer-out with missing destination — fall through to local (empty) children below.
    }
    let actualChildren = node.children || node._children; if (!actualChildren || actualChildren.length === 0) return [];
    // #7b hardening — child results are appended with a LOOP, never push(...spread):
    // argument-spread materializes every element on the JS call stack, so a child
    // yielding ~100k+ cut sets threw RangeError (stack overflow) BEFORE the budget
    // guard could fire. The loop is byte-identical in output order; only the abort
    // mode changes (deterministic CutsetExplosionError instead of an environment-
    // dependent stack limit).
    if (node.gateType === 'OR' || node.gateType === 'XOR') { let r = []; for (let c of actualChildren) { const sub = getCutsets(c, new Set(visited), ctx); for (let si = 0; si < sub.length; si++) r.push(sub[si]); if (r.length > _CUTSET_BUDGET) throw new CutsetExplosionError(r.length); } return r; }
    else if (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE' || node.gateType === 'SEQ') {
        let r;
        if (node.gateType === 'SPARE' && _spareSwitchP(node) < 1 && actualChildren.length >= 2) {
            const ps = _spareSwitchP(node);
            let R = null;
            for (let j = actualChildren.length - 1; j >= 1; j--) {
                const kid = getCutsets(actualChildren[j], new Set(visited), ctx);
                const inner = R ? multiplyCutsets(kid, R) : kid;
                R = [[_dynSyntheticNode(node, 'switch', j, 1 - ps, actualChildren[j])]];
                for (let si = 0; si < inner.length; si++) R.push(inner[si]);
                if (R.length > _CUTSET_BUDGET) throw new CutsetExplosionError(R.length);
            }
            r = multiplyCutsets(getCutsets(actualChildren[0], new Set(visited), ctx), R);
        } else {
            r = getCutsets(actualChildren[0], new Set(visited), ctx);
            for (let i = 1; i < actualChildren.length; i++) r = multiplyCutsets(r, getCutsets(actualChildren[i], new Set(visited), ctx));
        }
        // Tag dynamic-gate cutsets so the report can flag the required ordering.
        if (node.gateType === 'PAND' || node.gateType === 'SPARE' || node.gateType === 'SEQ') {
            const orderTags = actualChildren.map(c => c.displayId || '?');
            r.forEach(cs => { cs.dynamicOrigin = node.gateType; cs.dynamicOrder = orderTags.join(node.gateType === 'SPARE' ? ' ⇉ ' : ' → '); });
        }
        return r;
    }
    else if (node.gateType === 'FDEP') { return []; }
    else if (node.gateType === 'VOTING') { let c = actualChildren.map(ch => getCutsets(ch, new Set(visited), ctx)); let k = Math.min(node.votingK || 2, actualChildren.length); let combs = getCombinations(c, k); let r = []; for (let comb of combs) { let mult = comb[0]; for(let i=1; i<k; i++) mult = multiplyCutsets(mult, comb[i]); for (let mi = 0; mi < mult.length; mi++) r.push(mult[mi]); if (r.length > _CUTSET_BUDGET) throw new CutsetExplosionError(r.length); } return r; }  /* Phase 44: default K=2 for safety. #7b: loop-append (see OR branch). */
    return [];
}

// ── Worker support (#19) ─────────────────────────────────────────────────────
// Pre-flatten transfer gates into a self-contained tree so the Worker needs no app
// state. Inlines each resolvable transfer with the linked page's root (mirroring the
// getCutsets transfer recursion), and builds an id→node index for result reconstruction.
function _cloneNodeShallow(n) { const c = {}; for (const k in n) { if (k !== 'children' && k !== '_children') c[k] = n[k]; } return c; }
function flattenTransfers(rootNode, pages) {
    const index = {};
    function rec(node, seenPages) {
        if (!node) return null;
        if (node.gateType === 'TRANSFER' || node.transferOutTo) {
            const linkedId = node.transferOutTo || node.linkedPageId;
            if (linkedId && !seenPages.has(linkedId)) {
                const lp = (pages || []).find(function (p) { return p.id === linkedId; });
                if (lp && lp.root) { const s2 = new Set(seenPages); s2.add(linkedId); return rec(lp.root, s2); }
            }
            // Unresolved / cyclic transfer → keep node as-is; getCutsets yields [] for it.
        }
        const clone = _cloneNodeShallow(node);
        index[clone.id] = clone;
        const kids = node.children || node._children;
        if (kids && kids.length) clone.children = kids.map(function (c) { return rec(c, seenPages); }).filter(Boolean);
        return clone;
    }
    const newRoot = rec(rootNode, new Set());
    return { root: newRoot, index: index };
}
// Run enumeration and encode each cut set as { ids:[...], dyn:{o,ord}|null } — fully
// structured-cloneable (no node refs, no custom array props lost in transit).
function enumerateForWorker(flatRoot) {
    const cutsets = getCutsets(flatRoot);
    return cutsets.map(function (cs) {
        const enc = { ids: cs.filter(function (e) { return !e._synthetic; }).map(function (e) { return e.id; }) };
        // 13 Oct 2026 (F4): a synthetic member (a SPARE's "switchover fails" event) has no tree
        // node to map back to, so it travels whole; dropping it would show a false single failure.
        const syn = cs.filter(function (e) { return e._synthetic; });
        if (syn.length) enc.syn = syn.map(function (e) { return _cloneNodeShallow(e); });
        if (cs.dynamicOrigin) enc.dyn = { o: cs.dynamicOrigin, ord: cs.dynamicOrder };
        return enc;
    });
}

// ── #17 — BDD exact P(top) + importance (worker-offloadable) ─────────────────────────────────
// Pure over the tree structure + BAKED node probabilities (node.probability / beta/gamma/delta /
// ccfGroup). The entangled probability-derivation (exposure/phases/config/Markov) runs on the main
// thread and bakes node.probability BEFORE this — so the BDD combinatorics here need no app state
// (transfers handled by pre-flattening, same as the cut-set path). Copied verbatim from the
// main-thread engine; a parity harness asserts identical P(top)/importance.
const BDD = (function () {
    const T0 = { id: 0, isTerminal: true, value: false, varIdx: Infinity };
    const T1 = { id: 1, isTerminal: true, value: true,  varIdx: Infinity };
    // ENG-1 — fixed node budget (game-engine discipline: predictable refusal,
    // never an environment-dependent crash). Adversarial variable interleaving
    // (globally scattered repeated events) can drive the unique table toward
    // the JS Map hard limit (~16.7M entries) — minutes of grinding ending in
    // "Map maximum size exceeded". The budget converts that into a fast,
    // DETERMINISTIC refusal: identical on every machine. Behaviour below the
    // budget is byte-identical.
    //
    // RAISED TWICE ON 7 Aug 2026: 1,000,000 -> 4,000,000 -> 40,000,000. The reason
    // matters more than the number. This counts nodes ALLOCATED during
    // construction, not the size of the answer. Measured on the deployed build in
    // Chrome: an independent-event tree produces a final BDD of EXACTLY one node
    // per event (20,000 events -> 20,000 nodes; 40,000 -> 40,000; 71,000 -> 71,000),
    // yet the 1M budget refused at 72,000 events because construction churns
    // through roughly 14x the final size. The ceiling was an arena-accounting
    // artefact, not a complexity limit -- a 200,000-event tree yields a
    // ~200,000-node ANSWER that the old budget could never reach. At that ceiling
    // the tab used 103 MB of a 4,192 MB allowance: ~40x headroom sitting unused.
    //
    // FIRST RAISE (-> 4,000,000), bisected against a 200,000-event target, which was
    // the largest tree anyone had asked for at the time. Chrome, his Mac:
    //     budget      200k-event tree        adversarial refusal
    //     1,000,000   REFUSED                ~1.6 s
    //     3,000,000   REFUSED                 4.8 s
    //     4,000,000   4,469 ms, BDD 200,000   5.9 s
    //     8,000,000   4,756 ms                12.5 s, +567 MB
    //
    // SECOND RAISE (-> 40,000,000) follows an explicit product decision: up to about
    // ten minutes of computation is acceptable PROVIDED THE MATHS STAYS EXACT. That
    // moves the target from 200,000 events to millions, and 4M nodes cannot reach it.
    //
    // Measured end to end (Node 22 in a Linux container that runs this engine about
    // 3.5x slower than the reference Mac). THE RATIO IS MEASURED, on three separate
    // workloads, which is why the "est. Mac" column is a division rather than a
    // guess: 100,000 events 6.4 s vs 1.8 s = 3.6x; 200,000 events 14.3 s vs 4.4 s
    // = 3.25x; the adversarial refusal 20.7 s vs 5.9 s = 3.5x. Take 3.5.
    //     basic events   canvas nodes   container   est. Mac   peak heap
    //       100,000        150,174        6.4 s       1.8 s*      141 MB
    //       200,000        299,807       14.3 s       4.4 s*      101 MB
    //       300,000        450,004         81 s      ~23 s         27 MB
    //       500,000        750,251         46 s      ~13 s         35 MB
    //     1,000,000      1,500,053        197 s      ~56 s      1,359 MB
    //     2,000,000      3,001,363        271 s      ~77 s      1,219 MB
    //   * measured DIRECTLY on the Mac, not derived -- these are the two rows that
    //     establish the ratio the others are divided by.
    // and the harder case, with repeated events rather than all-independent:
    //       200,000 events at 15% repeats -- OK, 29.5 s container, final BDD 311,704.
    // (Peak heap is not monotone in tree size because it is a sampled high-water
    // mark against GC timing, not an allocation total. Do not read the 27 MB row as
    // meaning 300,000 events is cheaper than 200,000.)
    //
    // TWO CONCLUSIONS THAT SHOULD SURVIVE THIS COMMENT.
    // (a) MEMORY IS NOT THE WALL at these sizes. Peak heap never passed 1.4 GB of
    //     the ~4 GB pointer-compression cage -- about a third of it.
    // (b) STACK DEPTH IS. The walk and the apply are recursive; at V8's default
    //     ~1 MB stack a tree of roughly 400,000 basic events dies with
    //     `RangeError: Maximum call stack size exceeded`. --stack-size=4000 clears
    //     it (see safety-lab-desktop/main.js) and carries 2,000,000 events. A
    //     BROWSER TAB CANNOT SET THAT FLAG BY ANY MEANS, which is exactly why the
    //     scalability assessment quotes two ceilings: ~300,000 basic events in the
    //     browser, >= 2,000,000 on the desktop.
    //
    // WHAT THE RAISE COSTS, measured rather than asserted. Budget is paid for in
    // worst-case refusal latency on an adversarial tree -- repeats scattered so no
    // variable order helps. Same shape, same container, only the budget changed:
    //     budget       adversarial refusal      est. Mac
    //      4,000,000        20.7 s                5.9 s (measured, Chrome)
    //     40,000,000       236.2 s              ~67 s
    // That is the accepted trade: a legitimate million-event tree becomes possible,
    // and an intractable one grinds about a minute before it refuses. TWO GUARDS ON
    // THAT TRADE. First, it was re-run under `--max-old-space-size=4096` -- the size
    // of the cage a browser tab and the Electron renderer actually get -- and it
    // STILL REFUSED CLEANLY (BDDExplosionError at 40,000,000 nodes, 243.9 s) rather
    // than dying of memory exhaustion. A budget the process cannot survive reaching
    // would have converted a clean refusal into a tab crash; this one does not.
    // Second, a refusal that takes a minute belongs OFF THE MAIN THREAD -- the
    // worker path already carries it; the page path is the one to watch.
    //
    // It must stay a FIXED number.
    // Deriving it from available memory would make two machines refuse differently
    // on the same tree, which quietly destroys the determinism this budget exists to
    // provide and weakens the qualification argument with it.
    //
    // The better fix underneath is still to count LIVE nodes rather than allocated
    // ones, or to reset the arena between apply operations. Both raises are cheap,
    // safe moves. Neither is the final one.
    const _BDD_NODE_BUDGET = 40000000;
    let nextId = 2;
    // ENG-3 — arena tables. The unique and computed tables are open-addressed
    // hashes over Int32Arrays with integer triple keys — the old string-keyed
    // Maps allocated one key string per makeNode/apply probe, which was the
    // dominant GC load at 100k+ nodes. Same reduction rules, same budget, same
    // node objects (consumers untouched); only the plumbing under them changed.
    // This kernel is IDENTICAL in engine_modules.js (page) and fta_engine.js
    // (worker) — one discipline, both threads; a parity harness asserts equal
    // P(top)/importance.
    let nodes = [T0, T1];                       // id → node (ids are dense)
    let uCap = 1 << 16, uMask = uCap - 1, uCount = 0;
    let uVar = null, uLow = null, uHigh = null, uVal = null;    // uVal: 0 = empty, else node id (ids ≥ 2)
    let cCap = 1 << 16, cMask = cCap - 1, cCount = 0;
    let cOp = null, cF = null, cG = null, cVal = null;          // cVal: 0 = empty, else result id + 1
    function _allocU() { uVar = new Int32Array(uCap); uLow = new Int32Array(uCap); uHigh = new Int32Array(uCap); uVal = new Int32Array(uCap); }
    function _allocC() { cOp = new Int32Array(cCap); cF = new Int32Array(cCap); cG = new Int32Array(cCap); cVal = new Int32Array(cCap); }
    _allocU(); _allocC();
    function _hash3(a, b, c, mask) {
        let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA6B) ^ Math.imul(c | 0, 0xC2B2AE35)) >>> 0;
        h ^= h >>> 15;
        return h & mask;
    }
    function _uGrow() {
        const oVar = uVar, oLow = uLow, oHigh = uHigh, oVal = uVal, oCap = uCap;
        uCap <<= 1; uMask = uCap - 1; _allocU();
        for (let i = 0; i < oCap; i++) {
            if (!oVal[i]) continue;
            let j = _hash3(oVar[i], oLow[i], oHigh[i], uMask);
            while (uVal[j]) j = (j + 1) & uMask;
            uVar[j] = oVar[i]; uLow[j] = oLow[i]; uHigh[j] = oHigh[i]; uVal[j] = oVal[i];
        }
    }
    function _cGrow() {
        const oOp = cOp, oF = cF, oG = cG, oVal = cVal, oCap = cCap;
        cCap <<= 1; cMask = cCap - 1; _allocC();
        for (let i = 0; i < oCap; i++) {
            if (!oVal[i]) continue;
            let j = _hash3(oOp[i], oF[i], oG[i], cMask);
            while (cVal[j]) j = (j + 1) & cMask;
            cOp[j] = oOp[i]; cF[j] = oF[i]; cG[j] = oG[i]; cVal[j] = oVal[i];
        }
    }
    function _budgetError() {
        const e = new Error('BDD exceeded ' + _BDD_NODE_BUDGET.toLocaleString() + ' nodes — the variable structure of this tree (typically repeated events scattered across distant branches) is intractable for exact analysis in one piece. Partition the tree with transfer gates, or restructure so redundant channels sit under nearby gates. The engine refuses rather than degrade exactness.');
        e.name = 'BDDExplosionError';
        e.nodeCount = nextId;
        return e;
    }
    function reset() {
        nextId = 2; nodes = [T0, T1];
        uCap = 1 << 16; uMask = uCap - 1; uCount = 0; _allocU();
        cCap = 1 << 16; cMask = cCap - 1; cCount = 0; _allocC();
    }
    function makeNode(varIdx, low, high) {
        if (low === high) return low;
        let i = _hash3(varIdx, low.id, high.id, uMask);
        while (uVal[i]) {
            if (uVar[i] === varIdx && uLow[i] === low.id && uHigh[i] === high.id) return nodes[uVal[i]];
            i = (i + 1) & uMask;
        }
        if (nextId >= _BDD_NODE_BUDGET) throw _budgetError();
        const node = { id: nextId++, varIdx, low, high, isTerminal: false };
        nodes.push(node);
        uVar[i] = varIdx; uLow[i] = low.id; uHigh[i] = high.id; uVal[i] = node.id;
        if (uCount++ * 10 > uCap * 7) _uGrow();
        return node;
    }
    function variable(varIdx) { return makeNode(varIdx, T0, T1); }
    function topVar(f, g) { return Math.min(f.varIdx, g.varIdx); }
    // apply(op, f, g) — Shannon expansion at the top variable.
    function apply(op, f, g) {
        if (op === 'and') {
            if (f === T0 || g === T0) return T0;
            if (f === T1) return g;
            if (g === T1) return f;
        } else if (op === 'or') {
            if (f === T1 || g === T1) return T1;
            if (f === T0) return g;
            if (g === T0) return f;
        } else if (op === 'xor') {
            if (f === T0) return g;
            if (g === T0) return f;
            if (f === g)  return T0;
        }
        const opc = op === 'and' ? 1 : (op === 'or' ? 2 : 3);
        let i = _hash3(opc, f.id, g.id, cMask);
        while (cVal[i]) {
            if (cOp[i] === opc && cF[i] === f.id && cG[i] === g.id) return nodes[cVal[i] - 1];
            i = (i + 1) & cMask;
        }
        const v = topVar(f, g);
        const f0 = f.varIdx === v ? f.low  : f;
        const f1 = f.varIdx === v ? f.high : f;
        const g0 = g.varIdx === v ? g.low  : g;
        const g1 = g.varIdx === v ? g.high : g;
        const low  = apply(op, f0, g0);
        const high = apply(op, f1, g1);
        const result = makeNode(v, low, high);
        // Re-probe: the recursive calls may have grown the table, moving slots.
        let j = _hash3(opc, f.id, g.id, cMask);
        while (cVal[j]) j = (j + 1) & cMask;
        cOp[j] = opc; cF[j] = f.id; cG[j] = g.id; cVal[j] = result.id + 1;
        if (cCount++ * 10 > cCap * 7) _cGrow();
        return result;
    }
    function not(f) {
        if (f === T0) return T1;
        if (f === T1) return T0;
        const opc = 4;
        let i = _hash3(opc, f.id, 0, cMask);
        while (cVal[i]) {
            if (cOp[i] === opc && cF[i] === f.id && cG[i] === 0) return nodes[cVal[i] - 1];
            i = (i + 1) & cMask;
        }
        const result = makeNode(f.varIdx, not(f.low), not(f.high));
        let j = _hash3(opc, f.id, 0, cMask);
        while (cVal[j]) j = (j + 1) & cMask;
        cOp[j] = opc; cF[j] = f.id; cG[j] = 0; cVal[j] = result.id + 1;
        if (cCount++ * 10 > cCap * 7) _cGrow();
        return result;
    }
    // probability(f, probMap[, memo]) — probMap: varIdx → P. Iterative post-order
    // with an id-indexed Float64Array memo (ids are dense), so deep BDDs never
    // touch the call-stack limit. A Map passed as memo keeps the legacy
    // shared-memo contract for callers that use it.
    function probability(f, probMap, memo) {
        if (f === T0) return 0;
        if (f === T1) return 1;
        if (memo && typeof memo.has === 'function') {
            if (memo.has(f.id)) return memo.get(f.id);
            const p = probMap.get(f.varIdx) || 0;
            const result = (1 - p) * probability(f.low, probMap, memo) + p * probability(f.high, probMap, memo);
            memo.set(f.id, result);
            return result;
        }
        const val = new Float64Array(nextId);
        const seen = new Uint8Array(nextId);
        const stack = [f];
        while (stack.length) {
            const n = stack[stack.length - 1];
            if (n.id <= 1 || seen[n.id]) { stack.pop(); continue; }
            const l = n.low, h = n.high;
            const lReady = l.id <= 1 || seen[l.id];
            const hReady = h.id <= 1 || seen[h.id];
            if (lReady && hReady) {
                const p = probMap.get(n.varIdx) || 0;
                const pl = l.id === 0 ? 0 : (l.id === 1 ? 1 : val[l.id]);
                const ph = h.id === 0 ? 0 : (h.id === 1 ? 1 : val[h.id]);
                val[n.id] = (1 - p) * pl + p * ph;
                seen[n.id] = 1;
                stack.pop();
            } else {
                if (!hReady) stack.push(h);
                if (!lReady) stack.push(l);
            }
        }
        return val[f.id];
    }
    // Count unique non-terminal nodes (useful for diagnostics on tree complexity).
    // A Set passed as seen keeps the legacy contract; default is an id-indexed
    // bitmap + explicit stack (no recursion).
    function size(f, seen) {
        if (seen && typeof seen.has === 'function') {
            if (f.isTerminal) return 0;
            if (seen.has(f.id)) return 0;
            seen.add(f.id);
            return 1 + size(f.low, seen) + size(f.high, seen);
        }
        if (!f || f.isTerminal) return 0;
        const mark = new Uint8Array(nextId);
        let n = 0;
        const st = [f];
        while (st.length) {
            const x = st.pop();
            if (x.isTerminal || mark[x.id]) continue;
            mark[x.id] = 1; n++;
            st.push(x.low, x.high);
        }
        return n;
    }
    return { T0, T1, reset, makeNode, variable, apply, not, probability, size };
})();
function _spareWarmK(node) {
    const k = parseFloat(node && node.spareWarmK);
    return (isFinite(k) && k > 0) ? k : 0;
}
function _spareSwitchP(node) {
    const p = parseFloat(node && node.spareSwitchP);
    return (isFinite(p) && p >= 0 && p < 1) ? p : 1;
}
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
        if (!n || seen.has(n)) return;
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
// varMeta: 'indep' = a basic event's own variable (or a dynamic-gate synthetic, meta.synthetic);
// 'group' = ONE specific common cause event (13 Oct 2026, fix 3, MGL block above). A CCF member's
// leaf is its own variable ORed with every common cause event that contains it, then forced by
// any FDEP trigger; varOrder[v] for a common cause event is the visible event object (isCCF,
// .ccf metadata), so BDD cut sets name it ("CCF G: A+B"). VOTING uses the at-least-k recursion
// (same reduced BDD as the subset expansion, far fewer operations); _bddCombinations stays for
// callers and the page/engine parity check.
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
function computeImportanceMeasures(rootNode) {
    const ex = computeExactProbability(rootNode);
    const { bdd, varOrder, varMeta, probMap, prob: pTop } = ex;
    const measures = [];
    varOrder.forEach((refNode, varIdx) => {
        const meta = varMeta[varIdx];
        if (meta && meta.synthetic === 'order') return; // 13 Oct 2026 (F4): a time-order factor is not an event
        if (meta && meta.type === 'group') return;
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
// Worker entry: serializable importance result (node refs id-encoded; the main thread reconstructs).
function computeImportanceForWorker(flatRoot) {
    const r = computeImportanceMeasures(flatRoot);
    return {
        pTop: r.pTop,
        bddSize: r.bddSize,
        measures: r.measures.map(function (m) {
            return { nodeId: m.node && m.node.id, varIdx: m.varIdx, p: m.p, birnbaum: m.birnbaum, fv: m.fv, raw: m.raw, rrw: m.rrw, critical: m.critical, dim: m.dim };
        })
    };
}

// ── ARP4761A Appendix G (Eq G32–G34) — unconditional failure FREQUENCY (Vesely–Goldberg) ──────
// Distinct from the unavailability P(top): for each minimal cut set, w_CUT = Σ_j w_j·∏_{i≠j}P_i;
// the top-event frequency w_TE = Σ_cutsets w_CUT. Initiators contribute their rate w_j = node.lambda;
// enablers (no rate, probability only) contribute solely as the ∏P_i factors. This is the metric
// for failure conditions whose acceptance criterion is an occurrence RATE rather than an average
// probability per flight hour (the latter is P(top)/t, computed elsewhere). Additive — does not
// change P(top). Cut-set based, valid under the standard's rare-event assumptions.
// MINIMALITY (added 5 Aug 2026). getCutsets() enumerates CUT SETS, not MINIMAL
// cut sets: the OR branch concatenates its children's results, so a tree shaped
// OR(AND(a,b), AND(a,b,c)) yields BOTH {a,b} and its superset {a,b,c}. That is
// harmless for P(top) — computeExactProbability works from the BDD, not from
// these — but it is NOT harmless for anything that SUMS over cut sets. The two
// Cutset_Analysis export paths already minimise inline before reporting; this
// makes the same rule available to every consumer from one place.
// Keys on logicalId where present, so a repeated event under two node ids is
// recognised as one element.
function minimalCutsets(sets) {
    var valid = (sets || []).filter(function (c) { return c && c.length; })
        .slice().sort(function (a, b) { return a.length - b.length; });
    var keptKeys = [], out = [];
    for (var i = 0; i < valid.length; i++) {
        var ids = {}, n = 0;
        for (var j = 0; j < valid[i].length; j++) {
            var e = valid[i][j];
            var k = String(e && e.logicalId != null ? e.logicalId : (e && e.id));
            if (!ids[k]) { ids[k] = 1; n++; }
        }
        var superset = false;
        for (var m = 0; m < keptKeys.length && !superset; m++) {
            var km = keptKeys[m];
            if (km.length > n) continue;
            superset = true;
            for (var q = 0; q < km.length; q++) if (!ids[km[q]]) { superset = false; break; }
        }
        if (!superset) { keptKeys.push(Object.keys(ids)); out.push(valid[i]); }
    }
    return out;
}

// ── 13 Oct 2026 (fix 6): COMMON CAUSE EVENTS MADE EXPLICIT IN THE CUT SETS ──────────────────
// FOUND (math audit F6): the BDD models a common cause group as extra variables (one per
// common cause event: today one per β/γ/δ tier, after the MGL rebuild one per specific failure
// subset) that are ORed into every member they fail. The classic cut-set enumerator never saw
// those variables, so (a) the cut set panel listed {A,B} for a β group instead of the common
// cause event that fails both, with the old expandCCFCutsets repeating a CCF row inside every
// cut set that held two members, and (b) the Vesely–Goldberg frequency w_TE left common cause
// out entirely, with no flag (0.47 of the exact dQ/dt for AND(A,B), β=0.05).
// FIX: ccfCatalog() reads the group variables straight from the BDD build (varMeta type
// 'group'), so it follows whatever model buildBDDFromFT implements: today's tiers, or one
// variable per common cause subset carrying { group, members, k, label }. explicitCCFCutsets()
// substitutes every group member by (its independent part OR each common cause event that
// fails it), multiplies out each cut set and minimizes the result. That is exactly the
// minimal cut sets of the function the BDD evaluates, so each common cause event appears as
// ONE event object, only in the minimal cut sets that need it (a cut set of one when it alone
// fails an AND of its members), and every member carries the probability AND rate the BDD
// uses. computeFailureFrequency sums over these sets, so w_TE now includes common cause.
function _lidOf(n) { return n && n.logicalId != null ? n.logicalId : (n && n.id); }
function _ccfQ(n) { return (n && n.eventClass === 'dev-error') ? 0 : ((n && typeof n.probability === 'number' && isFinite(n.probability)) ? n.probability : 0); }
function _ccfLam(n) { return (n && typeof n.lambda === 'number' && isFinite(n.lambda) && n.lambda > 0) ? n.lambda : 0; }
// Does the tree (transfers followed) hold any leaf declared in a common cause group?
function _treeHasCCF(rootNode) {
    var found = false;
    (function walk(n, seenPages, seenNodes) {
        if (!n || found || seenNodes.has(n)) return; seenNodes.add(n);
        if (n.type !== 'gate') { if (n.ccfGroup) found = true; return; }
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            var linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !seenPages.has(linkedId) && typeof ftaPages !== 'undefined' && ftaPages) {
                seenPages.add(linkedId);
                var lp = ftaPages.find(function (p) { return p && p.id === linkedId; });
                if (lp && lp.root) walk(lp.root, seenPages, seenNodes);
            }
            return;
        }
        var kids = n.children || n._children;
        if (kids) for (var i = 0; i < kids.length && !found; i++) walk(kids[i], seenPages, seenNodes);
    })(rootNode, new Set(), new Set());
    return found;
}
// A tree made of the given leaves only, in their order: the fallback when no root is known
// (or when the full BDD is refused), since group variables depend on the leaves alone.
function _leavesRoot(sets) {
    var seen = new Set(), kids = [];
    (sets || []).forEach(function (cs) { (cs || []).forEach(function (e) { var k = String(_lidOf(e)); if (!seen.has(k)) { seen.add(k); kids.push(e); } }); });
    return { id: '__ccf_leaves__', type: 'gate', gateType: 'OR', children: kids };
}
// The explicit common cause events of a tree, read from the BDD's own group variables.
// opts.computeExact: the exact-probability function to read them from (default: this engine's;
// the page passes its own copy so the panel and its P(top) come from one build).
// Returns null when the tree has no common cause group variable.
function ccfCatalog(rootNode, opts) {
    opts = opts || {};
    var exactFn = (typeof opts.computeExact === 'function') ? opts.computeExact : computeExactProbability;
    var root = rootNode || _leavesRoot(opts.sets);
    if (!root || !_treeHasCCF(root)) return null;
    var ex;
    try { ex = exactFn(root); }
    catch (e) {
        if (!opts.sets) throw e;
        ex = exactFn(_leavesRoot(opts.sets));      // BDD budget refused on the full tree: the leaves alone define the group variables
    }
    var varMeta = ex.varMeta || [], varOrder = ex.varOrder || [], probMap = ex.probMap || new Map();
    // Group members present in this tree, by group name (today's tier variables fail every member).
    var membersByGroup = new Map(), nodeByLid = new Map();
    varMeta.forEach(function (meta, v) {
        if (!meta || meta.type !== 'indep') return;
        var n = meta.node || varOrder[v], lid = String(_lidOf(n));
        nodeByLid.set(lid, { node: n, v: v });
        if (n && n.ccfGroup) {
            if (!membersByGroup.has(n.ccfGroup)) membersByGroup.set(n.ccfGroup, []);
            membersByGroup.get(n.ccfGroup).push(lid);
        }
    });
    var groupVarCount = new Map();
    varMeta.forEach(function (meta) { if (meta && meta.type === 'group') groupVarCount.set(meta.group, (groupVarCount.get(meta.group) || 0) + 1); });
    var events = [], coverByLid = new Map();
    var SUB = { 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
    varMeta.forEach(function (meta, v) {
        if (!meta || meta.type !== 'group') return;
        var g = meta.group;
        // Which members this event fails: the variable's own member list (per-subset models),
        // otherwise every member of the group in this tree (tier models).
        // MGL (fix 3): meta.ccf is the group plan and meta.ccfIdx the members this event fails.
        var mem = Array.isArray(meta.members) && meta.members.length ? meta.members
            : ((meta.ccf && Array.isArray(meta.ccfIdx) && Array.isArray(meta.ccf.lids)) ? meta.ccfIdx.map(function (i) { return meta.ccf.lids[i]; }) : null);
        var covers = mem
            ? mem.map(function (m) { return String((m && typeof m === 'object') ? _lidOf(m) : m); })
            : (membersByGroup.get(g) || []).slice();
        covers = covers.filter(function (lid) { return nodeByLid.has(lid); });
        if (!covers.length) return;
        var p = probMap.get(v) || 0;
        // The event's rate, consistent with its probability: the variable's own rate when the
        // model gives one, else the reference member's rate scaled by the same fraction as the
        // probability (p_event / q_ref), which is how the BDD derives p_event from q_ref.
        var lam = 0;
        var mlam = (typeof meta.lambda === 'number' && isFinite(meta.lambda)) ? meta.lambda : ((typeof meta.rate === 'number' && isFinite(meta.rate)) ? meta.rate : null);
        if (mlam != null) lam = mlam;
        else if (meta.ccf && Array.isArray(meta.ccfIdx) && typeof _mglEventRate === 'function') {
            // MGL share of the largest member rate (fix 3's _mglEventRate), scaled like the probability
            // when the BDD's value carries more than the plain MGL share (fix C: shared-interval average).
            lam = _mglEventRate(meta.ccf, meta.ccfIdx);
        } else {
            var ref = meta.refNode || varOrder[v], qr = _ccfQ(ref), lr = _ccfLam(ref);
            lam = (qr > 0) ? lr * (p / qr) : 0;
        }
        var memberLabels = covers.map(function (lid) { var r = nodeByLid.get(lid).node; return (r && (r.name || r.displayId)) || lid; });
        var memberIds = covers.map(function (lid) { var r = nodeByLid.get(lid).node; return (r && (r.displayId || r.name)) || lid; });
        var k = (typeof meta.k === 'number') ? meta.k : (mem ? covers.length : null);
        var suffix = mem ? covers.slice().sort().join('+') : ('t' + (meta.tier != null ? meta.tier : v));
        var many = (groupVarCount.get(g) || 0) > 1;
        var tag = many ? (k != null ? (SUB[k] || ('_' + k)) : (meta.tier != null ? (SUB[meta.tier] || ('_' + meta.tier)) : '')) : '';
        var displayId = meta.label ? String(meta.label) : ('CCF' + tag + '-[' + g + ']' + (many && mem ? ' ' + memberIds.join('+') : ''));
        var ev = {
            id: 'ccf:' + g + ':' + suffix, logicalId: 'ccf:' + g + ':' + suffix,
            type: 'basic', isCCF: true, sourceGroup: g, ccfTier: meta.tier != null ? meta.tier : null, ccfK: k,
            members: covers.slice(), displayId: displayId,
            name: 'Common cause failure of ' + memberLabels.join(', ') + ' together (CCF group ' + g + ')',
            probability: p, lambda: lam, varIdx: v
        };
        // The model's own visible event (fix 3: "CCF-G[A+B]" / "CCF G: A+B" with its ccf metadata)
        // is the one shown; this catalog adds the numbers the BDD actually used.
        if (meta.ccf && Array.isArray(meta.ccfIdx) && typeof _mglEventTau === 'function') { try { ev._ccfTau = _mglEventTau(meta.ccf, meta.ccfIdx) || 0; } catch (_) { ev._ccfTau = 0; } }
        if (meta.event && typeof meta.event === 'object') {
            var me = meta.event;
            ev = Object.assign({}, me, { type: 'basic', isCCF: true, sourceGroup: me.sourceGroup || g, ccfTier: me.ccfTier != null ? me.ccfTier : ev.ccfTier,
                ccfK: (me.ccf && me.ccf.k) || ev.ccfK, members: covers.slice(), probability: p, lambda: lam, varIdx: v, children: [], _ccfTau: ev._ccfTau || 0 });
        }
        events.push(ev);
        covers.forEach(function (lid) { if (!coverByLid.has(lid)) coverByLid.set(lid, []); coverByLid.get(lid).push(ev); });
    });
    if (!events.length) return null;
    // The independent part of every covered member, as the BDD quantifies it.
    var indepByLid = new Map();
    coverByLid.forEach(function (evs, lid) {
        var rec = nodeByLid.get(lid), n = rec.node, q = _ccfQ(n), pi = probMap.get(rec.v);
        if (typeof pi !== 'number') pi = q;
        indepByLid.set(lid, { probability: pi, lambda: (q > 0) ? _ccfLam(n) * (pi / q) : _ccfLam(n) });
    });
    return { events: events, coverByLid: coverByLid, indepByLid: indepByLid };
}
// Minimal cut sets with every common cause event explicit. `sets`: cut sets of real nodes (the
// classic enumerator's, minimal or not). Returns the same sets untouched when the tree has no
// common cause group variable. Throws CutsetExplosionError past the cut-set budget (never truncates).
function explicitCCFCutsets(sets, rootNode, opts) {
    opts = opts || {};
    var cat = ccfCatalog(rootNode, { computeExact: opts.computeExact, sets: sets });
    if (!cat) return (sets || []).slice();
    var indCopies = new Map();
    function indCopy(e) {
        var lid = String(_lidOf(e));
        if (indCopies.has(lid)) return indCopies.get(lid);
        var c = _cloneNodeShallow(e), ip = cat.indepByLid.get(lid);
        c.displayId = (e.displayId || lid) + ' (Ind)';
        c.name = (e.name || e.displayId || lid) + ' (independent part)';
        c.probability = ip.probability; c.lambda = ip.lambda;
        c.isCCFIndependent = true; c.sourceGroup = e.ccfGroup; c.sourceNode = e;
        indCopies.set(lid, c);
        return c;
    }
    var out = [];
    (sets || []).forEach(function (cs) {
        if (!cs || !cs.length) return;
        var partial = [[]];
        for (var i = 0; i < cs.length; i++) {
            var e = cs[i], lid = String(_lidOf(e)), evs = cat.coverByLid.get(lid);
            var options = evs ? [indCopy(e)].concat(evs) : [e];
            var next = [];
            for (var a = 0; a < partial.length; a++) for (var b = 0; b < options.length; b++) {
                var o = options[b], key = String(_lidOf(o)), base = partial[a], dup = false;
                for (var d = 0; d < base.length; d++) if (String(_lidOf(base[d])) === key) { dup = true; break; }
                next.push(dup ? base : base.concat([o]));
            }
            if (next.length + out.length > _CUTSET_BUDGET) throw new CutsetExplosionError(next.length + out.length);
            partial = next;
        }
        partial.forEach(function (p) {
            if (cs.dynamicOrigin) { p.dynamicOrigin = cs.dynamicOrigin; p.dynamicOrder = cs.dynamicOrder; }
            out.push(p);
        });
    });
    var min = minimalCutsets(out);
    min.ccfEvents = cat.events;
    return min;
}

// Vesely–Goldberg sums over MINIMAL cut sets — the comment above has always said
// so, and the code did not do it. Before this, OR(AND(a,b), AND(a,b,c)) with a
// rate on `a` returned w_TE inflated by the superset's whole term (a measured
// 1.5x on λ=2e-4, Pb=0.1, Pc=0.5: 3.0e-5 reported against 2.0e-5 correct).
// 13 Oct 2026 (fix 6): the sum runs over the cut sets with common cause events explicit
// (explicitCCFCutsets), so a common cause event contributes its own rate and the
// independent parts of group members carry the reduced probability and rate the BDD uses.
// `ccfEvents` in the result counts the common cause events included (0: none in the tree).
// The inspection interval an element of an explicit cut set shares with its periodic latent
// peers (0: none): a common cause event's from its plan, an independent part's from its member.
function _vgTau(e) {
    try {
        if (!e) return 0;
        if (e.isCCF) return e._ccfTau || 0;
        return _periodicTau(e.isCCFIndependent && e.sourceNode ? e.sourceNode : e) || 0;
    } catch (_) { return 0; }
}
// 13 Oct 2026 (fix 6 x F4): for a PAND or cold SPARE the BDD solves exactly (fix C), the order
// matters for the frequency too: the sequence completes only when its LAST input fails, after
// the earlier ones failed in order. Returns, per such gate, each leaf's input position, or null
// when the tree has none (then every cut set is summed as before).
function _dynPositions(rootNode) {
    var has = false;
    (function scan(n, seen) { if (!n || has || seen.has(n)) return; seen.add(n); if (n.type === 'gate' && (n.gateType === 'PAND' || n.gateType === 'SPARE' || n.gateType === 'SEQ')) { has = true; return; } (n.children || n._children || []).forEach(function (c) { scan(c, seen); }); })(rootNode, new Set());
    if (!has) return null;
    var exact = new Set();
    try {
        (buildBDDFromFT(rootNode).dyn || []).forEach(function (d) {
            if (!d || d.mode !== 'exact') return;
            if (d.gateType === 'PAND' || d.gateType === 'SEQ' || (d.gateType === 'SPARE' && !(d.warmK > 0))) exact.add(String(d.gateId));
        });
    } catch (_) { return null; }
    if (!exact.size) return null;
    var out = [];
    (function walk(n, seenPages) {
        if (!n) return;
        if (n.type === 'gate' && (n.gateType === 'TRANSFER' || n.transferOutTo)) {
            var linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !seenPages.has(linkedId) && typeof ftaPages !== 'undefined' && ftaPages) {
                var lp = ftaPages.find(function (p) { return p && p.id === linkedId; });
                if (lp && lp.root) { var s2 = new Set(seenPages); s2.add(linkedId); walk(lp.root, s2); }
            }
            return;
        }
        var kids = n.children || n._children || [];
        if (n.type === 'gate' && exact.has(String(n.id))) {
            var pos = {};
            kids.forEach(function (c, i) {
                (function leaves(m, sp) {
                    if (!m) return;
                    if (m.type !== 'gate') { var k = String(_lidOf(m)); if (!(k in pos)) pos[k] = i; return; }
                    if (m.gateType === 'TRANSFER' || m.transferOutTo) { var lid2 = m.transferOutTo || m.linkedPageId; if (lid2 && !sp.has(lid2) && typeof ftaPages !== 'undefined' && ftaPages) { var lp2 = ftaPages.find(function (p) { return p && p.id === lid2; }); if (lp2 && lp2.root) { var s3 = new Set(sp); s3.add(lid2); leaves(lp2.root, s3); } } return; }
                    (m.children || m._children || []).forEach(function (x) { leaves(x, sp); });
                })(c, seenPages);
            });
            out.push(pos);
        }
        kids.forEach(function (c) { walk(c, seenPages); });
    })(rootNode, new Set());
    return out.length ? out : null;
}
function _fact(n) { var f = 1; for (var i = 2; i <= n; i++) f *= i; return f; }
function computeFailureFrequency(rootNode, opts) {
    var cutsets;
    try { cutsets = explicitCCFCutsets(minimalCutsets(getCutsets(rootNode)), rootNode, opts); } catch (e) { return { wTE: null, error: String((e && e.message) || e) }; }
    var ccfEvents = (cutsets.ccfEvents || []).length;
    var dynPos = null;
    try { dynPos = _dynPositions(rootNode); } catch (_) { dynPos = null; }
    var posKey = function (e) { return String(_lidOf(e && e.isCCFIndependent && e.sourceNode ? e.sourceNode : e)); };
    var wTE = 0;
    for (var k = 0; k < cutsets.length; k++) {
        var cs = cutsets[k], wCUT = 0;
        var taus = cs.map(_vgTau);
        // An ordered (PAND / cold SPARE) cut set: each member's input position at that gate.
        var pos = null, maxPos = -1;
        if (dynPos && cs.dynamicOrigin) {
            var best = 0;
            dynPos.forEach(function (P) { var n = 0; cs.forEach(function (e) { if (posKey(e) in P) n++; }); if (n > best) { best = n; pos = P; } });
            if (pos) cs.forEach(function (e) { var q = pos[posKey(e)]; if (q != null && q > maxPos) maxPos = q; });
            if (best < 2) pos = null;
        }
        for (var j = 0; j < cs.length; j++) {
            var lamj = (typeof cs[j].lambda === 'number' && isFinite(cs[j].lambda)) ? cs[j].lambda : 0;
            if (lamj <= 0) continue;            // enabler (no rate) — contributes only as a probability factor
            var pj = pos ? pos[posKey(cs[j])] : null;
            if (pos && pj != null && pj < maxPos) continue;   // an earlier input failing does not complete the sequence
            var prod = lamj, byTau = null;
            if (pos) {
                // The earlier inputs must already have failed IN ORDER: with each linear in time
                // (rare events), m earlier positions in order carry 1/m! of the product.
                var earlier = {};
                cs.forEach(function (e, i) { if (i === j) return; var q = pos[posKey(e)]; if (q != null && q < maxPos) earlier[q] = 1; });
                prod /= _fact(Object.keys(earlier).length);
            }
            for (var i = 0; i < cs.length; i++) {
                if (i === j) continue;
                var pi = (typeof cs[i].probability === 'number' && isFinite(cs[i].probability)) ? cs[i].probability : 0;
                prod *= pi;
                if (taus[i]) { byTau = byTau || {}; byTau[taus[i]] = (byTau[taus[i]] || 0) + 1; }
            }
            // 13 Oct 2026 (fix 6 x F5): periodic latent events that share an inspection interval are
            // at their time-averaged probability; their JOINT average is not the product of the
            // averages. With each one linear over the cycle (the BDD's own model, p_avg x 2x), n of
            // them together average p1...pn x 2^n/(n+1): 1 for one, 4/3 for two, 2 for three.
            if (byTau) for (var tk in byTau) { var c = byTau[tk]; if (c >= 2) prod *= Math.pow(2, c) / (c + 1); }
            wCUT += prod;
        }
        wTE += wCUT;
    }
    return { wTE: wTE, cutsetCount: cutsets.length, ccfEvents: ccfEvents, includesCCF: ccfEvents > 0 };
}


// ---- 23 Sep 2026 (perf round 3) — per-tree FACTS, one implementation for both threads.
// bddCutsets / _minimizeBDDCutsets / bddMinimalCutsets are copied VERBATIM from
// fta_quant_modules.js (which keeps its own copies bound to the page's BDD
// instance); regression_engine_parity holds the two copies equal, comments aside.
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
function bddMinimalCutsets(rootNode) {
    if (_treeHasNot(rootNode)) return _primeImplicantCutsets(rootNode);   // 13 Oct 2026 (fix G): non-coherent tree -> prime implicants
    const { bdd, varOrder, varMeta } = buildBDDFromFT(rootNode);
    if (!bdd || bdd === BDD.T0) return [];
    const raw = bddCutsets(bdd).map(cs => cs.filter(i => !(varMeta[i] && varMeta[i].synthetic === 'order')));
    const minimal = _minimizeBDDCutsets(raw);
    return minimal.map(cs => cs.sort((a, b) => a - b).map(idx => varOrder[idx]));
}

// Minimum number of failures to reach the top event: shortest root→T1 path
// counting only high (var=true) edges. fixedTrue: varIdx already failed at zero
// cost (MC-03). Moved here from model_checks.js so the page and the worker
// derive single-failure facts from ONE implementation.
function _minOrder(bdd, fixedTrue) {
    const memo = new Map();
    function go(n) {
        if (n.isTerminal) return n.value ? 0 : Infinity;
        const c = memo.get(n.id);
        if (c !== undefined) return c;
        let r;
        if (fixedTrue && fixedTrue.has(n.varIdx)) r = go(n.high);
        else r = Math.min(go(n.low), 1 + go(n.high));
        memo.set(n.id, r);
        return r;
    }
    return go(bdd);
}
// Does the assignment {v=true, everything else false} satisfy the BDD?
function _singleVarReaches(bdd, v) {
    let n = bdd;
    while (!n.isTerminal) n = (n.varIdx === v) ? n.high : n.low;
    return n.value === true;
}
// The INDEPENDENT single events that alone reach the top of a built BDD
// ({ bdd, varOrder, varMeta } from buildBDDFromFT). Modeled common cause events
// (13 Oct 2026: one variable per specific MGL subset) are single common causes BY
// CONSTRUCTION (the engineer declared the group and signed the parameters; the
// contribution is carried in P(top) and caught at the AND gate's independence
// requirement), so common cause event variables are excluded, as are dynamic-gate
// synthetic variables. L0 MF&MS placeholders (macsys:*) are functional abstractions,
// never flagged (INV-12 tracks model maturity instead).
function singleFailureEvents(built) {
    const out = [];
    if (!built || !built.bdd || built.bdd.isTerminal) return out;
    const { bdd, varOrder, varMeta } = built;
    if (_minOrder(bdd) > 1) return out;
    for (let v = 0; v < varOrder.length; v++) {
        if (!_singleVarReaches(bdd, v)) continue;
        const meta = varMeta[v] || {};
        if (meta.type === 'group' || meta.synthetic) continue;
        const node = meta.node || varOrder[v];
        const lid = node.logicalId != null ? node.logicalId : node.id;
        if (String(lid).indexOf('macsys:') === 0) continue;
        out.push({ lid: lid, displayId: node.displayId, name: node.name, probability: node.probability });
    }
    return out;
}
// MC-03 (MMEL dispatch) facts for a built BDD: every event variable's lid, and
// the lids whose failure ALONE (fixed true, zero further failures) reaches the
// top — computed with exactly the test MC-03 applies (_minOrder with that
// variable fixed === 0). terminal: the tree has no decision structure (skipped).
function mmelFacts(built) {
    if (!built || !built.bdd || built.bdd.isTerminal) return { terminal: true, lids: [], alone: [] };
    const lids = [], alone = [];
    built.lidToVar.forEach(function (v, lid) {
        lids.push(lid);
        if (_minOrder(built.bdd, new Set([v])) === 0) alone.push(lid);
    });
    return { terminal: false, lids: lids, alone: alone };
}
// A cut-set member as the independence ledger reads it (never a live node).
function cutsetSnapshot(n) {
    const s = { id: n.id, logicalId: n.logicalId, displayId: n.displayId, name: n.name,
             ccfGroup: n.ccfGroup, beta: n.beta, eventClass: n.eventClass };
    if (n.isCCF) { s.isCCF = true; s.sourceGroup = n.sourceGroup; s.ccfTier = n.ccfTier; s.ccf = n.ccf ? JSON.parse(JSON.stringify(n.ccf)) : null; }
    return s;
}
// WORKER: every per-tree fact the page caches, for one tree. `pages` are the
// pages its transfers reach (the engine follows transfers through ftaPages,
// exactly as the page does). Each fact is independent: a budget refusal on
// one (e.g. cut-set enumeration) is reported and never poisons the others.
function treeFactsForWorker(rootNode, pages) {
    const out = {};
    const prev = root.ftaPages;
    root.ftaPages = pages || [];
    try {
        try { out.ptop = computeExactProbability(rootNode).prob; } catch (e) { out.ptopError = (e && e.name) || 'Error'; }
        try {
            const built = buildBDDFromFT(rootNode);
            out.singles = singleFailureEvents(built);
            out.mmel = mmelFacts(built);
        } catch (e) { out.singlesError = (e && e.name) || 'Error'; }
        try { out.mcs = (bddMinimalCutsets(rootNode) || []).map(cs => cs.map(cutsetSnapshot)); } catch (e) { out.mcsError = (e && e.name) || 'Error'; }
    } finally { root.ftaPages = prev; }
    return out;
}

// 13 Oct 2026 (fix 3): what the common cause model of one tree needs the analyst to know:
// every group issue from _mglPlanGroup (members disagree on parameters or Q_t, recorded size
// below the members present, group too large) and the beta-only voting warning: a group with 3
// or more members under one VOTING gate with only beta entered models every common cause failure
// as failing the whole group, so a common cause failure of only some of them (2 of 3) is not
// modeled until gamma is entered. Pure over the tree (transfers followed through ftaPages).
// F1 (14 Oct 2026): node ids repeated inside ONE page (transfers not followed). Ids may repeat across pages (the engine
// keys every visit by the node itself), but inside a page a repeated id is a data error that makes id lookups ambiguous.
function duplicateNodeIds(rootNode) {
    const byId = new Map(), dups = [];
    (function walk(n) { if (!n) return; const k = String(n.id); if (byId.has(k)) { if (byId.get(k) !== n && dups.indexOf(k) < 0) dups.push(k); return; } byId.set(k, n);
        if (n.type === 'gate' && !(n.gateType === 'TRANSFER' || n.transferOutTo)) (n.children || n._children || []).forEach(walk); })(rootNode);
    return dups.sort();
}
function ccfModelNotes(rootNode) {
    const notes = [];
    if (!rootNode) return notes;
    const pages = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages : [];
    function leavesUnder(node, out, seenNodes, seenPages) {
        if (!node || seenNodes.has(node)) return out;
        seenNodes.add(node);
        if (node.type !== 'gate') { const lid = _mglLid(node); if (!out.has(String(lid))) out.set(String(lid), node); return out; }
        if (node.gateType === 'TRANSFER' || node.transferOutTo) {
            const linkedId = node.transferOutTo || node.linkedPageId;
            if (linkedId && !seenPages.has(linkedId)) {
                seenPages.add(linkedId);
                const page = pages.find(p => p.id === linkedId);
                if (page && page.root) leavesUnder(page.root, out, seenNodes, seenPages);
            }
            return out;
        }
        (node.children || node._children || []).forEach(c => leavesUnder(c, out, seenNodes, seenPages));
        return out;
    }
    const all = leavesUnder(rootNode, new Map(), new Set(), new Set());
    const byGroup = new Map();
    all.forEach(n => { if (n.ccfGroup) { if (!byGroup.has(n.ccfGroup)) byGroup.set(n.ccfGroup, []); byGroup.get(n.ccfGroup).push(n); } });
    const plans = new Map();
    byGroup.forEach((mem, g) => {
        try { const plan = _mglPlanGroup(g, mem); if (plan) { plans.set(g, plan); plan.issues.forEach(i => notes.push(Object.assign({ severity: i.code === 'qt-differ' ? 'info' : 'warning' }, i))); } }
        catch (e) { notes.push({ code: 'group-too-large', severity: 'error', group: g, message: String((e && e.message) || e) }); }
    });
    const flagged = new Set();
    (function walk(node, seenNodes, seenPages) {
        if (!node || seenNodes.has(node)) return;
        seenNodes.add(node);
        if (node.type !== 'gate') return;
        if (node.gateType === 'TRANSFER' || node.transferOutTo) {
            const linkedId = node.transferOutTo || node.linkedPageId;
            if (linkedId && !seenPages.has(linkedId)) {
                seenPages.add(linkedId);
                const page = pages.find(p => p.id === linkedId);
                if (page && page.root) walk(page.root, seenNodes, seenPages);
            }
            return;
        }
        if (node.gateType === 'VOTING') {
            const under = leavesUnder(node, new Map(), new Set(), new Set());
            const count = new Map();
            under.forEach(n => { if (n.ccfGroup && plans.has(n.ccfGroup)) count.set(n.ccfGroup, (count.get(n.ccfGroup) || 0) + 1); });
            count.forEach((c, g) => {
                const plan = plans.get(g);
                const key = g + '@' + node.id;
                if (c >= 3 && !plan.gammaGiven && !flagged.has(key)) {
                    flagged.add(key);
                    const k = Math.max(1, Math.min(node.votingK || 2, (node.children || []).length || 2));
                    notes.push({ code: 'voting-beta-only', severity: 'warning', group: g, gateId: node.id, gateDisplayId: node.displayId || null, members: c, votingK: k,
                        message: 'Common cause group "' + g + '" has ' + c + ' members under the voting gate ' + (node.displayId || node.name || '') + ' but only beta is entered. With beta alone every common cause failure fails the whole group, so a common cause failure of only some members (for example 2 of 3) is not modeled. Enter gamma to model it.' });
                }
            });
        }
        (node.children || node._children || []).forEach(c => walk(c, seenNodes, seenPages));
    })(rootNode, new Set(), new Set());
    return notes;
}

var SLFTAEngine = {
    CUTSET_BUDGET: _CUTSET_BUDGET,
    CutsetExplosionError: CutsetExplosionError,
    getCombinations: getCombinations,
    multiplyCutsets: multiplyCutsets,
    getCutsets: getCutsets,
    minimalCutsets: minimalCutsets,
    eventKey: _eventKey,
    flattenTransfers: flattenTransfers,
    enumerateForWorker: enumerateForWorker,
    BDD: BDD,
    buildBDDFromFT: buildBDDFromFT,
    computeExactProbability: computeExactProbability,
    computeImportanceMeasures: computeImportanceMeasures,
    computeImportanceForWorker: computeImportanceForWorker,
    computeFailureFrequency: computeFailureFrequency,
    ccfCatalog: ccfCatalog,
    explicitCCFCutsets: explicitCCFCutsets,
    bddMinimalCutsets: bddMinimalCutsets,
    seqExactProb: _seqExactProb,
    treeHasNot: _treeHasNot,
    primeImplicantCutsets: _primeImplicantCutsets,
    PRIME_BUDGET: _PRIME_BUDGET,
    minOrder: _minOrder,
    singleVarReaches: _singleVarReaches,
    singleFailureEvents: singleFailureEvents,
    mmelFacts: mmelFacts,
    cutsetSnapshot: cutsetSnapshot,
    treeFactsForWorker: treeFactsForWorker,
    ccfModelNotes: ccfModelNotes,
    duplicateNodeIds: duplicateNodeIds,
    mgl: { planGroup: _mglPlanGroup, eventProb: _mglEventProb, eventRate: _mglEventRate, eventNode: _mglEventNode, memberParams: _mglMemberParams, eventTau: _mglEventTau, MAX_EVENTS: _MGL_MAX_EVENTS }
};

// Expose the namespace + the historical globals (so safety_lab.js's existing calls and the
// Worker both resolve them). Function declarations above are already global in classic-script
// and Worker scopes; we also publish the namespace and the budget for explicit access.
try { root.SLFTAEngine = SLFTAEngine; } catch (_) {}
try { root._CUTSET_BUDGET = _CUTSET_BUDGET; } catch (_) {}
try { root.getCutsets = getCutsets; root.multiplyCutsets = multiplyCutsets; root.getCombinations = getCombinations; root._eventKey = _eventKey; root.CutsetExplosionError = CutsetExplosionError; } catch (_) {}

})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));

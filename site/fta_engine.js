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

function getCutsets(node, visited = new Set()) {
    if (!node) return []; if (visited.has(node.id)) return []; visited.add(node.id);
    if (node.type !== 'gate') return [[node]];
    if (node.gateType === 'TRANSFER' || node.transferOutTo) {
        const linkedId = node.transferOutTo || node.linkedPageId;
        // Resolve transfers via the page table when available (main thread). In a Worker the tree
        // is pre-flattened (no transfers remain), so this lookup is guarded and simply not needed.
        if (linkedId && typeof ftaPages !== 'undefined' && ftaPages) { const linkedPage = ftaPages.find(p => p.id === linkedId); if (linkedPage && linkedPage.root) return getCutsets(linkedPage.root, visited); }
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
    if (node.gateType === 'OR' || node.gateType === 'XOR') { let r = []; for (let c of actualChildren) { const sub = getCutsets(c, new Set(visited)); for (let si = 0; si < sub.length; si++) r.push(sub[si]); if (r.length > _CUTSET_BUDGET) throw new CutsetExplosionError(r.length); } return r; }
    else if (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE') {
        let r = getCutsets(actualChildren[0], new Set(visited));
        for (let i = 1; i < actualChildren.length; i++) r = multiplyCutsets(r, getCutsets(actualChildren[i], new Set(visited)));
        // Tag dynamic-gate cutsets so the report can flag the required ordering.
        if (node.gateType === 'PAND' || node.gateType === 'SPARE') {
            const orderTags = actualChildren.map(c => c.displayId || '?');
            r.forEach(cs => { cs.dynamicOrigin = node.gateType; cs.dynamicOrder = orderTags.join(node.gateType === 'PAND' ? ' → ' : ' ⇉ '); });
        }
        return r;
    }
    else if (node.gateType === 'FDEP') { return []; }
    else if (node.gateType === 'VOTING') { let c = actualChildren.map(ch => getCutsets(ch, new Set(visited))); let k = Math.min(node.votingK || 2, actualChildren.length); let combs = getCombinations(c, k); let r = []; for (let comb of combs) { let mult = comb[0]; for(let i=1; i<k; i++) mult = multiplyCutsets(mult, comb[i]); for (let mi = 0; mi < mult.length; mi++) r.push(mult[mi]); if (r.length > _CUTSET_BUDGET) throw new CutsetExplosionError(r.length); } return r; }  /* Phase 44 — default K=2 for safety. #7b — loop-append (see OR branch). */
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
        const enc = { ids: cs.map(function (e) { return e.id; }) };
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
function _bddCombinations(items, r) {
    const out = [];
    (function pick(start, current) {
        if (current.length === r) { out.push([...current]); return; }
        for (let i = start; i < items.length; i++) { current.push(items[i]); pick(i + 1, current); current.pop(); }
    })(0, []);
    return out;
}
function buildBDDFromFT(rootNode) {
    BDD.reset();
    if (!rootNode) return { bdd: BDD.T0, varOrder: [], lidToVar: new Map(), varMeta: [], ccfGroupToVar: new Map() };
    const varOrder = [];
    const varMeta  = [];
    const lidToVar = new Map();
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
    const pageCache = new Map();
    function build(node, visitedPages) {
        if (!node) return BDD.T0;
        if (node.type !== 'gate') {
            const lid = node.logicalId != null ? node.logicalId : node.id;
            const v = lidToVar.get(lid);
            if (v == null) return BDD.T0;
            let result = BDD.variable(v);
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
            return kidBdds.reduce((acc, k) => BDD.apply('and', acc, k), BDD.T1);
        }
        if (node.gateType === 'FDEP') return BDD.T0;
        if (node.gateType === 'OR') {
            return kidBdds.reduce((acc, k) => BDD.apply('or', acc, k), BDD.T0);
        }
        if (node.gateType === 'XOR') {
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
function _probMapFor(varOrder, varMeta) {
    const map = new Map();
    // Backlog #4 — qualitative development errors (ARP 4761A 4.1.1.1) enter the
    // BDD at p = 0, whatever λ/P a stale field might carry: the quantified
    // P(top) is explicitly P(top | no development error). The variables still
    // exist in the BDD so cut-set structure (and the qualitative-FFS partition)
    // is untouched.
    const _q = n => (n && n.eventClass === 'dev-error') ? 0 : (n && n.probability) || 0;
    if (!varMeta || !varMeta.length) {
        varOrder.forEach((node, varIdx) => map.set(varIdx, _q(node)));
        return map;
    }
    varMeta.forEach((meta, varIdx) => {
        if (meta.type === 'indep') {
            const n = meta.node;
            const q = _q(n);
            const b = (n.ccfGroup && n.beta > 0) ? n.beta : 0;
            map.set(varIdx, q * (1 - b));
        } else if (meta.type === 'group') {
            const r = meta.refNode;
            const q = _q(r);
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
function computeImportanceMeasures(rootNode) {
    const ex = computeExactProbability(rootNode);
    const { bdd, varOrder, varMeta, probMap, prob: pTop } = ex;
    const measures = [];
    varOrder.forEach((refNode, varIdx) => {
        const meta = varMeta[varIdx];
        if (meta && meta.type === 'group') return;
        const m1 = new Map(probMap); m1.set(varIdx, 1);
        const m0 = new Map(probMap); m0.set(varIdx, 0);
        const pX1 = BDD.probability(bdd, m1);
        const pX0 = BDD.probability(bdd, m0);
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

// Vesely–Goldberg sums over MINIMAL cut sets — the comment above has always said
// so, and the code did not do it. Before this, OR(AND(a,b), AND(a,b,c)) with a
// rate on `a` returned w_TE inflated by the superset's whole term (a measured
// 1.5x on λ=2e-4, Pb=0.1, Pc=0.5: 3.0e-5 reported against 2.0e-5 correct).
function computeFailureFrequency(rootNode) {
    var cutsets;
    try { cutsets = minimalCutsets(getCutsets(rootNode)); } catch (e) { return { wTE: null, error: String((e && e.message) || e) }; }
    var wTE = 0;
    for (var k = 0; k < cutsets.length; k++) {
        var cs = cutsets[k], wCUT = 0;
        for (var j = 0; j < cs.length; j++) {
            var lamj = (typeof cs[j].lambda === 'number' && isFinite(cs[j].lambda)) ? cs[j].lambda : 0;
            if (lamj <= 0) continue;            // enabler (no rate) — contributes only as a probability factor
            var prod = lamj;
            for (var i = 0; i < cs.length; i++) {
                if (i === j) continue;
                var pi = (typeof cs[i].probability === 'number' && isFinite(cs[i].probability)) ? cs[i].probability : 0;
                prod *= pi;
            }
            wCUT += prod;
        }
        wTE += wCUT;
    }
    return { wTE: wTE, cutsetCount: cutsets.length };
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
    const { bdd, varOrder } = buildBDDFromFT(rootNode);
    if (!bdd || bdd === BDD.T0) return [];
    const raw = bddCutsets(bdd);
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
// ({ bdd, varOrder, varMeta } from buildBDDFromFT). β-modeled CCF tiers are
// single common causes BY CONSTRUCTION (the engineer declared the group and
// signed the β; the contribution is carried in P(top)), so group-tier variables
// are excluded. L0 MF&MS placeholders (macsys:*) are functional abstractions,
// never flagged (INV-12 tracks model maturity instead).
function singleFailureEvents(built) {
    const out = [];
    if (!built || !built.bdd || built.bdd.isTerminal) return out;
    const { bdd, varOrder, varMeta } = built;
    if (_minOrder(bdd) > 1) return out;
    for (let v = 0; v < varOrder.length; v++) {
        if (!_singleVarReaches(bdd, v)) continue;
        const meta = varMeta[v] || {};
        if (meta.type === 'group') continue;
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
    return { id: n.id, logicalId: n.logicalId, displayId: n.displayId, name: n.name,
             ccfGroup: n.ccfGroup, beta: n.beta, eventClass: n.eventClass };
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
    bddMinimalCutsets: bddMinimalCutsets,
    minOrder: _minOrder,
    singleVarReaches: _singleVarReaches,
    singleFailureEvents: singleFailureEvents,
    mmelFacts: mmelFacts,
    cutsetSnapshot: cutsetSnapshot,
    treeFactsForWorker: treeFactsForWorker
};

// Expose the namespace + the historical globals (so safety_lab.js's existing calls and the
// Worker both resolve them). Function declarations above are already global in classic-script
// and Worker scopes; we also publish the namespace and the budget for explicit access.
try { root.SLFTAEngine = SLFTAEngine; } catch (_) {}
try { root._CUTSET_BUDGET = _CUTSET_BUDGET; } catch (_) {}
try { root.getCutsets = getCutsets; root.multiplyCutsets = multiplyCutsets; root.getCombinations = getCombinations; root._eventKey = _eventKey; root.CutsetExplosionError = CutsetExplosionError; } catch (_) {}

})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));

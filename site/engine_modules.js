// engine_modules.js — BDD / SLDB, extracted verbatim from safety_lab.js (Phase 76).
// Classic script, shared lexical scope, loaded AFTER safety_lab.js (no top-level refs to
// them in the monolith; loading after also covers any definition-time deps). Byte-identical.

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
    // THIS CONSTANT MUST EQUAL THE ONE IN fta_engine.js. Read that file for the
    // full rationale and the measurement tables -- it is not duplicated here,
    // because two copies of an argument drift and one of them goes quietly
    // wrong. `regression_bdd_budget` asserts the two numbers are EQUAL and will
    // fail the wall if they ever separate again.
    //
    // WHY THAT TEST EXISTS, recorded because it cost a session to find. These
    // two kernels are byte-identical apart from this line, and the comment
    // above claims "one discipline, both threads" -- but the budgets had
    // SEPARATED. fta_engine.js was raised 1,000,000 -> 4,000,000 on 7 Aug and
    // this copy was not, so the raise was INERT for the page: the app's own
    // exact-P(top) path (fta_quant_modules.js's buildBDDFromFT, which closes
    // over THIS global BDD, and which deliberately overrides the engine's
    // page-side globals per the load-order note in index.html) went on refusing
    // at 1,000,000. Proven by execution, not by reading: loading fta_engine.js,
    // fta_quant_modules.js and engine_modules.js in index.html order and calling
    // the bare global computeExactProbability on a 100,000-event tree raised
    // BDDExplosionError @1,000,000 in 5.2 s, while SLFTAEngine's own copy of the
    // same function had the raised budget. The lesson is not "raise it again" --
    // it is that a duplicated kernel needs a pinned equality, which it now has.
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

const SLDB = (function () {
    const DB = 'safetyLabAero', STORE = 'kv', VER = 1;
    let _dbp = null;
    function _open() {
        if (_dbp) return _dbp;
        _dbp = new Promise(function (res, rej) {
            let req;
            try { req = indexedDB.open(DB, VER); } catch (e) { return rej(e); }
            req.onupgradeneeded = function () { try { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); } catch (_) {} };
            req.onsuccess = function () { res(req.result); };
            req.onerror = function () { rej(req.error); };
        });
        return _dbp;
    }
    function available() { try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (_) { return false; } }
    function get(key) { return _open().then(function (db) { return new Promise(function (res, rej) { const t = db.transaction(STORE, 'readonly'); const r = t.objectStore(STORE).get(key); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }); }
    function set(key, val) { return _open().then(function (db) { return new Promise(function (res, rej) { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(val, key); t.oncomplete = function () { res(true); }; t.onerror = function () { rej(t.error); }; }); }); }
    function del(key) { return _open().then(function (db) { return new Promise(function (res, rej) { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(key); t.oncomplete = function () { res(true); }; t.onerror = function () { rej(t.error); }; }); }); }
    return { available: available, get: get, set: set, del: del };
})();

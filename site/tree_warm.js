// ============================================================================
// tree_warm.js — v1.0 — per-tree facts computed OFF the UI thread (23 Sep 2026).
//
// WHY: the project checks (invariants sweep: MC-01/02 single-failure paths,
// MC-03 MMEL dispatch),
// the independence ledger (minimal cut sets) and the budget ledger (exact
// P(top)) need a BDD per fault tree. The page already REMEMBERS each answer
// per tree content (fta_quant_modules.js, model_checks.js), but the FIRST
// time — after a load, or for every tree an edit changed — each is computed
// on the UI thread. On a large project that first pass froze the screen for
// 10-12 s.
//
// WHAT: whenever the project data changes (data_change.js), this module
// finds the trees whose facts are not yet remembered and sends them, in small
// batches, to the fault-tree worker (fta_worker.js, op 'facts'), which runs
// the SAME engine functions (fta_engine.js — the page and worker copies are
// held equal by tests/regression_engine_parity.test.js). Each answer is filed
// under the exact CONTENT KEY computed when the tree was sent, so a tree that
// changed in the meantime simply does not match it: a primed answer can only
// ever be read back for identical content. Nothing here decides anything; it
// only saves the UI thread from computing what it would compute anyway.
//
// The dashboard's background project check waits (up to 30 s) while a warm-up
// is running, showing its last result meanwhile (ux_leading.js).
//
// Kill switch: window.SL_TREE_WARM_OFF = true. No Worker (old shells, test
// sandboxes): does nothing, and everything computes on demand as before.
// See tests/regression_tree_warm.test.js.
// ============================================================================
(function () {
    'use strict';

    var BATCH = 24;                  // trees per worker message
    var SLICE_MS = 8;                // UI-thread budget per scan slice (key computation)
    var TICK_MS = 2000;
    var WATCHDOG_MS = 30000;

    var _worker = null, _broken = false;
    var _seenGen = -1;
    var _scan = null;                // { pages, i } while scanning
    var _queue = [];                 // [{ kP, kM, needP, needM, needS, root, pages }]
    var _inflight = null;            // { id, items, at }
    var _seq = 0;
    var _stats = { batches: 0, trees: 0, primed: 0, errors: 0 };

    function _off() { return typeof window === 'undefined' || window.SL_TREE_WARM_OFF; }
    function _ready() {
        return typeof _ptopKey === 'function' && typeof _MCS_FIELDS !== 'undefined' &&
            typeof window.ptopCachePrime === 'function' && typeof window.mcsCachePrime === 'function' &&
            typeof window.mcSinglesPrime === 'function' && typeof window.mcMmelPrime === 'function' && typeof window.SLDataChange !== 'undefined';
    }
    function _getWorker() {
        if (_worker || _broken) return _worker;
        if (typeof Worker === 'undefined') { _broken = true; return null; }
        try {
            _worker = new Worker('fta_worker.js?v=1.5');
            _worker.addEventListener('message', _onMessage);
            _worker.addEventListener('error', function () { _reset(true); });
        } catch (_) { _worker = null; _broken = true; }
        return _worker;
    }
    function _reset(markBroken) {
        try { if (_worker) _worker.terminate(); } catch (_) {}
        _worker = null; _inflight = null; _queue = []; _scan = null;
        if (markBroken) _broken = true;
    }
    function _pagesList() { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; }

    // The pages a tree's transfers reach — the engine follows them by id.
    function _reachable(root) {
        var pages = _pagesList(), out = [], seen = new Set();
        (function walk(n) {
            if (!n) return;
            if (n.type === 'gate' && (n.gateType === 'TRANSFER' || n.transferOutTo)) {
                var id = n.transferOutTo || n.linkedPageId;
                if (id && !seen.has(String(id))) {
                    seen.add(String(id));
                    var p = pages.find(function (x) { return x && x.id === id; });
                    if (p && p.root) { out.push({ id: p.id, root: p.root }); walk(p.root); }
                }
            }
            var kids = n.children || n._children;
            if (kids) for (var i = 0; i < kids.length; i++) walk(kids[i]);
        })(root);
        return out;
    }

    // One scan slice: compute content keys for a few trees, queue the ones
    // whose facts are not remembered yet. Yields after SLICE_MS.
    function _scanSlice() {
        if (!_scan) return;
        var t0 = Date.now();
        while (_scan.i < _scan.pages.length && Date.now() - t0 < SLICE_MS) {
            var p = _scan.pages[_scan.i++];
            if (!p || !p.root) continue;
            var kP, kM;
            try { kP = _ptopKey(p.root); kM = _ptopKey(p.root, _MCS_FIELDS); } catch (_) { continue; }
            var needP = !window.ptopCacheHas(kP), needM = !window.mcsCacheHas(kM), needS = !window.mcSinglesHas(kM);
            if (needP || needM || needS) _queue.push({ kP: kP, kM: kM, needP: needP, needM: needM, needS: needS, root: p.root, pages: _reachable(p.root) });
        }
        if (_scan.i >= _scan.pages.length) _scan = null;
        else setTimeout(_scanSlice, 0);
        _pump();
    }

    function _pump() {
        if (_inflight) {
            if (Date.now() - _inflight.at > WATCHDOG_MS) { _stats.errors++; _reset(false); }   // a stuck worker: drop it, on-demand still works
            return;
        }
        if (!_queue.length) return;
        var w = _getWorker(); if (!w) { _queue = []; return; }
        var items = _queue.splice(0, BATCH);
        var id = ++_seq;
        _inflight = { id: id, items: items, at: Date.now() };
        try {
            w.postMessage({ id: id, op: 'facts', trees: items.map(function (t) { return { root: t.root, pages: t.pages }; }) });
        } catch (_) { _stats.errors++; _inflight = null; _queue = []; }   // an uncloneable tree: leave it to on-demand
    }

    function _onMessage(ev) {
        var d = ev.data || {};
        if (!_inflight || d.id !== _inflight.id) return;
        var items = _inflight.items; _inflight = null;
        _stats.batches++;
        if (d.ok && Array.isArray(d.facts)) {
            d.facts.forEach(function (f, i) {
                var t = items[i]; if (!t || !f) return;
                _stats.trees++;
                if (t.needP && typeof f.ptop === 'number') { window.ptopCachePrime(t.kP, f.ptop); _stats.primed++; }
                if (t.needM && Array.isArray(f.mcs)) { window.mcsCachePrime(t.kM, f.mcs); _stats.primed++; }
                if (t.needS && Array.isArray(f.singles)) { window.mcSinglesPrime(t.kM, f.singles); _stats.primed++; }
                if (t.needS && f.mmel && typeof window.mcMmelPrime === 'function') { window.mcMmelPrime(t.kM, f.mmel); _stats.primed++; }
            });
        } else _stats.errors++;
        _pump();
    }

    function busy() { return !!(_scan || _inflight || _queue.length); }

    function tick() {
        if (_off() || _broken || !_ready()) return { skipped: true };
        if (busy()) { _pump(); return { busy: true }; }
        var g = window.SLDataChange.gen();
        if (g === _seenGen) return { idle: true };
        _seenGen = g;
        _scan = { pages: _pagesList().slice(), i: 0 };
        _scanSlice();
        return { started: true };
    }

    if (typeof window !== 'undefined') {
        window.SLTreeWarm = { tick: tick, busy: busy, stats: function () { return Object.assign({ queued: _queue.length, inflight: !!_inflight, scanning: !!_scan }, _stats); } };
        var _t = function () { try { tick(); } catch (_) {} };
        if (typeof document !== 'undefined' && (document.readyState === 'complete' || document.readyState === 'interactive')) setTimeout(_t, 1500);
        else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', function () { setTimeout(_t, 1500); });
        setInterval(_t, TICK_MS);
    }
})();

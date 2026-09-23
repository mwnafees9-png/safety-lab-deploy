// ============================================================================
// render_pass.js — v1.0 — one synchronous read-only PASS over the project
// (23 Sep 2026, perf round 4).
//
// WHY: the dashboard and the project check (invRun) each ask the same
// questions many times in one go — "which fault trees are linked to this
// failure condition?", "what is the phase status?" — and every answer scanned
// every page. With 1,600 failure conditions and 1,630 trees that was millions
// of comparisons per render (dashboard ~3 s, project check ~2 s at 100x), and
// the dashboard computed the whole phase status + checklists twice.
//
// WHAT: SLPass.run(name, fn) marks a synchronous, read-only computation. Inside
// it (and only inside it):
//   · SLPass.pages(kind, key) answers from indexes built ONCE per pass —
//     kinds 'link' (a page's linkedFhaIds entries and linkedFhaId), 'system'
//     (systemId), 'verifies' (verifies), 'id' (id), all keyed by String(value).
//     The answer is a SUPERSET-SAFE CANDIDATE LIST in ftaPages order: callers
//     keep their own original predicate and apply it to the candidates, so the
//     index can only narrow the scan, never change the result;
//   · SLPass.memo(key, compute) computes a value once per pass.
// NOT memoized here on purpose: anything derived from a fault tree's content.
// Code inside a pass (the CCMR interval search) changes leaf values transiently
// and asks again; only link/structure lookups and whole-pass results are safe.
// Outside a pass pages() returns null (callers scan as before), memo()
// computes — behavior is exactly as before.
// Everything is dropped when the outermost pass ends, so nothing can be stale
// across user actions. A pass also opens an idpIndexBatch (helpers_modules.js)
// when available, so the interdependence lookups share the same scope.
// The page indexes guard against the page list itself changing mid-pass
// (length or identity) by rebuilding.
// See tests/regression_render_pass.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var _depth = 0, _st = null;

    function _pagesArr() { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; }
    function _fresh() { return { memo: new Map(), idx: null }; }

    function run(name, fn) {
        if (_depth === 0) _st = _fresh();
        _depth++;
        try {
            return (typeof idpIndexBatch === 'function') ? idpIndexBatch(fn) : fn();
        } finally {
            if (--_depth === 0) _st = null;
        }
    }
    function active() { return _depth > 0; }

    function memo(key, compute) {
        if (!_st) return compute();
        if (_st.memo.has(key)) return _st.memo.get(key);
        var v = compute();
        _st.memo.set(key, v);
        return v;
    }
    function _add(map, key, page) {
        if (key == null) return;
        var k = String(key), a = map.get(k);
        if (!a) { a = []; map.set(k, a); }
        if (a[a.length - 1] !== page) a.push(page);   // a page listed once per key, in page order
    }
    function _build(pages) {
        var link = new Map(), system = new Map(), verifies = new Map(), id = new Map();
        for (var i = 0; i < pages.length; i++) {
            var p = pages[i];
            if (!p) continue;
            if (Array.isArray(p.linkedFhaIds)) for (var j = 0; j < p.linkedFhaIds.length; j++) _add(link, p.linkedFhaIds[j], p);
            _add(link, p.linkedFhaId, p);
            _add(system, p.systemId, p);
            _add(verifies, p.verifies, p);
            _add(id, p.id, p);
        }
        return { src: pages, len: pages.length, link: link, system: system, verifies: verifies, id: id };
    }
    // Candidate pages for a lookup, or null outside a pass (caller scans all pages).
    function pages(kind, key) {
        if (!_st) return null;
        var arr = _pagesArr();
        if (!_st.idx || _st.idx.src !== arr || _st.idx.len !== arr.length) _st.idx = _build(arr);
        var m = _st.idx[kind];
        if (!m) return null;
        if (key == null) return null;   // an undefined/null key can match pages with no value: let the caller scan
        return m.get(String(key)) || [];
    }

    var api = { run: run, active: active, memo: memo, pages: pages };
    try { root.SLPass = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* ============================================================================
 * Safety Lab Aero — cut-set enumeration Web Worker (#19)
 * ----------------------------------------------------------------------------
 * Runs the SAME engine as the main thread (fta_engine.js) off the UI thread so
 * large fault trees don't freeze the page. Air-gap / ITAR safe: importScripts is
 * same-origin only, the worker reaches no network and emits nothing off-device.
 *
 * Protocol:
 *   in : { id, op:'facts', trees:[{ root, pages }] }  → { id, ok, facts:[{ ptop, mcs, singles, *Error }] }
 *   in : { id, root }        root = a transfer-FLATTENED tree (self-contained)
 *   out: { id, ok:true,  cutsets:[{ ids:[...], dyn?:{o,ord} }, ...] }
 *        { id, ok:false, name, count, message }   (name='CutsetExplosionError' on budget abort)
 * The main thread reconstructs node objects from the ids, so the result is
 * identical to calling getCutsets() synchronously.
 * ========================================================================== */
importScripts('fta_engine.js?v=1.7');   // #7b — versioned, matching the page's tag: one engine, one version, both threads. FOUND STALE at 1.4 against a page on 1.5 (7 Aug) — pinned by regression_bdd_budget so the pair cannot separate again.
self.onmessage = function (e) {
    var msg = e.data || {};
    try {
        if (msg.op === 'facts') {
            // 23 Sep 2026 — tree_warm.js: per-tree facts (P(top), cut-set snapshots,
            // single-failure events) for a batch of trees, each with the pages its
            // transfers reach. Same engine functions the page uses; the page files
            // each answer under the exact content key it sent with the request.
            self.postMessage({ id: msg.id, ok: true, facts: (msg.trees || []).map(function (t) { return SLFTAEngine.treeFactsForWorker(t.root, t.pages); }) });
            return;
        }
        if (msg.op === 'ptop') {
            // #17 — exact P(top) + importance over a transfer-flattened, probability-baked tree.
            self.postMessage({ id: msg.id, ok: true, ptop: SLFTAEngine.computeImportanceForWorker(msg.root) });
            return;
        }
        var cutsets = SLFTAEngine.enumerateForWorker(msg.root);
        self.postMessage({ id: msg.id, ok: true, cutsets: cutsets });
    } catch (err) {
        self.postMessage({
            id: msg.id, ok: false,
            name: (err && err.name) || 'Error',
            count: (err && err.count) || 0,
            message: (err && err.message) || String(err)
        });
    }
};

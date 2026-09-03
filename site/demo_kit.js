// demo_kit.js — shared authoring helpers for the built-in showcases.
//
// WHY THIS EXISTS. Four demos need the same two things, and hand-authoring them
// four times is how they drifted apart in the first place: a VERIFICATION MIRROR
// for every allocation tree, and a full CCA set. The mirror is the one that
// really cannot be hand-authored — a mirror must be structurally identical to its
// allocation page, carry the same failure-condition linkage, and rewrite its
// TRANSFER links to the MIRRORED target rather than the allocation target. Get
// the last of those wrong and the verification tree quietly measures the wrong
// thing, which no test written against the demo's own fixture would ever catch.
//
// Nothing in here invents safety content. It copies structure and applies an
// explicit, declared factor to the quantities, so a reader can see exactly what
// the "as-built" figures are and where they came from.
//
// Loaded as a classic script before the showcase loaders; exposes window.slDemoMirror.
// ---------------------------------------------------------------------------
(function () {
    'use strict';

    // Deep-copy a tree, mint fresh node ids, scale the quantities, and rewrite
    // TRANSFER links through idMap. Leaves keep their repair model, τ, and any
    // Markov linkage — those describe the DESIGN, not the achieved figure, and
    // scaling them would silently change the maintenance programme.
    function _cloneScaled(node, nextId, factor, idMap) {
        if (!node) return null;
        var out = {};
        Object.keys(node).forEach(function (k) { if (k !== 'children') out[k] = node[k]; });
        out.id = nextId();
        out.logicalId = out.id;
        out.displayId = (node.type === 'gate' ? 'G-' : 'BE-') + out.id;

        var lam = parseFloat(node.lambda) || 0;
        var prob = parseFloat(node.probability) || 0;
        if (node.type !== 'gate') {
            if (lam > 0) out.lambda = lam * factor;
            // A leaf authored at probability 1 is a STATEMENT, not a measurement:
            // "this provision does not exist on the aircraft". Scaling a certainty
            // by a reliability-growth factor produces 0.8, which reads as "the
            // provision is absent 80% of the time" — a number that means nothing
            // and quietly softens the very finding the leaf was written to make.
            // Certainties are carried across untouched.
            if (prob > 0 && prob < 1) out.probability = prob * factor;
        } else {
            out.probability = 0;   // gates are rolled up by the engine, never authored
        }

        if (node.linkedPageId && idMap[node.linkedPageId]) out.linkedPageId = idMap[node.linkedPageId];

        out.children = (node.children || []).map(function (c) { return _cloneScaled(c, nextId, factor, idMap); });
        return out;
    }

    // Give every allocation page in `pages` a verification mirror, appended to
    // the same array. Returns the mirrors.
    //
    //   pages   — the demo's page array (mutated: mirrors are pushed onto it)
    //   opts.nextId   REQUIRED — the builder's own id minter, so ids stay unique
    //   opts.factor   as-built quantities relative to allocated (default 0.8)
    //   opts.factorFor(page) — per-page override; return null to fall back
    //   opts.skip(page)      — pages that should NOT be mirrored
    //   opts.idSuffix / opts.nameSuffix
    function slDemoMirror(pages, opts) {
        opts = opts || {};
        if (typeof opts.nextId !== 'function') throw new Error('slDemoMirror: opts.nextId is required — mirrors must mint ids from the builder that owns them');
        var factor = opts.factor == null ? 0.8 : opts.factor;
        var idSuffix = opts.idSuffix || '-v';
        var nameSuffix = opts.nameSuffix == null ? ' (Verification)' : opts.nameSuffix;
        var skip = typeof opts.skip === 'function' ? opts.skip : function () { return false; };

        // Already-mirrored pages are skipped, so calling this twice is a no-op
        // rather than a second set of pages carrying DUPLICATE ids. Found by the
        // suite's idempotence check, not by reading — a builder that gains a
        // second call during an edit would otherwise ship colliding node ids.
        var mirrored = {};
        pages.forEach(function (p) { if (p && p.verifies) mirrored[p.verifies] = true; });
        var alloc = pages.filter(function (p) { return p && p.root && !p.verifies && !mirrored[p.id] && !skip(p); });

        // Map EVERY allocation page id to its mirror id first — a transfer can
        // point at a page that is mirrored later in the list.
        var idMap = {};
        alloc.forEach(function (p) { idMap[p.id] = p.id + idSuffix; });

        var made = alloc.map(function (p) {
            var f = null;
            if (typeof opts.factorFor === 'function') f = opts.factorFor(p);
            if (f == null || !isFinite(f)) f = factor;
            var m = {
                id: idMap[p.id],
                name: p.name + nameSuffix,
                verifies: p.id,
                mode: 'bottom-up',
                root: _cloneScaled(p.root, opts.nextId, f, idMap),
                asBuiltFactor: f
            };
            if (p.treeLevel) m.treeLevel = p.treeLevel;
            if (p.systemId) m.systemId = p.systemId;
            // The linkage must be IDENTICAL, not merely similar: the mirror is
            // measured against the same failure condition's target, and a mirror
            // linked elsewhere is measured against the wrong number.
            m.linkedFhaIds = (p.linkedFhaIds || []).slice();
            if (p.linkedFhaId != null) m.linkedFhaId = p.linkedFhaId;
            return m;
        });

        made.forEach(function (m) { pages.push(m); });
        return made;
    }

    if (typeof window !== 'undefined') window.slDemoMirror = slDemoMirror;
    if (typeof module !== 'undefined' && module.exports) module.exports = { slDemoMirror: slDemoMirror };
})();

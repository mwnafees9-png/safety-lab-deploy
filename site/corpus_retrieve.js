// ============================================================================
// corpus_retrieve.js — A15 phase 2: client access to the free-corpus index.
// Deterministic BM25 endpoint (wave 1: 14 CFR, point-in-time) + exact-id
// lookup. Results are AUTHORITATIVE REGULATORY TEXT (US Gov, public domain),
// injected as CITED REFERENCE — distinct from untrusted user documents.
//
// ITAR GATE FIRST (ruling 4 Aug: block entirely): queries derive from project
// text; an ITAR-controlled project performs NO corpus retrieval — zero egress,
// fail closed, checked at the TOP of every public function.
// Store access by BARE IDENTIFIER (3 Aug lesson) — projectConfig is lexical.
// ============================================================================
(function () {
    'use strict';

    // SLConfig is the ONLY authority for this address (slab_config.js 1.3). It supplies the hosted
    // default on the hosted demo and NOTHING on a customer install, so a blank address means the
    // corpus is off rather than "ours". This module must never carry a fallback of its own: the one
    // it used to carry (api.safetylabaero.com) sent the first 500 characters of every drafting
    // prompt to Safety Lab from self-hosted installs, which is the one thing customer-hosted exists
    // to prevent. Retrieval is advisory — off simply means drafting proceeds without it.
    const ENDPOINT = (function () {
        try {
            var c = (window.SLConfig && window.SLConfig.corpusEndpoint) || '';
            return c ? String(c).replace(/\/+$/, '') : '';
        } catch (_) { return ''; }
    })();

    function _itarBlocked() {
        try { return !!(typeof projectConfig !== 'undefined' && projectConfig && projectConfig.isITARControlled); }
        catch (_) { return true; }   // fail CLOSED — unknown state = controlled
    }

    async function search(q, k) {
        if (!ENDPOINT) return [];       // not configured = off, never a silent fallback to ours
        if (_itarBlocked()) return [];
        q = String(q || '').trim().slice(0, 500);
        if (!q) return [];
        try {
            const r = await fetch(ENDPOINT + '/v1/corpus/search?q=' + encodeURIComponent(q) + '&k=' + (Math.min(12, k || 4)));
            if (!r.ok) return [];
            const d = await r.json();
            return Array.isArray(d.results) ? d.results.map(function (x) {
                return { id: x.id, title: x.title, part: x.part, score: x.score, text: x.text, provenance: x.provenance || {}, issueDate: d.issueDate };
            }) : [];
        } catch (_) { return []; }   // corpus down ≠ drafting down — never block a completion
    }

    // Exact-section lookup — the 4 Aug ranking note: a section never cites its
    // own number, so BM25 ranks CITERS above the section itself on bare-ref
    // queries. Search wide, then filter to the section's own chunks by id.
    async function lookup(sectionRef) {
        if (_itarBlocked()) return [];
        const ref = String(sectionRef || '').replace(/^§\s*/, '').trim();
        if (!ref) return [];
        const hits = await search(ref, 12);
        const want = ('14CFR-' + ref).toLowerCase();
        const exact = hits.filter(function (h) { return String(h.id || '').toLowerCase().split('#')[0] === want; });
        return exact.length ? exact : hits.slice(0, 2);   // graceful: citers beat nothing
    }

    // Grounding block for Provider.complete — cited verbatim, provenance named.
    async function groundingBlock(queryText, k) {
        const hits = await search(queryText, k || 4);
        if (!hits.length) return '';
        const lines = hits.map(function (h) {
            return '- [' + h.id + '] ' + (h.title || '') + ': "' + String(h.text || '').slice(0, 480) + '"';
        });
        return [
            'REGULATORY REFERENCE — 14 CFR, point-in-time ' + (hits[0].issueDate || 'current') + ' (US Government work, public domain; retrieved from the eCFR-derived corpus index).',
            'These are AUTHORITATIVE regulation excerpts matched to this task. Cite them by section id (e.g. ' + hits[0].id + ') when they ground a statement; never alter their text; if none is relevant, ignore them.',
            ''
        ].concat(lines).join('\n');
    }

    if (typeof window !== 'undefined') {
        window.A15_CORPUS = { search: search, lookup: lookup, groundingBlock: groundingBlock, endpoint: ENDPOINT, _itarBlocked: _itarBlocked };
    }
})();

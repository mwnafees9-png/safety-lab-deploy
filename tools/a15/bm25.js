// A15 — deterministic BM25 scoring, shared VERBATIM between the Cloudflare
// Worker (corpus_worker.js) and the test wall. Pure functions, no state, no
// model: the same query against the same manifest scores identically forever
// (ruling 4 Aug — no learned component in the retrieval path).
'use strict';

// MUST match tools/a15/corpus_pipeline.py tokenize() exactly — the index and
// the query share one tokenizer or recall silently rots.
const TOKEN_RE = /[a-z0-9]+(?:[.\-()][a-z0-9()]+)*/g;
function tokenize(text) {
    const out = [];
    const m = String(text || '').toLowerCase().match(TOKEN_RE) || [];
    for (const t of m) {
        out.push(t);
        if (t.includes('(')) {
            const base = t.split('(', 1)[0].replace(/\.+$/, '');
            if (base) out.push(base);
        }
    }
    return out;
}

// index = { postings: {term: [[docId, tf], …]}, doclen: {docId: len}, avgdl, N, k1, b }
function score(queryText, index, k) {
    const { postings, doclen, avgdl, N, k1, b } = index;
    const acc = Object.create(null);
    const seen = new Set();
    for (const term of tokenize(queryText)) {
        if (seen.has(term)) continue;   // dedupe query terms — deterministic
        seen.add(term);
        const plist = postings[term];
        if (!plist) continue;
        const df = plist.length;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        for (const [docId, tf] of plist) {
            const dl = doclen[docId] || avgdl;
            const s = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl));
            acc[docId] = (acc[docId] || 0) + s;
        }
    }
    return Object.entries(acc)
        .map(([docId, s]) => ({ docId: +docId, score: s }))
        .sort((a, b2) => b2.score - a.score || a.docId - b2.docId)   // stable tie-break: docId
        .slice(0, k || 8);
}

if (typeof module !== 'undefined') module.exports = { tokenize, score };
if (typeof globalThis !== 'undefined') { globalThis.A15_BM25 = { tokenize, score }; }

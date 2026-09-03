// A15 — Cloudflare Worker: deterministic corpus retrieval over the R2 bucket.
//   GET /v1/corpus/search?q=<query>&k=<top-k>
// Bindings (wrangler.toml): [[r2_buckets]] binding = "CORPUS" (bucket holding
// manifest.json / postings.json / chunks-XX.json from corpus_pipeline.py).
// Scoring = tools/a15/bm25.js, inlined below the handler VERBATIM (keep them
// in sync — the test wall executes the same functions).
//
// The client's ITAR gate means controlled projects never call this endpoint;
// the worker itself is stateless, logs nothing about queries, and serves only
// public-domain US Government text with provenance.
'use strict';

const ALLOW_ORIGIN = 'https://safetylabaero.com';
const MAX_K = 12;

let _cache = null;   // { manifest, index, shards: Map<file, chunks[]> } — per-isolate warm cache

async function _load(env) {
    if (_cache) return _cache;
    const [mObj, pObj] = await Promise.all([env.CORPUS.get('manifest.json'), env.CORPUS.get('postings.json')]);
    if (!mObj || !pObj) throw new Error('corpus not uploaded');
    _cache = { manifest: await mObj.json(), index: await pObj.json(), shards: new Map() };
    return _cache;
}

async function _chunkById(env, cache, docId) {
    // shard files are ordered; manifest.shards carries counts — walk the offsets
    let off = 0;
    for (const s of cache.manifest.shards) {
        if (docId < off + s.count) {
            if (!cache.shards.has(s.file)) {
                const o = await env.CORPUS.get(s.file);
                cache.shards.set(s.file, o ? await o.json() : []);
            }
            return (cache.shards.get(s.file) || [])[docId - off] || null;
        }
        off += s.count;
    }
    return null;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const cors = {
            'Access-Control-Allow-Origin': ALLOW_ORIGIN,
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Content-Type': 'application/json'
        };
        if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
        if (url.pathname !== '/v1/corpus/search') return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: cors });
        const q = (url.searchParams.get('q') || '').slice(0, 500);
        const k = Math.min(MAX_K, Math.max(1, parseInt(url.searchParams.get('k') || '6', 10) || 6));
        if (!q.trim()) return new Response(JSON.stringify({ error: 'empty query' }), { status: 400, headers: cors });
        try {
            const cache = await _load(env);
            const hits = score(q, cache.index, k);
            const out = [];
            for (const h of hits) {
                const c = await _chunkById(env, cache, h.docId);
                if (c) out.push({ id: c.id, title: c.title, part: c.part, score: +h.score.toFixed(4), text: c.text, provenance: c.provenance });
            }
            return new Response(JSON.stringify({ corpus: cache.manifest.corpus, issueDate: cache.manifest.issueDate, results: out }), { headers: cors });
        } catch (e) {
            return new Response(JSON.stringify({ error: String((e && e.message) || e) }), { status: 500, headers: cors });
        }
    }
};

// ---- shared scoring (VERBATIM from tools/a15/bm25.js) -----------------------
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
function score(queryText, index, k) {
    const { postings, doclen, avgdl, N, k1, b } = index;
    const acc = Object.create(null);
    const seen = new Set();
    for (const term of tokenize(queryText)) {
        if (seen.has(term)) continue;
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
        .sort((a, b2) => b2.score - a.score || a.docId - b2.docId)
        .slice(0, k || 8);
}

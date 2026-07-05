/* ============================================================================
 * Safety Lab — Cloudflare Worker
 * ============================================================================
 *
 * Path-based routing for safetylabaero.com:
 *
 *     /                     → landing.html  (marketing site)
 *     /app    or /app/      → index.html    (the Safety Lab application)
 *     /app/<anything>       → strips the /app prefix, then serves from /site/
 *                              (so the app's relative asset references — e.g.
 *                              `safety_lab.js`, `auth_gate.js`, `favicon.svg`
 *                              — resolve correctly when the document base is /app/)
 *     everything else       → served directly from /site/ (favicon, robots.txt,
 *                              sitemap.xml, og.png, the landing page's own assets)
 *
 * Implementation note: the Worker delegates to the ASSETS binding (configured in
 * wrangler.jsonc with `directory: "./site"`). That binding handles the actual
 * file read; the Worker is just a thin URL rewriter on top of it.
 *
 * The previous Workers-Static-Assets-only deploy treated the app as the front
 * door. After this Worker ships, the marketing page becomes the front door and
 * the app lives under /app/. The auth gate and app code make no assumptions
 * about being served at root, so no in-app changes were required.
 * ============================================================================ */

// ============================================================================
// Content Security Policy (single source of truth — owned in code, not the dash)
// ============================================================================
// Rollout: ships REPORT-ONLY first so a missed origin is logged, never blocked.
// After confirming the browser console shows no violations from legitimate use,
// flip CSP_ENFORCE to true and redeploy to switch the header to enforcing.
//
// IMPORTANT: remove any Cloudflare dashboard CSP rule (the stray report-only
// `connect-src 'none'`) so this Worker policy is the only one in effect.
//
// Allowlist derived from a full inventory of the app's origins:
//   - script CDNs: cdnjs, jsdelivr, unpkg, d3js  (jspdf/xlsx/jszip/mammoth/pdf.js/
//                  chart.js/vis-network/supabase-js/d3)
//   - 'unsafe-inline' on script-src is REQUIRED: 159 inline event handlers + 15
//                  inline <script> blocks. No eval/Function exists, so no 'unsafe-eval'.
//   - connect-src: Supabase REST + wss realtime, the LLM proxy, Anthropic, Voyage,
//                  Jama, plus the CDN hosts (pdf.js fetches its worker from cdnjs).
const CSP_ENFORCE = true;    // SEC-6: enforcing (flipped 2026-07-05 after report-only soak; set false to roll back)
const CSP_POLICY = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://d3js.org",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://fhrqkhdrwbfnizkepkch.supabase.co wss://fhrqkhdrwbfnizkepkch.supabase.co https://api.safetylabaero.com https://api.anthropic.com https://api.voyageai.com https://electra.jamacloud.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://buy.stripe.com",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
].join('; ');

// Standard hardening headers applied alongside the CSP on document responses.
// All safe given the site is fully HTTPS and is never meant to be framed.
const SEC_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

// Serve an HTML document with a revalidation header so browsers always check for
// a fresh shell instead of silently reusing a stale cached copy on the next visit.
// (JS/CSS keep their ?v= cache-busting and are passed through untouched below.)
// Also stamps the CSP + hardening headers — this is the single chokepoint for all
// HTML documents (landing, content pages, the app shell).
async function serveHtml(respPromise) {
    const r = await respPromise;
    const h = new Headers(r.headers);
    h.set('Cache-Control', 'no-cache, must-revalidate');
    h.set(CSP_ENFORCE ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', CSP_POLICY);
    for (const [k, v] of Object.entries(SEC_HEADERS)) h.set(k, v);
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // -----------------------------------------------------------------
        // /api/bridge — J1 live-bridge proxy (STATELESS pass-through).
        // Browsers cannot call Jama/Polarion REST APIs cross-origin, so the
        // app calls its own origin and this route relays. Constraints that
        // keep it from being an open proxy:
        //   · GET only (phase 1 is read-only by design)
        //   · https targets only, no IP-literal/localhost/internal hosts
        //   · target path must contain '/rest/' (ALM REST APIs only)
        //   · Authorization header REQUIRED and forwarded verbatim —
        //     nothing is stored, nothing is logged, no state exists here.
        // The desktop app bypasses this route entirely (direct fetch).
        // -----------------------------------------------------------------
        // -----------------------------------------------------------------
        // /api/upload — D-PUB chunked release uploads into the DOWNLOADS
        // R2 bucket via multipart assembly. Exists because single ~100MB+
        // PUTs die on residential uplinks; 25MB parts do not. Locked down:
        //   · requires x-upload-token header === env.UPLOAD_TOKEN (secret)
        //   · keys must live under desktop/ (release artifacts only)
        //   · no listing, no reads, no deletes — create/part/complete/abort
        // -----------------------------------------------------------------
        if (path === '/api/upload') {
            const j = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'content-type': 'application/json' } });
            const token = request.headers.get('x-upload-token');
            if (!env.UPLOAD_TOKEN || !token || token !== env.UPLOAD_TOKEN) return j({ error: 'unauthorized' }, 401);
            if (!env.DOWNLOADS) return j({ error: 'bucket binding missing' }, 500);
            const action = url.searchParams.get('action') || '';
            const key = url.searchParams.get('key') || '';
            if (!/^desktop\/[A-Za-z0-9 ._-]+$/.test(key)) return j({ error: 'key must be desktop/<file>' }, 400);
            try {
                if (action === 'create' && request.method === 'POST') {
                    const ct = url.searchParams.get('ct') || 'application/octet-stream';
                    const mpu = await env.DOWNLOADS.createMultipartUpload(key, { httpMetadata: { contentType: ct } });
                    return j({ uploadId: mpu.uploadId, key });
                }
                if (action === 'part' && request.method === 'PUT') {
                    const uploadId = url.searchParams.get('uploadId') || '';
                    const partNumber = parseInt(url.searchParams.get('part') || '0', 10);
                    if (!uploadId || !(partNumber >= 1)) return j({ error: 'uploadId and part required' }, 400);
                    const mpu = env.DOWNLOADS.resumeMultipartUpload(key, uploadId);
                    const part = await mpu.uploadPart(partNumber, request.body);
                    return j({ partNumber: part.partNumber, etag: part.etag });
                }
                if (action === 'complete' && request.method === 'POST') {
                    const uploadId = url.searchParams.get('uploadId') || '';
                    const parts = await request.json();
                    if (!uploadId || !Array.isArray(parts) || !parts.length) return j({ error: 'uploadId and parts[] required' }, 400);
                    const mpu = env.DOWNLOADS.resumeMultipartUpload(key, uploadId);
                    const obj = await mpu.complete(parts);
                    return j({ ok: true, key, etag: obj.httpEtag, size: obj.size });
                }
                if (action === 'abort' && request.method === 'POST') {
                    const uploadId = url.searchParams.get('uploadId') || '';
                    const mpu = env.DOWNLOADS.resumeMultipartUpload(key, uploadId);
                    await mpu.abort();
                    return j({ ok: true, aborted: uploadId });
                }
            } catch (e) {
                return j({ error: String(e && e.message || e) }, 500);
            }
            return j({ error: 'unknown action' }, 400);
        }

        if (path === '/api/bridge') {
            if (request.method !== 'GET')
                return new Response(JSON.stringify({ error: 'read-only bridge: GET only' }), { status: 405, headers: { 'content-type': 'application/json' } });
            const auth = request.headers.get('authorization');
            if (!auth)
                return new Response(JSON.stringify({ error: 'Authorization header required' }), { status: 401, headers: { 'content-type': 'application/json' } });
            let target;
            try { target = new URL(url.searchParams.get('target') || ''); } catch (_) {
                return new Response(JSON.stringify({ error: 'invalid target URL' }), { status: 400, headers: { 'content-type': 'application/json' } });
            }
            const host = target.hostname;
            const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':');
            if (target.protocol !== 'https:' || isIp || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal'))
                return new Response(JSON.stringify({ error: 'target must be a public https host' }), { status: 400, headers: { 'content-type': 'application/json' } });
            // SEC-3 — port pinning: explicit ports other than 443 are refused
            // (blocks probing internal services that happen to speak https on
            // odd ports behind a public hostname).
            if (target.port && target.port !== '443')
                return new Response(JSON.stringify({ error: 'only port 443 is bridged' }), { status: 400, headers: { 'content-type': 'application/json' } });
            if (!target.pathname.includes('/rest/'))
                return new Response(JSON.stringify({ error: 'only ALM /rest/ APIs are bridged' }), { status: 400, headers: { 'content-type': 'application/json' } });
            try {
                // SEC-3 — redirects are NOT followed: a compliant-looking target
                // can no longer bounce the relay (with the caller's Authorization
                // header) to an arbitrary host. The client sees the redirect
                // status and can decide for itself.
                const upstream = await fetch(target.toString(), {
                    method: 'GET',
                    redirect: 'manual',
                    headers: { 'authorization': auth, 'accept': 'application/json' },
                });
                if (upstream.status >= 300 && upstream.status < 400)
                    return new Response(JSON.stringify({ error: 'upstream redirected (' + upstream.status + ') — redirects are not followed by the bridge', location: upstream.headers.get('location') || '' }),
                        { status: 502, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
                const body = await upstream.text();
                return new Response(body, {
                    status: upstream.status,
                    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: 'upstream fetch failed: ' + (e && e.message) }), { status: 502, headers: { 'content-type': 'application/json' } });
            }
        }

        // -----------------------------------------------------------------
        // Root → marketing landing page
        // -----------------------------------------------------------------
        if (path === '/' || path === '') {
            return serveHtml(env.ASSETS.fetch(new URL('/landing.html', url.origin)));
        }

        // -----------------------------------------------------------------
        // Marketing content pages (clean URLs → /<slug>.html in /site/)
        //   Explicit allowlist so unknown paths still fall through to the
        //   assets binding's not-found handling rather than serving a page.
        // -----------------------------------------------------------------
        const CONTENT_PAGES = new Set([
            'fault-tree-analysis',
            'arp-4761a',
            'arp-4754b',
            'fmea-software',
            'common-cause-analysis',
            'resources',
            'roi',
        ]);
        const slug = path.replace(/^\/+|\/+$/g, '');
        if (CONTENT_PAGES.has(slug)) {
            return serveHtml(env.ASSETS.fetch(new URL('/' + slug + '.html', url.origin)));
        }

        // -----------------------------------------------------------------
        // App entry points: /app and /app/
        //   Serve the app shell (index.html in /site/).
        // -----------------------------------------------------------------
        if (path === '/app' || path === '/app/') {
            // Redirect /app → /app/ so relative asset URLs resolve correctly
            // (otherwise `safety_lab.js` from the document at /app would
            // request /safety_lab.js — wrong). The trailing slash makes the
            // document base be /app/ which is what we want.
            if (path === '/app') {
                return Response.redirect(url.origin + '/app/' + url.search, 301);
            }
            return serveHtml(env.ASSETS.fetch(new URL('/index.html', url.origin)));
        }

        // -----------------------------------------------------------------
        // App sub-paths: /app/<anything>
        //   Strip the /app prefix and serve the remaining path from /site/.
        //   This way /app/safety_lab.js fetches /site/safety_lab.js.
        // -----------------------------------------------------------------
        if (path.startsWith('/app/')) {
            const stripped = path.substring('/app'.length);  // keeps the leading /
            const rewritten = new URL(stripped, url.origin);
            rewritten.search = url.search;
            return env.ASSETS.fetch(rewritten);
        }

        // -----------------------------------------------------------------
        // Everything else (favicon.svg, robots.txt, sitemap.xml, og.png,
        // any other static asset that the marketing page or crawlers ask
        // for) — pass through to the assets binding as-is.
        // -----------------------------------------------------------------
        return env.ASSETS.fetch(request);
    }
};

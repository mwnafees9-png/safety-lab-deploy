// ============================================================================
// safety-lab-proxy — worker.js  (SEC-8 hardened)
// ============================================================================
// Backs api.safetylabaero.com/v1/ai — the Pro+ managed-AI proxy that holds the
// real Anthropic / Voyage / (future) Azure-Gov keys. The browser never sees a
// provider key; it authenticates with a Supabase-issued license token.
//
// SEC-8 change — server-side ITAR enforcement:
//   · itar_required now comes from the LICENSE ROW (public.license_tokens),
//     not the browser. A bypassed or malicious client can no longer send
//     x-safetylab-itar:0 to sneak controlled data onto public Anthropic.
//   · The client header can only ESCALATE (0→1), never downgrade an
//     ITAR-mandated license. Server truth wins.
//   · An ITAR-required request NEVER falls back to public Anthropic. Until the
//     domestic-only (Azure Gov) backend is provisioned it returns 503 — refuse,
//     don't leak. That is the safety-critical guarantee the EULA promises.
//
// SEC-8b change — the domestic-only backend is now WIRED (configurable):
//   · An ITAR request routes to a US-sovereign backend via sovereign_router.js
//     (AWS Bedrock GovCloud / Claude, or Azure OpenAI Gov / GPT).
//   · If no sovereign backend is configured, we still REFUSE (503) — never
//     fall back to public. On any sovereign upstream error we also refuse.
// ============================================================================

import { itarProvider, sovereignChat, sovereignEmbed } from "./sovereign_router.js";

const ANTHROPIC_UPSTREAM = "https://api.anthropic.com/v1/messages";
const VOYAGE_UPSTREAM = "https://api.voyageai.com/v1/embeddings";

const MODEL_TOKEN_WEIGHTS = {
  "claude-opus-4-8": 5,   // the app's default drafting model (config_data.js) — was missing here, so Opus 4.8 metered at Sonnet weight (12 Sep 2026)
  "claude-opus-4-6": 5,
  "claude-sonnet-4-6": 1,
  "claude-haiku-4-5-20251001": 0.3,
  "voyage-3-large": 0.05,
  "voyage-3": 0.02,
  "voyage-code-3": 0.05,
};

// ============================================================================
// S11 / SEC-3 (29 Sep 2026) — the proxy used to answer "access-control-allow-origin: *",
// i.e. it told every browser on the internet that any page was welcome to read its
// replies. Be clear about what that is and is not. CORS is NOT the access control
// here; the bearer token is. A thief with a token can call this from a server and
// CORS never enters into it. What "*" bought an attacker was the browser route: a
// hostile page, in a real user's browser, could use a leaked token AND read the
// answers. Closing it takes that route away. It does not make a leaked token safe.
//
// THE AWKWARD PART, SAID OUT LOUD. The desktop app loads its pages from file://, and
// Chromium reports that as the literal origin "null". To keep the desktop working the
// null origin has to be accepted, and a sandboxed iframe presents the same origin. So
// this is tighter than "*" and looser than it should be. The real fix is on the
// desktop side — serving the app from a custom scheme instead of file:// — which is
// already open as SEC-8 / S25. ALLOW_NULL_ORIGIN=0 turns the loose case off the day
// that lands; it defaults on so nothing breaks before then.
//
// A CUSTOMER INSTALL serves the app from the customer's own hostname, so it sets
// ALLOWED_ORIGINS (comma-separated) to that. A request with NO Origin header at all is
// not a browser cross-origin request (curl, a server, the desktop main process) and is
// served normally; it simply gets no CORS header back, because it needs none.
// ============================================================================
const BUILTIN_ORIGINS = ["https://safetylabaero.com", "https://www.safetylabaero.com"];

const CORS_BASE = {
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,x-safetylab-itar,x-safetylab-feature",
  "access-control-max-age": "86400",
  "vary": "Origin",
};

function allowedOrigins(env) {
  const extra = String((env && env.ALLOWED_ORIGINS) || "").split(",").map((s) => s.trim()).filter(Boolean);
  return BUILTIN_ORIGINS.concat(extra);
}

// "none"  — no Origin header: not a browser cross-origin call. Serve it, send no ACAO.
// "allow" — a known origin. Serve it and echo the origin back.
// "deny"  — a browser is calling from somewhere we do not know. Refuse, and spend
//           nothing: no licence lookup, no upstream call, no metered tokens.
function originVerdict(origin, env) {
  if (!origin) return "none";
  if (origin === "null") return (String((env && env.ALLOW_NULL_ORIGIN) ?? "1") === "1") ? "allow" : "deny";
  // A CUSTOMER-HOSTED proxy serves the customer's own app from a hostname Safety Lab has
  // no way of knowing, and installs already in the field were deployed before this
  // variable existed. Shipping a change that silently 403s a customer's entire AI feature
  // is worse than the exposure it closes — and the exposure it closes is smaller there
  // anyway: that proxy sits inside the customer's own boundary and bills their own AI.
  // So on an offline-licence install with nothing configured, the check stands down and
  // says so in the log. Set ALLOWED_ORIGINS and it enforces immediately. The HOSTED
  // deployment never takes this path: it is not in offline mode, and its own origins are
  // built in. configure.js writes the variable for new installs, and the install kit
  // makes it required at the next revision.
  if (env && env.LICENSE_MODE === "offline" && !String(env.ALLOWED_ORIGINS || "").trim()) {
    console.warn("[proxy] ALLOWED_ORIGINS is not set on this customer-hosted install — origin checking is standing down. Set it to your app's address to turn it on.");
    return "allow";
  }
  return allowedOrigins(env).indexOf(origin) >= 0 ? "allow" : "deny";
}

// Applied once, at the edge of fetch(), to whatever the handlers returned. Doing it here
// rather than inside every handler means there is no per-request state shared between
// concurrent requests in the same isolate, which is its own class of bug.
function withCors(res, verdict, origin) {
  const h = new Headers(res.headers);
  for (const k of Object.keys(CORS_BASE)) if (!h.has(k)) h.set(k, CORS_BASE[k]);
  if (verdict === "allow" && origin) h.set("access-control-allow-origin", origin);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

const CORS = CORS_BASE;   // the static half; the origin is decided per request, above

function jsonResponse(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS, ...extra } });
}
function passthroughResponse(status, text) {
  return new Response(text, { status, headers: { "content-type": "application/json", ...CORS } });
}
function currentMonth() { return new Date().toISOString().slice(0, 7); }
// 12 Sep 2026 — prompt caching. The app now marks the repeating prefix of its system
// prompt (skill body, uploaded source document) so Anthropic stores it and bills repeats
// at a tenth of the input price; the response usage then carries the two cache
// counters alongside input_tokens (which counts only the uncached tail). Meter them at
// Anthropic's multiples — a cache WRITE at 1.25x, a cache READ at 0.10x — so a Pro+
// allowance reflects the real cost and the saving is visible. Same constants as
// core_modules.js on the client; keep them in step. Missing counters (Azure
// translation, older responses) are zero, so nothing bills differently than before.
const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT = 0.1;
function weightedTokens(model, tokensIn, tokensOut, cacheWrite, cacheRead) {
  const w = MODEL_TOKEN_WEIGHTS[model] || 1;
  const raw = (tokensIn || 0) + (tokensOut || 0) + (cacheWrite || 0) * CACHE_WRITE_MULT + (cacheRead || 0) * CACHE_READ_MULT;
  return Math.max(0, Math.round(raw * w));
}

async function sbFetch(env, path, opts = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    ...(opts.headers || {}),
  };
  return fetch(url, { ...opts, headers });
}

async function lookupToken(env, token) {
  // SEC-8 itar_required + SEC-7 rate_limit_rpm added to the select.
  const sel = "token,user_id,plan,monthly_allowance,tokens_used_this_month,reset_month,expires_at,itar_required,rate_limit_rpm";
  const res = await sbFetch(env, `/license_tokens?token=eq.${encodeURIComponent(token)}&select=${sel}`);
  if (!res.ok) return { error: "supabase_unreachable" };
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return { error: "invalid_token" };
  const row = rows[0];
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { error: "expired" };
  const used = row.reset_month === currentMonth() ? Number(row.tokens_used_this_month || 0) : 0;
  return {
    license: row,
    used,
    remaining: Math.max(0, Number(row.monthly_allowance || 0) - used),
    exhausted: used >= Number(row.monthly_allowance || 0),
    itarRequired: row.itar_required === true,   // SEC-8 — server truth
    rateLimitRpm: Number(row.rate_limit_rpm) || 0,   // SEC-7 — 0/NULL = unlimited
  };
}

// ============================================================================
// S8 (20 Sep 2026) — the proxy is the ONE server-side component that reads secrets.
//
// Two kinds of caller now reach this worker:
//   licence token  — 64 hex chars, a row in license_tokens. Paid users. Safety Lab's own
//                    upstream keys are used and the call is metered against the licence.
//   Supabase JWT   — three base64url segments. Any signed-in user. Used by people bringing
//                    their own AI key (BYO) and by the Jama bridge. Their keys are read
//                    from user_secrets (service_role, RLS bypassed) and NEVER metered
//                    against Safety Lab, because Safety Lab is not paying for them.
// The two shapes cannot be confused, so the branch is on shape and costs no extra lookup.
// Before this, a BYO key lived in the browser's localStorage and the browser called
// api.anthropic.com directly with it — readable by any script on the page, and outside
// the ITAR fence entirely. Now the browser holds nothing and every AI call passes here.
// ============================================================================
function looksLikeJwt(t) {
  return /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(t || "");
}

async function verifyUserJwt(env, jwt) {
  // Supabase Auth checks the signature and expiry; we only ask it who the token belongs to.
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { error: "supabase_unreachable" };
  let res;
  try {
    res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${jwt}` },
    });
  } catch (_) { return { error: "supabase_unreachable" }; }
  if (res.status === 401 || res.status === 403) return { error: "invalid_token" };
  if (!res.ok) return { error: "supabase_unreachable" };
  let u; try { u = await res.json(); } catch (_) { return { error: "invalid_token" }; }
  if (!u || !u.id) return { error: "invalid_token" };
  return { userId: String(u.id), email: String(u.email || "") };
}

// service_role read of ONE secret for ONE user. The value never goes back to a client;
// it is used here, in this process, and forgotten.
async function readUserSecret(env, userId, kind) {
  if (!env.SUPABASE_URL) return { error: "supabase_unreachable" };
  let res;
  try {
    res = await sbFetch(env, `/user_secrets?user_id=eq.${encodeURIComponent(userId)}&kind=eq.${encodeURIComponent(kind)}&select=secret,meta`);
  } catch (_) { return { error: "supabase_unreachable" }; }
  if (!res.ok) return { error: "supabase_unreachable" };
  let rows; try { rows = await res.json(); } catch (_) { return { error: "supabase_unreachable" }; }
  if (!Array.isArray(rows) || rows.length === 0) return { missing: true };
  return { secret: String(rows[0].secret || ""), meta: rows[0].meta || {} };
}

// ---- /v1/ai/bridge — the Jama relay, credential built HERE from the vault ---------------
// Replaces the site worker's /api/bridge, where the browser built the Basic header itself
// from a localStorage credential and the relay forwarded it verbatim. Same guards as
// before (https, public host, port 443, /rest/ only, redirects not followed) plus the one
// the desktop bridge already had: the target host must equal the host SAVED with the
// credential, so a caller cannot point a stored credential at a different server.
function bridgeTargetProblem(rawUrl, savedHost) {
  let target;
  try { target = new URL(rawUrl || ""); } catch (_) { return { status: 400, error: "invalid target URL" }; }
  const host = target.hostname;
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":");
  if (target.protocol !== "https:" || isIp || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal"))
    return { status: 400, error: "target must be a public https host" };
  if (target.port && target.port !== "443") return { status: 400, error: "only port 443 is bridged" };
  if (!target.pathname.includes("/rest/")) return { status: 400, error: "only ALM /rest/ APIs are bridged" };
  if (!savedHost || host.toLowerCase() !== String(savedHost).toLowerCase())
    return { status: 403, error: "target host does not match the saved connector" };
  return { target };
}

async function handleBridge(request, env, caller, url) {
  if (!caller.userId) return jsonResponse(401, { error: { type: "unauthorized", message: "The bridge needs a signed-in user." } });
  const rl = await checkRateLimit(env, "br:" + caller.userId, 60);
  if (!rl.ok) return jsonResponse(429, { error: { type: "rate_limited", message: "Bridge rate limit (60/min) exceeded." }, retry_after: 60 }, { "retry-after": "60" });

  const sec = await readUserSecret(env, caller.userId, "jama_token");
  if (sec.error) return jsonResponse(502, { error: { type: "upstream_down", message: "Secret store unreachable." } });
  if (sec.missing) return jsonResponse(404, { error: { type: "no_connector", message: "No connector credential saved. Connect the tool first." } });

  const chk = bridgeTargetProblem(url.searchParams.get("target"), sec.meta && sec.meta.baseHost);
  if (chk.error) return jsonResponse(chk.status, { error: { type: "bad_target", message: chk.error } });

  const basic = "Basic " + btoa(String((sec.meta && sec.meta.user) || "") + ":" + sec.secret);
  try {
    const upstream = await fetch(chk.target.toString(), {
      method: "GET", redirect: "manual",
      headers: { authorization: basic, accept: "application/json" },
      signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
    });
    if (upstream.status >= 300 && upstream.status < 400)
      return jsonResponse(502, { error: { type: "upstream_redirect", message: "upstream redirected (" + upstream.status + ") — redirects are not followed" } });
    const text = await upstream.text();
    return new Response(text, { status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...CORS } });
  } catch (e) {
    // Never echo the exception: it can carry the request, and the request carries the header.
    return jsonResponse(502, { error: { type: "upstream_fetch_failed", message: "The connector did not answer." } });
  }
}

// SEC-7 — per-customer request-rate cap, held in Cloudflare KV.
// NULL/0 rate_limit_rpm  → unlimited (founder + comped licenses; skipped entirely).
// A positive N           → at most N requests per rolling minute for that token.
// KV counters are eventually consistent, so a small burst may slip through under
// heavy concurrency — acceptable, since the goal is abuse/DoS/bill-runaway
// prevention, not exact metering (token VOLUME is metered separately + exactly).
//
// S11 / SEC-3 (29 Sep 2026) — IT USED TO FAIL OPEN. If the KV binding was missing, or
// KV errored, every request sailed through with no cap at all, and the comment said so
// as though it were a feature: "a rate-limit outage must never take the paid AI feature
// down." That is backwards for the one control whose whole job is stopping a runaway
// bill. The moment it is most likely to matter — something is wrong — was the moment it
// switched itself off. It now FAILS CLOSED, and only where a cap actually exists:
//
//   no cap on the account (founder, comped, and every customer-hosted install, which
//   meters its own AI) -> the limiter is skipped entirely, exactly as before. Nothing
//   about those accounts changes.
//   a cap on the account + KV missing or erroring -> 503 and an honest "try again
//   shortly", rather than silently unlimited.
//
// The key is a SHA-256 of the token, not the token. Previously the full licence
// credential sat in a KV key, which is somewhere a credential has no business being.
async function _rlKey(prefix, token, minute) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token)));
  let hex = "";
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, "0");
  return `${prefix}:${hex}:${minute}`;
}

async function checkRateLimit(env, token, limitRpm, prefix = "rl") {
  if (!limitRpm || limitRpm <= 0) return { ok: true, unlimited: true };
  if (!env.RATE_KV) {
    // NO BINDING AT ALL is a deployment choice, not a fault, and the two must not be
    // treated the same. A customer running this as a standalone node service has no KV
    // and never will; refusing every request there is not failing closed, it is being
    // broken. So: no binding -> skip, unless the deployment says a limiter is REQUIRED.
    // The Cloudflare deployment says exactly that (RATE_LIMIT_REQUIRED=1 in
    // wrangler.jsonc), so there, a binding that went missing is caught rather than
    // silently reverting to unlimited. A binding that EXISTS and throws is a fault, and
    // that always fails closed, below.
    if (String(env.RATE_LIMIT_REQUIRED || "") === "1") {
      console.warn("[proxy] RATE_LIMIT_REQUIRED is set but the KV binding is missing — failing closed");
      return { ok: false, unavailable: true, limit: limitRpm, reason: "no_kv_binding" };
    }
    return { ok: true, skipped: "no_kv_binding" };
  }
  try {
    const minute = Math.floor(Date.now() / 60000);
    const key = await _rlKey(prefix, token, minute);
    const cur = parseInt((await env.RATE_KV.get(key)) || "0", 10) || 0;
    if (cur >= limitRpm) return { ok: false, limit: limitRpm, used: cur };
    await env.RATE_KV.put(key, String(cur + 1), { expirationTtl: 120 });   // window + slack
    return { ok: true, used: cur + 1, limit: limitRpm };
  } catch (e) {
    console.warn("[proxy] rate-limit KV error — failing closed", String(e));
    return { ok: false, unavailable: true, limit: limitRpm, reason: "kv_error", error: String((e && e.message) || e) };
  }
}

async function consumeTokens(env, token, amount) {
  // Offline-licence (customer-hosted) mode has no Safety Lab database to meter against,
  // and the customer bills their own AI directly — so metering is a no-op there.
  if (env.LICENSE_MODE === "offline" || !env.SUPABASE_URL) return null;
  try {
    const res = await sbFetch(env, "/rpc/consume_tokens", { method: "POST", body: JSON.stringify({ p_token: token, p_amount: amount }) });
    if (!res.ok) { console.warn("[proxy] consume_tokens failed", res.status, await res.text()); return null; }
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (e) { console.warn("[proxy] consume_tokens threw", String(e)); return null; }
}

function streamAnthropicWithUsage(upstreamRes, env, token, fallbackModel, ctx, meter = true) {
  const [toClient, toParse] = upstreamRes.body.tee();
  const accounting = (async () => {
    try {
      const reader = toParse.getReader();
      const dec = new TextDecoder();
      let buf = "", model = fallbackModel, inTok = 0, outTok = 0, cacheW = 0, cacheR = 0;
      const consumeEvent = (raw) => {
        const line = raw.split("\n").find((l) => l.indexOf("data:") === 0);
        if (!line) return;
        let p; try { p = JSON.parse(line.slice(5).trim()); } catch (_) { return; }
        if (p.type === "message_start" && p.message) {
          model = p.message.model || model;
          if (p.message.usage) {
            inTok = p.message.usage.input_tokens || inTok; outTok = p.message.usage.output_tokens || outTok;
            cacheW = p.message.usage.cache_creation_input_tokens || cacheW; cacheR = p.message.usage.cache_read_input_tokens || cacheR;
          }
        } else if (p.type === "message_delta" && p.usage && p.usage.output_tokens != null) { outTok = p.usage.output_tokens; }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) { consumeEvent(buf.slice(0, idx)); buf = buf.slice(idx + 2); }
      }
      if (buf.trim()) consumeEvent(buf);
      const burned = weightedTokens(model, inTok, outTok, cacheW, cacheR);
      if (meter && burned > 0) await consumeTokens(env, token, burned);
    } catch (e) { console.warn("[proxy] stream usage accounting failed", String(e)); }
  })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(accounting);
  return new Response(toClient, { status: upstreamRes.status, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", ...CORS } });
}

// SEC-8: the single place that decides whether a request may touch public
// Anthropic. `itar` here is the ALREADY-RESOLVED effective flag (license OR
// header) — an ITAR request can never reach the public upstream.
async function handleAnthropic(request, env, token, itar, ctx, caller) {
  // S8: which key, and whether Safety Lab pays. A licence caller uses Safety Lab's key and
  // is metered. A JWT caller brings their own key from the vault and is not metered at all.
  let apiKey = env.ANTHROPIC_API_KEY, meter = true;
  if (caller && caller.kind === "user") {
    const sec = await readUserSecret(env, caller.userId, "anthropic_key");
    if (sec.error) return jsonResponse(502, { error: { type: "upstream_down", message: "Secret store unreachable." } });
    if (sec.missing) return jsonResponse(402, { error: { type: "no_byo_key", message: "No AI key saved for this account. Add your Anthropic key under Advanced, or upgrade to a licence." } });
    apiKey = sec.secret; meter = false;
  }
  if (itar) {
    // Domestic-only (US-sovereign) is the ONLY permitted path for ITAR traffic.
    const provider = itarProvider(env);
    if (!provider) {
      return jsonResponse(503, { error: { type: "itar_unconfigured",
        message: "This account is ITAR-controlled and no domestic-only (US-sovereign) inference backend is configured. The request was refused rather than routed to a public-cloud model. Contact support@safetylabaero.com." } });
    }
    let bodyObj;
    try { bodyObj = JSON.parse(await request.text()); }
    catch (_) { return jsonResponse(400, { error: { type: "bad_request", message: "Body must be JSON." } }); }
    try {
      const out = await sovereignChat(bodyObj, env, provider);
      if (meter && out.burned > 0) await consumeTokens(env, token, out.burned);
      return jsonResponse(out.status, out.json);
    } catch (e) {
      // ITAR safety guarantee: on ANY error we refuse — never fall back to public.
      return jsonResponse(502, { error: { type: "sovereign_error",
        message: "Domestic-only inference failed; request refused (never routed to public cloud)." } });
    }
  }
  let bodyText;
  try { bodyText = await request.text(); } catch (_) { return jsonResponse(400, { error: { type: "bad_request", message: "Body unreadable." } }); }
  let bodyObj;
  try { bodyObj = JSON.parse(bodyText); } catch (_) { return jsonResponse(400, { error: { type: "bad_request", message: "Body must be JSON." } }); }
  const upstreamRes = await fetch(ANTHROPIC_UPSTREAM, {
    method: "POST",
    // 16 Sep 2026: Anthropic refuses an org-level key unless the request names a workspace
    // ("This API key is not scoped to a workspace..."). A key created INSIDE a workspace needs
    // nothing; for an org-level key the customer sets ANTHROPIC_WORKSPACE_ID (not a secret).
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01",
               ...(env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": String(env.ANTHROPIC_WORKSPACE_ID).trim() } : {}) },
    body: bodyText,
  });
  const wantStream = bodyObj && bodyObj.stream === true;
  const upstreamCt = upstreamRes.headers.get("content-type") || "";
  if (wantStream && upstreamRes.ok && upstreamRes.body && upstreamCt.indexOf("text/event-stream") !== -1) {
    return streamAnthropicWithUsage(upstreamRes, env, token, bodyObj.model || "claude-sonnet-4-6", ctx, meter);
  }
  const text = await upstreamRes.text();
  if (upstreamRes.ok) {
    try {
      const j = JSON.parse(text);
      const u = j && j.usage;
      if (u && meter) { const model = j.model || bodyObj.model || "claude-sonnet-4-6"; const burned = weightedTokens(model, u.input_tokens, u.output_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens); if (burned > 0) await consumeTokens(env, token, burned); }
    } catch (_) {}
  }
  return passthroughResponse(upstreamRes.status, text);
}

async function handleVoyage(request, env, token, itar, caller) {
  let apiKey = env.VOYAGE_API_KEY, meter = true;
  if (caller && caller.kind === "user") {
    const sec = await readUserSecret(env, caller.userId, "voyage_key");
    if (sec.error) return jsonResponse(502, { error: { type: "upstream_down", message: "Secret store unreachable." } });
    if (sec.missing) return jsonResponse(402, { error: { type: "no_byo_key", message: "No embeddings key saved for this account. Add your Voyage key under Advanced, or upgrade to a licence." } });
    apiKey = sec.secret; meter = false;
  }
  if (itar) {
    const provider = itarProvider(env);
    if (!provider) {
      return jsonResponse(503, { error: { type: "itar_unconfigured",
        message: "This account is ITAR-controlled and no domestic-only (US-sovereign) embeddings backend is configured. Request refused, not routed to public cloud." } });
    }
    let bodyObj;
    try { bodyObj = JSON.parse(await request.text()); }
    catch (_) { return jsonResponse(400, { error: { type: "bad_request", message: "Body must be JSON." } }); }
    try {
      const out = await sovereignEmbed(bodyObj, env, provider);
      if (meter && out.burned > 0) await consumeTokens(env, token, out.burned);
      return jsonResponse(out.status, out.json);
    } catch (e) {
      return jsonResponse(502, { error: { type: "sovereign_error",
        message: "Domestic-only embeddings failed; request refused (never routed to public cloud)." } });
    }
  }
  let bodyText;
  try { bodyText = await request.text(); } catch (_) { return jsonResponse(400, { error: { type: "bad_request", message: "Body unreadable." } }); }
  let bodyObj;
  try { bodyObj = JSON.parse(bodyText); } catch (_) { return jsonResponse(400, { error: { type: "bad_request", message: "Body must be JSON." } }); }
  const upstreamRes = await fetch(VOYAGE_UPSTREAM, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: bodyText,
  });
  const text = await upstreamRes.text();
  if (upstreamRes.ok) {
    try { const j = JSON.parse(text); const tokensIn = (j && j.usage && j.usage.total_tokens) || 0; const model = bodyObj.model || "voyage-3-large"; const burned = weightedTokens(model, tokensIn, 0); if (meter && burned > 0) await consumeTokens(env, token, burned); } catch (_) {}
  }
  return passthroughResponse(upstreamRes.status, text);
}

// ============================================================================
// Phase 0 (Teams/ANEM plan, 12 Aug 2026) — integrity-notification fan-out.
// The browser never talks to a customer webhook directly: it POSTs here with
// its license Bearer (same auth lane as AI), and THIS is the only place that
// may dial out — to an allowlisted Teams webhook host and/or Resend email.
// No open relay: an arbitrary URL in the payload is refused, not fetched.
// ============================================================================
const NOTIFY_WEBHOOK_HOSTS = [".webhook.office.com", ".logic.azure.com"];

function notifyHostAllowed(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl)); } catch (_) { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  // suffix match on ".domain" only — "webhook.office.com.evil.com" must fail.
  return NOTIFY_WEBHOOK_HOSTS.some((suf) => h.endsWith(suf) && h.length > suf.length);
}

function notifyAdaptiveCard(body) {
  const rows = (body.worsened || []).slice(0, 20).map((x) => ({
    type: "TextBlock", wrap: true, spacing: "Small", size: "Small",
    text: `**${x.kind || "issue"}** · ${x.where || ""} · \`${x.ref || ""}\` — ${x.reason || ""}`,
  }));
  const c = body.counts || {};
  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard", version: "1.4",
        body: [
          { type: "TextBlock", weight: "Bolder", size: "Medium",
            text: body.test ? "Safety Lab Aero — test notification" : "Safety Lab Aero — project integrity worsened" },
          { type: "TextBlock", spacing: "None", isSubtle: true, size: "Small",
            text: `Project: ${body.project || "Untitled"} · stale ${c.stale || 0} · dangling ${c.dangling || 0} · compromised ${c.compromised || 0}` },
          ...(body.test ? [{ type: "TextBlock", wrap: true, size: "Small",
            text: "The webhook is wired correctly. Real notifications fire only when this project's integrity worsens." }] : rows),
          { type: "TextBlock", spacing: "Small", size: "Small", isSubtle: true, wrap: true,
            text: "Open Safety Lab → Traceability & Evidence → Thread Integrity to disposition." },
        ],
      },
    }],
  };
}

async function handleNotify(request, env, token) {
  let body;
  try { body = JSON.parse(await request.text()); }
  catch (_) { return jsonResponse(400, { error: { type: "bad_request", message: "Body must be JSON." } }); }
  const webhookUrl = String(body.webhookUrl || "").trim();
  const email = String(body.email || "").trim();
  const pairingCode = String(body.pairingCode || "").trim();
  if (!webhookUrl && !email && !pairingCode) {
    return jsonResponse(400, { error: { type: "bad_request", message: "No destination: provide a pairing code, webhookUrl and/or email." } });
  }
  if (webhookUrl && !notifyHostAllowed(webhookUrl)) {
    return jsonResponse(400, { error: { type: "webhook_not_allowed",
      message: "Webhook host not allowed. Use a Teams Workflows URL (*.webhook.office.com or *.logic.azure.com)." } });
  }
  const out = { ok: false, teams: null, email: null, bot: null };

  // PAIRING CODE — the Safety Lab Aero bot delivers it. Preferred over a raw
  // webhook: the customer pastes an opaque code rather than a Microsoft URL,
  // the message arrives from the bot's own identity, and revocation is
  // removing the bot rather than editing a project file. The bot worker is
  // reached over a shared secret; the customer's licence was already checked
  // upstream by the /v1/ai/* auth pipeline.
  if (pairingCode) {
    if (!env.BOT_NOTIFY_URL || !env.BOT_INTERNAL_SECRET) {
      out.bot = "unconfigured";
    } else {
      try {
        const r = await fetch(env.BOT_NOTIFY_URL, {
          method: "POST",
          headers: { "content-type": "application/json", "x-sl-internal": env.BOT_INTERNAL_SECRET },
          body: JSON.stringify({ ...body, pairingCode }),
        });
        out.bot = r.status;
        if (!r.ok) out.bot_detail = (await r.text()).slice(0, 200);
      } catch (e) { out.bot = "error: " + String((e && e.message) || e); }
    }
  }
  if (webhookUrl) {
    try {
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(notifyAdaptiveCard(body)),
      });
      out.teams = r.status;
    } catch (e) { out.teams = "error: " + String((e && e.message) || e); }
  }
  if (email && env.RESEND_API_KEY) {
    try {
      const c = body.counts || {};
      const lines = (body.worsened || []).slice(0, 40)
        .map((x) => `<li><b>${x.kind || "issue"}</b> · ${x.where || ""} · <code>${x.ref || ""}</code> — ${x.reason || ""}</li>`).join("");
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Safety Lab Aero Alerts <alerts@send.safetylabaero.com>",
          to: [email],
          subject: body.test ? "Safety Lab Aero — test notification"
            : `Integrity worsened — ${body.project || "Untitled"} (${(body.worsened || []).length} new)`,
          html: `<p><b>${body.test ? "Test notification — the email rail is wired correctly." : "Project integrity worsened."}</b></p>` +
            `<p>Project: ${body.project || "Untitled"} · stale ${c.stale || 0} · dangling ${c.dangling || 0} · compromised ${c.compromised || 0}</p>` +
            (body.test ? "" : `<ul>${lines}</ul>`) +
            `<p style="color:#667">Open Safety Lab → Traceability &amp; Evidence → Thread Integrity to disposition. Notifications are per-project and configured in the tool.</p>`,
        }),
      });
      out.email = r.status;
    } catch (e) { out.email = "error: " + String((e && e.message) || e); }
  } else if (email && !env.RESEND_API_KEY) {
    out.email = "unconfigured";
  }
  out.ok = (out.teams === 200 || out.teams === 202 || out.teams === 201) ||
           (out.email === 200) || (out.bot === 200);
  return jsonResponse(200, out);
}

function handleUsage(licenseCheck) {
  const { license, used, remaining } = licenseCheck;
  return jsonResponse(200, {
    plan: license.plan,
    monthly_allowance: Number(license.monthly_allowance),
    tokens_used: used,
    remaining,
    reset_month: license.reset_month,
    expires_at: license.expires_at,
    itar_required: license.itar_required === true,   // surfaced so the client can show the badge
  });
}

// ============================================================================
// OFFLINE-LICENCE MODE (customer-hosted). When env.LICENSE_MODE === "offline"
// the proxy is a customer's OWN copy: there is no Safety Lab license_tokens table
// to look a token up in. The Bearer credential is the SIGNED LICENCE BLOB itself
// (base64url(payload).base64url(sig), ES256 / P-256). We verify the signature
// against the baked-in public key(s) exactly the way the app's slab_license.js
// verifier does, check the time window, and read the tier. No metering, no DB.
// Same code runs on Cloudflare Workers and standalone Node (Web Crypto + atob are
// globals in both). LICENSE_PUBLIC_KEYS is a JSON array of the JWKs (rotation-ready).
// ============================================================================
function _b64urlBytes(str) {
  str = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function _offlineKeys(env) {
  // No caching: an auth module must never carry keys across configuration.
  try { const k = JSON.parse(env.LICENSE_PUBLIC_KEYS || "[]"); return Array.isArray(k) ? k : []; }
  catch (_) { return []; }
}
async function verifyOfflineLicense(env, blob) {
  try {
    const dot = blob.indexOf(".");
    if (dot < 1) return { error: "invalid_token" };
    const payloadB64 = blob.slice(0, dot), sigB64 = blob.slice(dot + 1);
    let payload;
    try { payload = JSON.parse(new TextDecoder().decode(_b64urlBytes(payloadB64))); }
    catch (_) { return { error: "invalid_token" }; }
    if (payload.v !== 1 || payload.alg !== "ES256" || payload.issuer !== "safetylabaero") return { error: "invalid_token" };
    const keys = _offlineKeys(env);
    if (!keys.length) return { error: "invalid_token" };   // no key configured -> refuse (never fail open on auth)
    const sig = _b64urlBytes(sigB64), signed = new TextEncoder().encode(payloadB64);
    const ordered = keys.slice().sort((a, b) => (a.kid === payload.kid ? -1 : 0) - (b.kid === payload.kid ? -1 : 0));
    let ok = false;
    for (const k of ordered) {
      try {
        const ck = await crypto.subtle.importKey("jwk", { kty: k.kty, crv: k.crv, x: k.x, y: k.y, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        if (await crypto.subtle.verify({ name: "ECDSA", hash: { name: "SHA-256" } }, ck, sig, signed)) { ok = true; break; }
      } catch (_) {}
    }
    if (!ok) return { error: "invalid_token" };
    const now = Date.now(), nb = Date.parse(payload.notBefore), na = Date.parse(payload.notAfter);
    if (nb && now < nb) return { error: "invalid_token" };
    if (na && now > na) return { error: "expired" };
    const itar = payload.itar === true || (Array.isArray(payload.features) && payload.features.indexOf("itar") >= 0);
    return { token: payload.id || "offline", license: { plan: payload.tier || "enterprise", itar_required: itar }, used: 0, remaining: null, itarRequired: itar, rateLimitRpm: 0, exhausted: false };
  } catch (_) { return { error: "invalid_token" }; }
}

export { weightedTokens, MODEL_TOKEN_WEIGHTS };   // metering, testable in isolation (test/cache_metering.test.mjs)

// The router. Everything it returns goes through withCors() at the boundary below, so no
// handler has to know or care what the calling origin was.
async function routeRequest(request, env, ctx) {
  {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/v1/ai/health") {
        return jsonResponse(200, { ok: true, service: "safety-lab-proxy", ts: Date.now() });
      }
      if (!url.pathname.startsWith("/v1/ai/")) {
        return jsonResponse(404, { error: { type: "not_found", message: "Unknown endpoint." } });
      }
      const auth = request.headers.get("authorization") || "";
      if (!auth.startsWith("Bearer ")) return jsonResponse(401, { error: { type: "unauthorized", message: "Missing Bearer token." } });
      const token = auth.slice(7).trim();
      if (!token || token.length < 16) return jsonResponse(401, { error: { type: "unauthorized", message: "Malformed token." } });

      // S8: who is calling. Branch on the token's SHAPE — a 64-hex licence and a three-part
      // JWT cannot be confused — so a JWT never costs a licence lookup and vice versa.
      let check, caller;
      if (looksLikeJwt(token)) {
        const v = await verifyUserJwt(env, token);
        if (v.error === "supabase_unreachable") return jsonResponse(502, { error: { type: "upstream_down", message: "Auth backend unreachable." } });
        if (v.error) return jsonResponse(401, { error: { type: "invalid_token", message: "Token not recognized." } });
        caller = { kind: "user", userId: v.userId, token };
        // No licence: no allowance to exhaust, no licence-level ITAR flag (the header can still
        // raise it), and a fixed request cap so the relay cannot be hammered on someone's behalf.
        check = { license: { plan: "byo", user_id: v.userId }, used: 0, remaining: null, exhausted: false, itarRequired: false, rateLimitRpm: 60 };
      } else {
        check = env.LICENSE_MODE === "offline"
          ? await verifyOfflineLicense(env, token)
          : await lookupToken(env, token);
        if (check.error === "supabase_unreachable") return jsonResponse(502, { error: { type: "upstream_down", message: "Auth backend unreachable." } });
        if (check.error === "invalid_token") return jsonResponse(401, { error: { type: "invalid_token", message: "Token not recognized." } });
        if (check.error === "expired") return jsonResponse(401, { error: { type: "expired_token", message: "License expired." } });
        if (check.exhausted) {
          return jsonResponse(402, { error: { type: "allowance_exhausted", message: "Monthly token allowance exhausted. Resets on the 1st of next month." }, plan: check.license.plan, remaining: 0 });
        }
        caller = { kind: "license", userId: (check.license && check.license.user_id) || null, token };
      }

      // SEC-7 — per-customer request-rate cap (skipped for unlimited licenses).
      // Applies only to the two billable upstreams, not the /usage read.
      const isUpstream = request.method === "POST" &&
        (url.pathname === "/v1/ai/anthropic/messages" || url.pathname === "/v1/ai/voyage/embeddings");
      if (isUpstream) {
        const rl = await checkRateLimit(env, token, check.rateLimitRpm);
        if (!rl.ok && rl.unavailable) {
          // SEC-3: the cap could not be enforced. Say so rather than pretending there is none.
          return jsonResponse(503,
            { error: { type: "rate_limit_unavailable", message: "The request-rate limiter is unavailable, so this request cannot be allowed through. Retry shortly." }, retry_after: 30 },
            { "retry-after": "30" });
        }
        if (!rl.ok) {
          return jsonResponse(429,
            { error: { type: "rate_limited", message: `Request rate limit (${rl.limit}/min) exceeded for this account. Retry shortly.` }, limit: rl.limit, retry_after: 60 },
            { "retry-after": "60" });
        }
      }

      // Phase 0 — integrity notifications: OWN hard cap (6/min per token, KV),
      // separate from the AI rpm so a chatty sentinel can never starve the AI
      // lane and a runaway loop can never spam a customer's channel.
      if (request.method === "POST" && url.pathname === "/v1/ai/notify/integrity") {
        const rl = await checkRateLimit(env, token, 6, "ntf");
        if (!rl.ok && rl.unavailable) {
          return jsonResponse(503,
            { error: { type: "rate_limit_unavailable", message: "The notification rate limiter is unavailable, so this request cannot be allowed through. Retry shortly." }, retry_after: 30 },
            { "retry-after": "30" });
        }
        if (!rl.ok) {
          return jsonResponse(429,
            { error: { type: "rate_limited", message: "Notification rate limit (6/min) exceeded. Retry shortly." }, retry_after: 60 },
            { "retry-after": "60" });
        }
        return handleNotify(request, env, token);
      }

      // SEC-8 — effective ITAR flag: server truth OR client escalation.
      // The license flag can force ITAR on; the header can only add to it, never
      // remove it. A controlled account can never be downgraded by the browser.
      const headerItar = request.headers.get("x-safetylab-itar") === "1";
      const itar = check.itarRequired || headerItar;

      if (request.method === "GET" && url.pathname === "/v1/ai/usage") return handleUsage(check);
      if (request.method === "GET" && url.pathname === "/v1/ai/bridge") return handleBridge(request, env, caller, url);
      if (request.method === "POST" && url.pathname === "/v1/ai/anthropic/messages") return handleAnthropic(request, env, token, itar, ctx, caller);
      if (request.method === "POST" && url.pathname === "/v1/ai/voyage/embeddings") return handleVoyage(request, env, token, itar, caller);

      return jsonResponse(404, { error: { type: "not_found", message: "Unknown endpoint." } });
    } catch (e) {
      return jsonResponse(502, { error: { type: "proxy_exception", message: String((e && e.message) || e) } });
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("origin");
    const verdict = originVerdict(origin, env);
    // S11 / SEC-3 — an unknown BROWSER origin is refused here, before any licence lookup,
    // any upstream call and any metering, so a hostile page cannot burn an account's
    // allowance even without being able to read the answers. A request with no Origin at
    // all is not a browser cross-origin call and carries on as normal.
    if (verdict === "deny") {
      return withCors(jsonResponse(403, { error: { type: "origin_not_allowed", message: "This origin is not allowed to call this proxy." } }), verdict, origin);
    }
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), verdict, origin);
    return withCors(await routeRequest(request, env, ctx), verdict, origin);
  },
};

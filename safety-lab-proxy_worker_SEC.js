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
// ============================================================================

const ANTHROPIC_UPSTREAM = "https://api.anthropic.com/v1/messages";
const VOYAGE_UPSTREAM = "https://api.voyageai.com/v1/embeddings";

const MODEL_TOKEN_WEIGHTS = {
  "claude-opus-4-6": 5,
  "claude-sonnet-4-6": 1,
  "claude-haiku-4-5-20251001": 0.3,
  "voyage-3-large": 0.05,
  "voyage-3": 0.02,
  "voyage-code-3": 0.05,
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,x-safetylab-itar,x-safetylab-feature",
  "access-control-max-age": "86400",
};

function jsonResponse(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS, ...extra } });
}
function passthroughResponse(status, text) {
  return new Response(text, { status, headers: { "content-type": "application/json", ...CORS } });
}
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function weightedTokens(model, tokensIn, tokensOut) {
  const w = MODEL_TOKEN_WEIGHTS[model] || 1;
  return Math.max(0, Math.round(((tokensIn || 0) + (tokensOut || 0)) * w));
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

// SEC-7 — per-customer request-rate cap, held in Cloudflare KV.
// NULL/0 rate_limit_rpm  → unlimited (founder + comped licenses; skipped entirely).
// A positive N           → at most N requests per rolling minute for that token.
// KV counters are eventually consistent, so a small burst may slip through under
// heavy concurrency — acceptable, since the goal is abuse/DoS/bill-runaway
// prevention, not exact metering (token VOLUME is metered separately + exactly).
// Fails OPEN: if the KV binding is missing or errors, the request proceeds — a
// rate-limit outage must never take the paid AI feature down.
async function checkRateLimit(env, token, limitRpm) {
  if (!limitRpm || limitRpm <= 0) return { ok: true, unlimited: true };
  if (!env.RATE_KV) return { ok: true, skipped: "no_kv_binding" };
  try {
    const minute = Math.floor(Date.now() / 60000);
    const key = `rl:${token}:${minute}`;
    const cur = parseInt((await env.RATE_KV.get(key)) || "0", 10) || 0;
    if (cur >= limitRpm) return { ok: false, limit: limitRpm, used: cur };
    await env.RATE_KV.put(key, String(cur + 1), { expirationTtl: 120 });   // window + slack
    return { ok: true, used: cur + 1, limit: limitRpm };
  } catch (e) {
    console.warn("[proxy] rate-limit KV error (failing open)", String(e));
    return { ok: true, error: String(e && e.message || e) };
  }
}

async function consumeTokens(env, token, amount) {
  try {
    const res = await sbFetch(env, "/rpc/consume_tokens", { method: "POST", body: JSON.stringify({ p_token: token, p_amount: amount }) });
    if (!res.ok) { console.warn("[proxy] consume_tokens failed", res.status, await res.text()); return null; }
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (e) { console.warn("[proxy] consume_tokens threw", String(e)); return null; }
}

function streamAnthropicWithUsage(upstreamRes, env, token, fallbackModel, ctx) {
  const [toClient, toParse] = upstreamRes.body.tee();
  const accounting = (async () => {
    try {
      const reader = toParse.getReader();
      const dec = new TextDecoder();
      let buf = "", model = fallbackModel, inTok = 0, outTok = 0;
      const consumeEvent = (raw) => {
        const line = raw.split("\n").find((l) => l.indexOf("data:") === 0);
        if (!line) return;
        let p; try { p = JSON.parse(line.slice(5).trim()); } catch (_) { return; }
        if (p.type === "message_start" && p.message) {
          model = p.message.model || model;
          if (p.message.usage) { inTok = p.message.usage.input_tokens || inTok; outTok = p.message.usage.output_tokens || outTok; }
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
      const burned = weightedTokens(model, inTok, outTok);
      if (burned > 0) await consumeTokens(env, token, burned);
    } catch (e) { console.warn("[proxy] stream usage accounting failed", String(e)); }
  })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(accounting);
  return new Response(toClient, { status: upstreamRes.status, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", ...CORS } });
}

// SEC-8: the single place that decides whether a request may touch public
// Anthropic. `itar` here is the ALREADY-RESOLVED effective flag (license OR
// header) — an ITAR request can never reach the public upstream.
async function handleAnthropic(request, env, token, itar, ctx) {
  if (itar) {
    // Domestic-only (Azure Gov) is the ONLY permitted path for ITAR traffic.
    // It is not yet provisioned, so we REFUSE — we do not fall back to public.
    if (!env.AZURE_OPENAI_KEY || !env.AZURE_OPENAI_ENDPOINT) {
      return jsonResponse(503, { error: { type: "itar_unconfigured",
        message: "This account is ITAR-controlled. A domestic-only (Azure Gov) inference backend is required and is not yet provisioned — the request was refused rather than routed to a public-cloud model. Contact support@safetylabaero.com." } });
    }
    // TODO (Waqas infra): route to env.AZURE_OPENAI_ENDPOINT with AZURE_OPENAI_KEY.
    return jsonResponse(503, { error: { type: "itar_not_implemented",
      message: "ITAR (Azure Gov) routing is provisioned but not yet wired. Request refused — not routed to public cloud." } });
  }
  let bodyText;
  try { bodyText = await request.text(); } catch (_) { return jsonResponse(400, { error: { type: "bad_request", message: "Body unreadable." } }); }
  let bodyObj;
  try { bodyObj = JSON.parse(bodyText); } catch (_) { return jsonResponse(400, { error: { type: "bad_request", message: "Body must be JSON." } }); }
  const upstreamRes = await fetch(ANTHROPIC_UPSTREAM, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: bodyText,
  });
  const wantStream = bodyObj && bodyObj.stream === true;
  const upstreamCt = upstreamRes.headers.get("content-type") || "";
  if (wantStream && upstreamRes.ok && upstreamRes.body && upstreamCt.indexOf("text/event-stream") !== -1) {
    return streamAnthropicWithUsage(upstreamRes, env, token, bodyObj.model || "claude-sonnet-4-6", ctx);
  }
  const text = await upstreamRes.text();
  if (upstreamRes.ok) {
    try {
      const j = JSON.parse(text);
      const u = j && j.usage;
      if (u) { const model = j.model || bodyObj.model || "claude-sonnet-4-6"; const burned = weightedTokens(model, u.input_tokens, u.output_tokens); if (burned > 0) await consumeTokens(env, token, burned); }
    } catch (_) {}
  }
  return passthroughResponse(upstreamRes.status, text);
}

async function handleVoyage(request, env, token, itar) {
  if (itar) {
    return jsonResponse(503, { error: { type: "itar_unconfigured",
      message: "This account is ITAR-controlled. Embeddings require a domestic-only backend (not yet provisioned) — request refused, not routed to public cloud." } });
  }
  let bodyText;
  try { bodyText = await request.text(); } catch (_) { return jsonResponse(400, { error: { type: "bad_request", message: "Body unreadable." } }); }
  let bodyObj;
  try { bodyObj = JSON.parse(bodyText); } catch (_) { return jsonResponse(400, { error: { type: "bad_request", message: "Body must be JSON." } }); }
  const upstreamRes = await fetch(VOYAGE_UPSTREAM, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.VOYAGE_API_KEY}` },
    body: bodyText,
  });
  const text = await upstreamRes.text();
  if (upstreamRes.ok) {
    try { const j = JSON.parse(text); const tokensIn = (j && j.usage && j.usage.total_tokens) || 0; const model = bodyObj.model || "voyage-3-large"; const burned = weightedTokens(model, tokensIn, 0); if (burned > 0) await consumeTokens(env, token, burned); } catch (_) {}
  }
  return passthroughResponse(upstreamRes.status, text);
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

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
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

      const check = await lookupToken(env, token);
      if (check.error === "supabase_unreachable") return jsonResponse(502, { error: { type: "upstream_down", message: "Auth backend unreachable." } });
      if (check.error === "invalid_token") return jsonResponse(401, { error: { type: "invalid_token", message: "Token not recognized." } });
      if (check.error === "expired") return jsonResponse(401, { error: { type: "expired_token", message: "License expired." } });
      if (check.exhausted) {
        return jsonResponse(402, { error: { type: "allowance_exhausted", message: "Monthly token allowance exhausted. Resets on the 1st of next month." }, plan: check.license.plan, remaining: 0 });
      }

      // SEC-7 — per-customer request-rate cap (skipped for unlimited licenses).
      // Applies only to the two billable upstreams, not the /usage read.
      const isUpstream = request.method === "POST" &&
        (url.pathname === "/v1/ai/anthropic/messages" || url.pathname === "/v1/ai/voyage/embeddings");
      if (isUpstream) {
        const rl = await checkRateLimit(env, token, check.rateLimitRpm);
        if (!rl.ok) {
          return jsonResponse(429,
            { error: { type: "rate_limited", message: `Request rate limit (${rl.limit}/min) exceeded for this account. Retry shortly.` }, limit: rl.limit, retry_after: 60 },
            { "retry-after": "60" });
        }
      }

      // SEC-8 — effective ITAR flag: server truth OR client escalation.
      // The license flag can force ITAR on; the header can only add to it, never
      // remove it. A controlled account can never be downgraded by the browser.
      const headerItar = request.headers.get("x-safetylab-itar") === "1";
      const itar = check.itarRequired || headerItar;

      if (request.method === "GET" && url.pathname === "/v1/ai/usage") return handleUsage(check);
      if (request.method === "POST" && url.pathname === "/v1/ai/anthropic/messages") return handleAnthropic(request, env, token, itar, ctx);
      if (request.method === "POST" && url.pathname === "/v1/ai/voyage/embeddings") return handleVoyage(request, env, token, itar);

      return jsonResponse(404, { error: { type: "not_found", message: "Unknown endpoint." } });
    } catch (e) {
      return jsonResponse(502, { error: { type: "proxy_exception", message: String((e && e.message) || e) } });
    }
  },
};

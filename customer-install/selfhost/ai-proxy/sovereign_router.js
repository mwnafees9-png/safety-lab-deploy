// ============================================================================
// sovereign_router.js — ITAR domestic-only inference router
// ----------------------------------------------------------------------------
// Routes an ITAR-flagged AI request to a US-sovereign inference backend instead
// of refusing it. Configurable per deployment (both providers supported):
//
//   · "bedrock" — AWS Bedrock in GovCloud (us-gov-west-1). Serves the SAME
//                 Claude models as the public path, via SigV4-signed InvokeModel.
//                 Request/response are already Anthropic-shaped → near-identity.
//   · "azure"   — Azure OpenAI Government. Serves GPT models; this module
//                 translates Anthropic Messages <-> OpenAI Chat Completions so
//                 the browser client (which speaks Anthropic format) is unchanged.
//
// SAFETY CONTRACT (the whole reason this exists):
//   · If NO sovereign backend is configured, itarProvider() returns null and the
//     caller REFUSES — it must never fall back to public cloud.
//   · On ANY upstream error here, we surface the error; the caller refuses.
//     Controlled data is never silently rerouted to a public model.
//   · This module holds NO public-cloud fallback path by construction.
//
// Config (Cloudflare Worker secrets / vars):
//   ITAR_PROVIDER            "bedrock" | "azure"   (optional; auto-detected from
//                            which credentials are present if unset)
//   -- Bedrock GovCloud --
//   AWS_BEDROCK_REGION       default "us-gov-west-1"
//   AWS_ACCESS_KEY_ID
//   AWS_SECRET_ACCESS_KEY
//   AWS_SESSION_TOKEN        (optional; for temporary STS credentials)
//   AWS_BEDROCK_MODEL_ID     e.g. "anthropic.claude-3-5-sonnet-20240620-v1:0"
//   AWS_BEDROCK_EMBED_MODEL_ID  default "amazon.titan-embed-text-v2:0"
//   -- Azure OpenAI Gov --
//   AZURE_OPENAI_ENDPOINT    e.g. "https://<res>.openai.azure.us"
//   AZURE_OPENAI_KEY
//   AZURE_OPENAI_DEPLOYMENT        chat deployment name
//   AZURE_OPENAI_EMBED_DEPLOYMENT  embeddings deployment name
//   AZURE_OPENAI_API_VERSION       default "2024-06-01"
// ============================================================================

// ---- provider selection -----------------------------------------------------
export function itarProvider(env) {
  const explicit = String(env.ITAR_PROVIDER || "").toLowerCase();
  if (explicit === "bedrock" || explicit === "azure") return explicit;
  // Auto-detect from whichever credential set is present.
  if (env.AWS_BEDROCK_MODEL_ID && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) return "bedrock";
  if (env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_KEY && env.AZURE_OPENAI_DEPLOYMENT) return "azure";
  return null; // not configured → caller must refuse
}

// ---- crypto helpers (Web Crypto — available in Workers and Node ≥20) ---------
function bytes(s) { return new TextEncoder().encode(s); }
function toHex(u8) { return [...u8].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", bytes(str));
  return toHex(new Uint8Array(buf));
}
async function hmac(keyBytes, msg) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, typeof msg === "string" ? bytes(msg) : msg);
  return new Uint8Array(sig);
}
// AWS SigV4 signing-key derivation. Exported for offline test against AWS vectors.
export async function deriveSigningKey(secret, dateStamp, region, service) {
  let k = bytes("AWS4" + secret);
  k = await hmac(k, dateStamp);
  k = await hmac(k, region);
  k = await hmac(k, service);
  k = await hmac(k, "aws4_request");
  return k;
}

// ---- AWS SigV4 signed POST ---------------------------------------------------
async function sigv4Fetch(env, { region, service, host, path, bodyStr }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(bodyStr);

  // Canonical headers must be sorted by lowercased name.
  const headerMap = {
    "content-type": "application/json",
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (env.AWS_SESSION_TOKEN) headerMap["x-amz-security-token"] = env.AWS_SESSION_TOKEN;
  const sortedNames = Object.keys(headerMap).sort();
  const canonicalHeaders = sortedNames.map((n) => `${n}:${headerMap[n]}\n`).join("");
  const signedHeaders = sortedNames.join(";");

  const canonicalRequest = ["POST", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signingKey = await deriveSigningKey(env.AWS_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = { ...headerMap, authorization };
  delete headers.host; // fetch sets Host itself
  return fetch(`https://${host}${path}`, { method: "POST", headers, body: bodyStr });
}

// ---- Anthropic <-> OpenAI format adapters (for the Azure/GPT path) -----------
function flattenContent(c) {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x) => (typeof x === "string" ? x : x && x.type === "text" ? x.text : "")).join("");
  return "";
}
export function anthropicToOpenAIChat(b) {
  const messages = [];
  if (b.system) messages.push({ role: "system", content: flattenContent(b.system) });
  for (const m of b.messages || []) messages.push({ role: m.role, content: flattenContent(m.content) });
  const out = { messages, max_tokens: b.max_tokens || 1024 };
  if (b.temperature != null) out.temperature = b.temperature;
  if (b.top_p != null) out.top_p = b.top_p;
  if (Array.isArray(b.stop_sequences)) out.stop = b.stop_sequences;
  return out;
}
export function openAIToAnthropicResponse(r, fallbackModel) {
  const choice = (r.choices && r.choices[0]) || {};
  const text = (choice.message && choice.message.content) || "";
  const fr = choice.finish_reason;
  const stop_reason = fr === "length" ? "max_tokens" : fr === "content_filter" ? "stop_sequence" : "end_turn";
  const u = r.usage || {};
  return {
    id: r.id || "msg_" + Date.now(),
    type: "message",
    role: "assistant",
    model: r.model || fallbackModel,
    content: [{ type: "text", text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 },
  };
}

// ---- chat completion (returns Anthropic-shaped JSON + weighted token burn) ----
// NOTE: ITAR path is non-streaming in v1 (Bedrock streams use AWS event-stream
// framing, not SSE). The client falls back to a single JSON message cleanly.
export async function sovereignChat(bodyObj, env, provider) {
  if (provider === "bedrock") {
    const region = env.AWS_BEDROCK_REGION || "us-gov-west-1";
    const modelId = env.AWS_BEDROCK_MODEL_ID;
    const payload = { ...bodyObj };
    delete payload.model;
    delete payload.stream;
    payload.anthropic_version = "bedrock-2023-05-31";
    if (payload.max_tokens == null) payload.max_tokens = 1024;
    const bodyStr = JSON.stringify(payload);
    const res = await sigv4Fetch(env, {
      region,
      service: "bedrock",
      host: `bedrock-runtime.${region}.amazonaws.com`,
      path: `/model/${encodeURIComponent(modelId)}/invoke`,
      bodyStr,
    });
    const text = await res.text();
    if (!res.ok) {
      return { status: res.status, json: { type: "error", error: { type: "sovereign_upstream", message: `Bedrock GovCloud error: ${text.slice(0, 300)}` } }, burned: 0 };
    }
    const j = JSON.parse(text);
    const u = j.usage || {};
    const burned = Math.max(0, Math.round((u.input_tokens || 0) + (u.output_tokens || 0)));
    return { status: 200, json: j, burned };
  }

  if (provider === "azure") {
    const base = String(env.AZURE_OPENAI_ENDPOINT).replace(/\/$/, "");
    const ver = env.AZURE_OPENAI_API_VERSION || "2024-06-01";
    const url = `${base}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${ver}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": env.AZURE_OPENAI_KEY },
      body: JSON.stringify(anthropicToOpenAIChat(bodyObj)),
    });
    const text = await res.text();
    if (!res.ok) {
      return { status: res.status, json: { type: "error", error: { type: "sovereign_upstream", message: `Azure Gov error: ${text.slice(0, 300)}` } }, burned: 0 };
    }
    const oai = JSON.parse(text);
    const anth = openAIToAnthropicResponse(oai, bodyObj.model || "gpt-4o");
    const u = oai.usage || {};
    const burned = Math.max(0, Math.round((u.prompt_tokens || 0) + (u.completion_tokens || 0)));
    return { status: 200, json: anth, burned };
  }

  throw new Error("unknown_sovereign_provider:" + provider);
}

// ---- embeddings (returns Voyage-shaped JSON so the client is unchanged) -------
export async function sovereignEmbed(bodyObj, env, provider) {
  const inputs = Array.isArray(bodyObj.input) ? bodyObj.input : bodyObj.input != null ? [bodyObj.input] : [];

  if (provider === "azure") {
    const base = String(env.AZURE_OPENAI_ENDPOINT).replace(/\/$/, "");
    const ver = env.AZURE_OPENAI_API_VERSION || "2024-06-01";
    const url = `${base}/openai/deployments/${env.AZURE_OPENAI_EMBED_DEPLOYMENT}/embeddings?api-version=${ver}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": env.AZURE_OPENAI_KEY },
      body: JSON.stringify({ input: inputs }),
    });
    const text = await res.text();
    if (!res.ok) return { status: res.status, json: { error: { type: "sovereign_upstream", message: `Azure Gov embed error: ${text.slice(0, 300)}` } }, burned: 0 };
    const j = JSON.parse(text);
    const u = j.usage || {};
    const total = u.total_tokens || u.prompt_tokens || 0;
    return { status: 200, json: { object: "list", data: j.data, model: j.model || "azure-embed", usage: { total_tokens: total } }, burned: Math.max(0, Math.round(total * 0.05)) };
  }

  // bedrock — Titan embeds one input per InvokeModel call.
  const region = env.AWS_BEDROCK_REGION || "us-gov-west-1";
  const modelId = env.AWS_BEDROCK_EMBED_MODEL_ID || "amazon.titan-embed-text-v2:0";
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const data = [];
  let totalTok = 0;
  for (let i = 0; i < inputs.length; i++) {
    const bodyStr = JSON.stringify({ inputText: String(inputs[i]) });
    const res = await sigv4Fetch(env, { region, service: "bedrock", host, path: `/model/${encodeURIComponent(modelId)}/invoke`, bodyStr });
    const text = await res.text();
    if (!res.ok) return { status: res.status, json: { error: { type: "sovereign_upstream", message: `Bedrock GovCloud embed error: ${text.slice(0, 300)}` } }, burned: 0 };
    const j = JSON.parse(text);
    data.push({ object: "embedding", embedding: j.embedding, index: i });
    totalTok += j.inputTextTokenCount || 0;
  }
  return { status: 200, json: { object: "list", data, model: modelId, usage: { total_tokens: totalTok } }, burned: Math.max(0, Math.round(totalTok * 0.05)) };
}

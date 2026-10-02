// ============================================================================
// server.mjs — run the Safety Lab AI proxy as a STANDALONE Node service.
//
// Same worker.js as the Cloudflare deployment; this wrapper lets a customer run
// it inside their OWN cloud (their AWS / GovCloud VPC, a container, a VM) when
// Cloudflare is not an option — e.g. a defense program that keeps everything
// inside their boundary. Node 18+ (global fetch, Request/Response, Web Crypto).
//
// Config comes from environment variables (see .env.example). For a customer:
//   LICENSE_MODE=offline
//   LICENSE_PUBLIC_KEYS=<the Safety Lab public-key JWK array>
//   ANTHROPIC_API_KEY=<their own key>         (ordinary customer)
//   ...or the Bedrock GovCloud / Azure Gov vars for a sovereign backend.
//
// Run:  LICENSE_MODE=offline ANTHROPIC_API_KEY=... node server.mjs
// ============================================================================
import http from "node:http";
import { Readable } from "node:stream";
import worker from "./worker.js";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const env = process.env;

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const hasBody = req.method !== "GET" && req.method !== "HEAD" && chunks.length > 0;
    const url = `http://${req.headers.host || "localhost"}${req.url}`;
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    });
    // Minimal Workers-style execution context.
    const ctx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); }, passThroughOnException() {} };
    const response = await worker.fetch(request, env, ctx);
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    if (response.body) Readable.fromWeb(response.body).pipe(res);   // preserve SSE streaming
    else res.end();
  } catch (e) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: { type: "proxy_exception", message: String((e && e.message) || e) } }));
  }
});

server.listen(PORT, HOST, () => {
  const mode = env.LICENSE_MODE === "offline" ? "offline-licence (customer-hosted)" : "database";
  console.log(`[safety-lab-proxy] standalone listening on ${HOST}:${PORT} — auth mode: ${mode}`);
});

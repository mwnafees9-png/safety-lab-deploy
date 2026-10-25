// ============================================================================
// server_key.mjs: the AI key of a customer's own server, set from inside Safety Lab (21 Oct 2026).
//
// Waqas: "why cant he just save his API key directly in safety lab". On a customer's server every
// AI request goes from the app to this service, and this service calls Anthropic, so the key has
// to live HERE. Until now the only way to put it here was a command in the server's terminal
// (stack/ai-proxy.env). This lets the server's ADMINISTRATOR paste it in the app instead:
//
//   GET    /v1/ai/admin/ai-key   is a key set, which one (last 4 characters), when, by whom
//   POST   /v1/ai/admin/ai-key   { key }  check it with Anthropic, then store it and use it at once
//   POST   /v1/ai/admin/ai-key   { remove: true }  remove the key set here (the server falls back
//                                to ai-proxy.env). POST, not DELETE, because the desktop app calls
//                                across origins and this service allows only GET and POST.
//
// Only the server's administrator (private.platform_admins, the account install.sh made) may call
// these: who is calling is decided by this server's own sign-in service from the caller's session
// token, and whether they are the administrator by the database (public.am_i_server_admin()),
// never by anything the caller says about itself. The key is never sent back to anyone, in any
// answer, by any route: the app can only learn that a key is set and its last four characters.
// It is kept in the AI service's own data folder (stack/ai-proxy-data/anthropic-key.json, readable
// by the owner only), beside the seat records. Node only, like seats.mjs: it keeps state on disk.
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const KEY_RE = /^sk-ant-[A-Za-z0-9_-]{20,400}$/;
export function looksLikeAnthropicKey(k) { return KEY_RE.test(String(k || "").trim()); }
// 24 Oct 2026 (Radia): an Anthropic string that is NOT an API key still matches KEY_RE, and Anthropic
// then only says "invalid x-api-key", which tells the person nothing. The two that get pasted:
// a Claude app sign-in token (sk-ant-oat..., from "claude setup-token" or a Claude subscription)
// and an Admin API key (sk-ant-admin..., for managing an organization, not for calling models).
// Named plainly, refused before anything is sent to Anthropic. The same words are in the app
// (site/server_ai_key.js) so an older server's answer is never the only one.
export function wrongKind(k) {
  const s = String(k || "").trim();
  if (/^sk-ant-oat/i.test(s)) return "That is a Claude app sign-in token (it starts with sk-ant-oat), not an API key. A Claude subscription or Claude Code sign-in cannot run this server's AI. Create an API key at console.anthropic.com under API keys (it starts with sk-ant-api) and paste that. Nothing was saved.";
  if (/^sk-ant-admin/i.test(s)) return "That is an Anthropic Admin key (it starts with sk-ant-admin), which manages an organization but cannot run AI requests. Create an API key at console.anthropic.com under API keys (it starts with sk-ant-api) and paste that. Nothing was saved.";
  return "";
}
// Anthropic's own words, exactly as it sent them: { type, message } from its error body.
async function anthropicSaid(r) {
  try {
    const j = await r.json();
    const e = j && j.error;
    if (e && (e.type || e.message)) return { status: r.status, type: String(e.type || "").slice(0, 80), message: String(e.message || "").slice(0, 400) };
  } catch (_) {}
  return { status: r.status, type: "", message: "" };
}
function quote(a) { return "Anthropic answered " + a.status + (a.type ? " " + a.type : "") + (a.message ? ': "' + a.message + '"' : " with no reason given") + "."; }

export function createServerKey({ dataDir, env, fetchImpl = fetch, now = () => Date.now() }) {
  const file = path.join(dataDir, "anthropic-key.json");
  let cache = null, cacheMtime = -1;

  function read() {
    let st = null;
    try { st = fs.statSync(file); } catch (_) { cache = null; cacheMtime = -1; return null; }
    if (st.mtimeMs === cacheMtime) return cache;
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf8"));
      cache = j && looksLikeAnthropicKey(j.key) ? j : null;
    } catch (_) { cache = null; }
    cacheMtime = st.mtimeMs;
    return cache;
  }
  function write(rec) {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = file + ".tmp-" + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600 });
    fs.renameSync(tmp, file);                    // atomic: a crash leaves the old key or the new one
    cacheMtime = -1;
  }

  // The key every AI call uses: the one set from the app, else the one in ai-proxy.env, else none.
  // A placeholder in ai-proxy.env (install.sh accepts "later") counts as none.
  function get() {
    const r = read();
    if (r) return r.key;
    const fromEnv = String(env.ANTHROPIC_API_KEY || "").trim();
    return looksLikeAnthropicKey(fromEnv) ? fromEnv : "";
  }
  function status() {
    const r = read();
    if (r) return { set: true, source: "app", last4: r.key.slice(-4), setAt: r.setAt || null, setBy: r.setBy || "" };
    const fromEnv = String(env.ANTHROPIC_API_KEY || "").trim();
    if (looksLikeAnthropicKey(fromEnv)) return { set: true, source: "server file", last4: fromEnv.slice(-4), setAt: null, setBy: "" };
    return { set: false, source: "none" };
  }

  async function who(request) {
    const auth = request.headers.get("authorization") || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (jwt.split(".").length !== 3) return { status: 401, error: "Sign in first." };
    if (!env.SEAT_AUTH_URL || !env.SEAT_AUTH_KEY) return { status: 503, error: "This server's AI service does not know its sign-in service yet. Run install.sh again on the server." };
    const base = env.SEAT_AUTH_URL.replace(/\/$/, "");
    let r;
    try { r = await fetchImpl(base + "/auth/v1/user", { headers: { apikey: env.SEAT_AUTH_KEY, authorization: "Bearer " + jwt } }); }
    catch (_) { return { status: 502, error: "The sign-in service on this server did not answer." }; }
    if (r.status === 401 || r.status === 403) return { status: 401, error: "Your sign-in has expired. Sign in again." };
    if (!r.ok) return { status: 502, error: "The sign-in service on this server answered " + r.status + "." };
    const u = await r.json().catch(() => null);
    if (!u || !u.id) return { status: 401, error: "Sign in first." };
    let a;
    try {
      a = await fetchImpl(base + "/rest/v1/rpc/am_i_server_admin", {
        method: "POST", headers: { apikey: env.SEAT_AUTH_KEY, authorization: "Bearer " + jwt, "content-type": "application/json" }, body: "{}",
      });
    } catch (_) { return { status: 502, error: "The database on this server did not answer." }; }
    if (a.status === 404) return { status: 503, error: "This server's database is missing the administrator check. Run install.sh again on the server." };
    if (!a.ok) return { status: 502, error: "The database on this server answered " + a.status + "." };
    const isAdmin = (await a.json().catch(() => false)) === true;
    if (!isAdmin) return { status: 403, error: "Only this server's administrator can see or change its AI key." };
    return { id: String(u.id), email: String(u.email || "") };
  }

  // Anthropic's own answer decides whether the key is good. Nothing is stored unless it says yes.
  async function verifyWithAnthropic(key) {
    let r;
    try {
      r = await fetchImpl("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    } catch (_) {
      return { ok: false, status: 502, error: "This server could not reach Anthropic to check the key, so nothing was saved. The server needs to reach api.anthropic.com for the AI to work at all; ask IT to allow it." };
    }
    if (r.ok) return { ok: true };
    const a = await anthropicSaid(r);
    if (r.status === 401) return { ok: false, status: 400, anthropic: a, error: quote(a) + " The key is not valid: it may have been revoked or deleted, or copied with a character missing. Nothing was saved." };
    if (r.status === 403) return { ok: false, status: 400, anthropic: a, error: quote(a) + " The key exists but is not allowed to use the models (check the key's workspace and the organization's permissions at console.anthropic.com). Nothing was saved." };
    return { ok: false, status: 502, anthropic: a, error: quote(a) + " Nothing was saved; try again in a minute." };
  }

  async function handle(request) {
    if (!["GET", "POST"].includes(request.method)) return json(405, { error: "method", message: "GET or POST only." });
    const me = await who(request);
    if (me.error) return json(me.status, { error: "auth", message: me.error });
    if (request.method === "GET") return json(200, status());
    const text = await request.text().catch(() => "");
    if (text.length > 4096) return json(413, { error: "too_large", message: "That is not an Anthropic key." });
    let body = null; try { body = JSON.parse(text); } catch (_) {}
    if (body && body.remove === true) {
      try { fs.unlinkSync(file); } catch (e) { if (e && e.code !== "ENOENT") return json(500, { error: "store", message: "The key could not be removed from the server." }); }
      cache = null; cacheMtime = -1;
      return json(200, Object.assign({ removed: true }, status()));
    }
    const key = String((body && body.key) || "").trim();
    if (!looksLikeAnthropicKey(key)) return json(400, { error: "format", message: "That is not an Anthropic key. It starts with sk-ant- and is one long line with no spaces." });
    const kind = wrongKind(key);
    if (kind) return json(400, { error: "kind", message: kind });
    const v = await verifyWithAnthropic(key);
    if (!v.ok) return json(v.status, Object.assign({ error: "verify", message: v.error }, v.anthropic ? { anthropic: v.anthropic } : {}));
    try { write({ key, setAt: new Date(now()).toISOString(), setBy: me.email }); }
    catch (_) { return json(500, { error: "store", message: "The key is valid but could not be stored on the server (its data folder is not writable)." }); }
    return json(200, Object.assign({ saved: true }, status()));
  }

  return { handle, get, status };
}

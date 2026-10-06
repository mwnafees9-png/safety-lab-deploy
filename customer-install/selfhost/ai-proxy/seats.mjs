// ============================================================================
// seats.mjs — floating seats and the server-held license (6 Oct 2026). Node only: it keeps
// state on disk, so it runs inside server.mjs (the customer's own server), never on Cloudflare.
//
// The license lives on the customer's server (stack/license/server.lic, put there from the
// maintenance menu). Every user's app reads it from here and asks here for a seat:
//
//   GET  /v1/ai/license        the server's license (it is no secret: the setup file carries it too)
//   GET  /v1/ai/seat/status    who holds the seats now          (signed-in user)
//   POST /v1/ai/seat/claim     take a seat, or keep the one held (signed-in user, every 5 minutes)
//   POST /v1/ai/seat/release   give it back: sign-out or quit   (signed-in user)
//
// Rules: at most license.seats people at a time; one seat per PERSON, whichever computer they are
// on; a seat is held while the app keeps checking in and is freed by release, or SEAT_TTL after the
// last check-in (closed lid, lost network, crash). A license without a seat count, or no license
// on the server, turns seats off (enabled:false) and the app's own license check applies as before.
// Who is calling is decided by the server's own sign-in service from the caller's session token,
// never by anything the caller says about itself.
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function createSeats({ dataDir, licensePath, env, verifyLicense, fetchImpl = fetch, now = () => Date.now(), ttlMs = 30 * 60 * 1000 }) {
  const stateFile = path.join(dataDir, "seats.json");
  let state = { leases: {} };
  try { const s = JSON.parse(fs.readFileSync(stateFile, "utf8")); if (s && s.leases && typeof s.leases === "object") state = s; } catch (_) {}
  let chain = Promise.resolve();
  const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };   // one change at a time
  function save() {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = stateFile + ".tmp-" + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(tmp, stateFile);                    // atomic: a crash leaves the old file or the new one
  }
  function prune() {
    const t = now(); let changed = false;
    for (const [id, l] of Object.entries(state.leases)) if (!(l && t - l.lastSeen < ttlMs)) { delete state.leases[id]; changed = true; }
    return changed;
  }

  async function license() {
    let blob = "";
    try { blob = fs.readFileSync(licensePath, "utf8").trim(); } catch (_) { return { error: "no_license" }; }
    if (!blob) return { error: "no_license" };
    const v = await verifyLicense(env, blob);
    if (v.error) return { error: v.error, blob };
    let payload = {};
    try { payload = JSON.parse(Buffer.from(blob.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch (_) {}
    const n = Number(payload.seats);
    return { blob, payload, seats: Number.isInteger(n) && n >= 1 ? n : null };
  }

  async function who(request) {
    const auth = request.headers.get("authorization") || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (jwt.split(".").length !== 3) return { status: 401, error: "Sign in first." };
    if (!env.SEAT_AUTH_URL || !env.SEAT_AUTH_KEY) return { status: 503, error: "Seats are not configured on this server (no sign-in service address)." };
    let r;
    try { r = await fetchImpl(env.SEAT_AUTH_URL.replace(/\/$/, "") + "/auth/v1/user", { headers: { apikey: env.SEAT_AUTH_KEY, authorization: "Bearer " + jwt } }); }
    catch (_) { return { status: 502, error: "The sign-in service on this server did not answer." }; }
    if (r.status === 401 || r.status === 403) return { status: 401, error: "Your sign-in has expired. Sign in again." };
    if (!r.ok) return { status: 502, error: "The sign-in service on this server answered " + r.status + "." };
    const u = await r.json().catch(() => null);
    if (!u || !u.id) return { status: 401, error: "Sign in first." };
    return { id: String(u.id), email: String(u.email || "") };
  }

  function view(seats, me) {
    const holders = Object.entries(state.leases).map(([id, l]) => ({ email: l.email, since: new Date(l.since).toISOString(), lastSeen: new Date(l.lastSeen).toISOString(), you: id === me }))
      .sort((a, b) => a.since.localeCompare(b.since));
    return { enabled: true, seats, inUse: holders.length, holders, youHoldOne: !!state.leases[me], ttlMinutes: Math.round(ttlMs / 60000) };
  }

  async function handle(request, url) {
    const p = url.pathname;
    if (p === "/v1/ai/license") {
      if (request.method !== "GET") return json(405, { error: "GET only" });
      const L = await license();
      if (L.error === "no_license") return json(404, { error: "no_license", message: "No license has been loaded on this server yet. Load it from the server's maintenance menu." });
      if (L.error) return json(409, { error: L.error, message: L.error === "expired" ? "The license on this server has expired." : L.error === "wrong_install" ? "The license on this server is for a different server." : "The license on this server is not valid." });
      return json(200, { license: L.blob });
    }
    const op = p.slice("/v1/ai/seat/".length);
    if (!["status", "claim", "release"].includes(op)) return json(404, { error: "not_found" });
    if (op === "status" ? request.method !== "GET" : request.method !== "POST") return json(405, { error: "wrong method" });
    const me = await who(request);
    if (me.error) return json(me.status, { error: "auth", message: me.error });
    const L = await license();
    if (L.error || L.seats == null) {
      return json(200, { enabled: false, reason: L.error || "no_seat_count", message: L.error ? "Seats are off: " + (L.error === "no_license" ? "no license is loaded on this server." : "the license on this server is not usable (" + L.error + ").") : "The license on this server does not limit seats." });
    }
    return serial(async () => {
      const t = now(); let changed = prune();
      let res;
      if (op === "status") res = json(200, view(L.seats, me.id));
      else if (op === "release") {
        if (state.leases[me.id]) { delete state.leases[me.id]; changed = true; }
        res = json(200, Object.assign({ released: true }, view(L.seats, me.id)));
      } else {
        const held = state.leases[me.id];
        if (held || Object.keys(state.leases).length < L.seats) {
          state.leases[me.id] = { email: me.email, since: held ? held.since : t, lastSeen: t };
          changed = true;
          res = json(200, Object.assign({ granted: true }, view(L.seats, me.id)));
        } else {
          res = json(409, Object.assign({ granted: false, message: "All " + L.seats + " seats are in use." }, view(L.seats, me.id)));
        }
      }
      if (changed) save();
      return res;
    });
  }
  return { handle, _state: () => state };
}

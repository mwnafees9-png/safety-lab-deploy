# Cloudflare Workers — house conventions

**Ruled by Waqas, 6 Aug 2026.** Cloudflare publishes a system prompt for generating
Worker code; he uploaded it and ruled that we follow it as the standard for any
Worker work in this estate. Canonical source (fetch it fresh rather than trusting
this summary if the two ever disagree):
<https://developers.cloudflare.com/workers/get-started/prompting> — the full prompt
is served as `prompt.txt` from that page.

**What this applies to.** `safety-lab-proxy` (the Worker behind
`api.safetylabaero.com` that holds the Anthropic + Voyage keys server-side) and any
new Worker. It does NOT apply to the Fly.io app `safety-lab-sync`, which is a
different runtime entirely.

## The binding rules

- **TypeScript by default**, unless JavaScript is explicitly asked for. Import every
  method, class and type used — no ambient assumptions.
- **ES modules only. NEVER Service Worker format** (`addEventListener('fetch', …)`).
  This is the rule most likely to be violated by muscle memory, because older Worker
  examples all over the web use the legacy form.
- **`wrangler.jsonc`, not `wrangler.toml`.** Include only bindings the code actually
  uses; no dependencies in the config. Set `compatibility_flags: ["nodejs_compat"]`
  and `observability.enabled: true` (with `head_sampling_rate: 1`).
- **One file** unless there is a reason not to. Prefer an official SDK over a
  hand-rolled client. No libraries with FFI / native / C bindings.
- **Never bake in secrets** — this compounds our own standing rule about the Supabase
  service-role key and the Stripe secret key.
- **WebSockets inside a Durable Object use the Hibernation API**: `this.ctx.acceptWebSocket(server)`,
  with `webSocketMessage()` / `webSocketClose()` / `webSocketError()` handlers.
  Do NOT call `server.accept()` and do NOT use `addEventListener` inside a DO.
  Validate the `Upgrade` header explicitly on the upgrade request.
- **Storage choice is prescribed**: KV for config/profiles/A-B, Durable Objects for
  strongly consistent state and coordination, D1 for relational, R2 for objects,
  Hyperdrive for an existing Postgres, Queues for async work, Vectorize for embeddings,
  Analytics Engine for high-cardinality events.
- **Security defaults**: validate requests, set security headers, handle CORS
  deliberately, rate-limit, least-privilege bindings, sanitise inputs.
- **Errors**: real status codes, meaningful messages, logged, edge cases handled.

## Notes

- The prompt is scoped strictly to writing Worker code. It says nothing about DNS,
  Security Center, Access or Tunnels — do not treat it as guidance on those.
- It instructs the model to ask clarifying questions when requirements are ambiguous.
  That matches this repo's working method; it does not license guessing.

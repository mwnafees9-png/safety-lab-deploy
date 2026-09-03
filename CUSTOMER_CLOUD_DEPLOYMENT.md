# Customer-cloud deployment — "your data lives in your cloud"

How to stand up Safety Lab Aero against a **customer-owned** backend, so every
project, document, signature, lock and auth identity lives inside the
customer's boundary. Written 28 Aug 2026 from the mechanisms already in the
repo — nothing here requires new product code.

The one-sentence pitch this enables: *"Your data lives in your cloud, in your
region, under your SSO — we ship the application, you own the database."*

---

## What already supports this (verbatim from the code)

- **Backend override** — `safety_lab.js` (~L3063): the app reads
  `window.__SLAB_SUPABASE_URL__` / `window.__SLAB_SUPABASE_KEY__` (or
  `window.SafetyLab.SUPABASE_URL/KEY`) **before** falling back to the hosted
  multi-tenant project. `feedback_client_module.js` and
  `labs_thread_config.js` honor the same override. When set, the console
  logs `Collaboration backend → <their URL>` — that line is the smoke test.
- **AI override** — the same pattern as `AI_PROXY_BASE_URL`: inference can
  point at the customer's endpoint (their Azure / Azure Gov / on-prem), and
  the controlled-document guard already refuses cloud AI backends when
  controlled documents are on file.
- **Schema as migrations** — `supabase/migrations/` is the complete database:
  `0001_rls_baseline` → `0007_config_management`, plus the dated
  loss-guard / recovery-RPC / baseline-restore files. Applying them in order
  reproduces the production schema, RLS included.
- **SSO runbook** — `site/MS_SSO_SETUP.md` covers Entra app registration,
  the Supabase Azure provider, the tenant-enforcement hook, and per-tenant
  approval. For a customer-cloud install, all of it happens in **their**
  Entra tenant and **their** Supabase project.

## Step 1 — the customer's database

Pick one:

- **Managed, their org**: create a Supabase project inside the customer's own
  Supabase organization, in the region they require. Fastest path; data sits
  in their org and region, billed to them.
- **Self-hosted, their VPC**: Supabase is open source — run it in their
  AWS/Azure account or on-prem Kubernetes. The path for programs whose data
  may not leave an accreditation boundary at all.

Then apply the schema, in filename order:

```
supabase link --project-ref <their-ref>        # or psql to their self-hosted DB
supabase db push                               # applies supabase/migrations/*
```

Verify RLS is active on `projects` / `project_documents` before going
further — the 0001/0002/0005 migrations are the security floor, and the
loss-guard trigger (20260820) is the server-side half of the E1 protections.

## Step 2 — auth in their tenant

Follow `MS_SSO_SETUP.md` against **their** Supabase project: app registration
in their Entra portal, Azure provider enabled in their Supabase dashboard
(callback `https://<their-ref>.supabase.co/auth/v1/callback`), the
tenant-id enforcement hook, then approve their tenant id. Email/password auth
works out of the box if they don't run Entra.

## Step 3 — serve the app, pointed at their backend

The app is the static `site/` bundle plus the thin URL-rewriting worker.
Options, in order of preference:

1. **Their Cloudflare account**: copy `worker.js` + `wrangler.jsonc`, set
   their `account_id`, `wrangler deploy`. 
2. **Any static host / intranet web server**: serve `site/` as-is; the app
   makes no assumption about its mount point.

Inject the backend config **before `safety_lab.js` loads** — a small inline
script at the top of `index.html` (or a `bootstrap.js` loaded first):

```html
<script>
  window.__SLAB_SUPABASE_URL__ = 'https://<their-ref>.supabase.co';
  window.__SLAB_SUPABASE_KEY__ = '<their publishable key>';
  // optional — their AI endpoint (Azure Gov / on-prem proxy):
  window.AI_PROXY_BASE_URL = 'https://<their-ai-proxy>';
</script>
```

**Gotcha that will bite if skipped:** `worker.js` owns the Content-Security-
Policy as a single source of truth, and its `connect-src` names the hosted
Supabase origin. A customer deployment must add *their* Supabase origin (and
their AI proxy origin) to that list, or every backend call is silently
blocked. This is one line in the CSP block of their copy of `worker.js`.

## Step 4 — AI inference inside their boundary

Deploy their own copy of the AI proxy worker (`safety-lab-proxy_worker_SEC.js`)
holding **their** key to **their** endpoint (Azure OpenAI, Azure Gov,
Bedrock, on-prem gateway), and point `AI_PROXY_BASE_URL` at it. Documents
marked controlled then satisfy the controlled-document guard only when the
configured backend is on-prem/ITAR class — that enforcement is already in the
engine.

## Step 5 — verify

1. Open the app; console must show `Collaboration backend → <their URL>`.
2. Sign in via their SSO; create a project; hard-refresh; confirm it reloads
   from **their** database (their Supabase dashboard shows the row).
3. Run one AI drafting action; confirm the request goes to their proxy.
4. Confirm nothing reaches `fhrqkhdrwbfnizkepkch.supabase.co` (network tab).

## Updates

Customer installs receive releases as a re-ship of the `site/` bundle (and
occasionally new files in `supabase/migrations/`, applied the same way).
Self-hosted customers should be told the cadence and given the bundle via a
channel agreed in the contract. The desktop/air-gap build remains the answer
where even this is too connected.

## Not yet done (contract-side, not code)

- DPA / data-residency language for the customer's paper.
- A support boundary statement: who operates their Supabase (them), who
  supports the application (us).
- Pricing for dedicated/self-hosted vs the SaaS tiers ($1,500 Pro /
  $2,500 Pro+).

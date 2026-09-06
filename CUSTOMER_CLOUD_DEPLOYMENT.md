# Customer-cloud deployment — "your data lives in your cloud"

> ## ⚠️ DO NOT SEND THIS TO A CUSTOMER YET — verified defective, 5 Sep 2026
>
> A step-by-step check against the code found six defects, four of them fatal to
> an install that follows this document literally:
>
> 1. **Step 1 does not work.** `supabase db push` cannot rebuild this database.
>    Seventeen production tables — including `projects`, `project_documents`,
>    `workspaces`, `project_crdt` and `yjs_documents` — have no `CREATE TABLE`
>    anywhere in `supabase/migrations/`. The push fails on `0001`.
> 2. **It names a setting nothing reads.** `window.AI_PROXY_BASE_URL` appears in
>    the snippet below and is read by no code in the product. The name the app
>    actually reads is `__SLAB_AI_ENDPOINT__`.
> 3. **It pointed at a proxy that no longer exists.** `safety-lab-proxy_worker_SEC.js`
>    was a 5 Jul fork sitting in this repo, 184 lines behind the deployed worker
>    and carrying no sovereign ITAR routing. It was deleted on 5 Sep 2026. The
>    live proxy is the sibling repo `safety-lab-proxy-deploy`.
> 4. **It omits three endpoints the app still calls** — the corpus search
>    endpoint, the feedback function and the notification base. An install
>    following only this document passes its own smoke test (which checks the
>    database URL alone) while still calling Safety Lab on five paths, which is
>    the exact opposite of what the document promises.
>
> Two further problems are of a different kind and are not this document's fault:
> the migrations it tells the customer to apply currently carry the cross-tenant
> membership hole and an `erase_project` grant that is more permissive on disk
> than in production. **Any install built from this repo today inherits both.**
>
> This guide is rewritten as the last step of the customer-hosted build, against
> what then exists, and proved by a reference install performed end to end by
> someone who did not build it. Until that has happened, this file is an internal
> design note, not a deliverable.


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

Deploy their own copy of the AI proxy worker (the sibling repo `safety-lab-proxy-deploy/worker.js` — the old in-repo copy `safety-lab-proxy_worker_SEC.js` was stale and was deleted on 5 Sep 2026)
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

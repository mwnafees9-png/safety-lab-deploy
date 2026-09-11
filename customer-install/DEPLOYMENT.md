# Safety Lab Aero — self-hosted deployment guide

This guide stands up Safety Lab Aero entirely on **your own infrastructure**.
When you finish, your project data, your sign-ins, and your AI all live on
servers **you** control. Safety Lab holds nothing and is never in the data path.

## The three ways to run it — pick one

1. **Self-hosted backend** (this guide, Part A). Your own database, your own
   sign-in, your own AI. The full product for a team.
2. **Desktop app** (separate installer). Files on one machine or your own
   SharePoint / OneDrive. No servers to run.
3. **Browser-only** (Part C). The app runs in the browser and keeps everything
   on that machine. No backend at all.

For defense / ITAR programs that must stay inside your own cloud, use Part A
with the ITAR options in **Part B**.

---

## Part A — Self-hosted backend

### What you need first
- A **Postgres database you control.** The simplest is a **Supabase** project in
  your own organization (it also provides the sign-in and live-updates the app
  uses). A self-managed Postgres also works.
- **One AI option:** your own Anthropic (Claude) API key, *or* AWS Bedrock
  GovCloud, *or* Azure OpenAI Government (see Part B).
- **Somewhere to run the small AI proxy:** a Cloudflare account, *or* any host
  that runs Node 18+ (a container or VM in your own cloud).
- **The app files** and the **AI proxy files** (Safety Lab provides both).
- **Your license file** (`.lic`) and your **public key** (Safety Lab provides
  both; the public key is safe to share and is not a secret).

### Step 1 — Stand up the database
From the `customer-install/db` folder, run the installer against your database
connection string (Supabase: *Project Settings → Database → Connection string*):

```
./apply.sh "postgresql://postgres:PASSWORD@db.YOURREF.supabase.co:5432/postgres"
```

Then make yourself an administrator (run in the Supabase SQL editor or psql):

```sql
insert into private.platform_admins(email) values ('you@yourcompany.com');
```

Your database is ready. Nothing here contacted Safety Lab.

### Step 2 — Deploy the AI proxy
The proxy holds your AI key so the browser never sees it, and it checks your
signed license before doing anything. Pick **one** of the two ways to run it.

**Configuration (both ways use these):**
- `LICENSE_MODE=offline`
- `LICENSE_PUBLIC_KEYS` = the public-key list Safety Lab gave you (a small JSON
  array, e.g. `[{"kid":"slab-2026-09-06","alg":"ES256","kty":"EC","crv":"P-256","x":"...","y":"..."}]`)
- `ANTHROPIC_API_KEY` = your own Claude key (ordinary customer)

**(a) On Cloudflare** — from the `safety-lab-proxy-deploy` folder:
```
npx wrangler secret put LICENSE_PUBLIC_KEYS
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```
Set `LICENSE_MODE=offline` as a plain variable in `wrangler.jsonc` (`[vars]`).
Note the URL Cloudflare gives you (e.g. `https://your-proxy.workers.dev`).

**(b) As a standalone service** — anywhere that runs Node 18+ (your own cloud):
```
cp .env.example .env      # fill in LICENSE_MODE=offline, LICENSE_PUBLIC_KEYS, ANTHROPIC_API_KEY
node server.mjs           # listens on :8787
```
Put it behind your normal HTTPS front door and note that address.

Confirm it's alive: `GET <proxy-url>/v1/ai/health` returns `{"ok":true,...}`.

### Step 3 — Point the app at your backend
Serve the app files from your own web host. The app needs a tiny config script
**before** its own scripts in `index.html`. You can either **generate it** (easiest)
or write it by hand.

**Generate it (recommended).** Copy `install.env.example` to `install.env`, fill
in your addresses, and run the generator from the `customer-install` folder:

```
cp install.env.example install.env   # then edit install.env
node configure.js                     # writes slab_env.js
```

Include the `slab_env.js` it produces **before** the app's own scripts. The
generator refuses to write a file that points anything at a Safety Lab address,
and it catches the one easy mistake — leaving the AI endpoint blank in
self-hosted mode, which would otherwise fall back to our AI. If you'd rather do
it by hand, add this instead, filling in your two addresses:

```html
<script>
  window.__SLAB_SUPABASE_URL__ = "https://YOURREF.supabase.co";
  window.__SLAB_SUPABASE_KEY__ = "YOUR_SUPABASE_ANON_KEY";  // the publishable/anon key
  window.__SLAB_AI_ENDPOINT__  = "https://your-proxy-address";
  window.__SLAB_WEB_APP_URL__  = "https://app.yourcompany.com"; // this install's own address
</script>
```

If any of these still points at a Safety Lab address, the app **refuses to
start** and names the setting — that is the guardrail that keeps your data off
our cloud.

### Step 4 — Load your license and sign in
Open the app. On first run it asks for your license file (`.lic`) — load it.
Create your account, sign in, and make a test project. Confirm:
- the project appears in **your** Supabase tables (not ours),
- the AI drafting works (it is going through **your** proxy to **your** AI).

### Step 5 — Verify isolation
In the browser console run:
```
SLConfigEgress()
```
It lists every address the app will contact. Every one should be **yours** —
your database, your proxy. If anything shows a Safety Lab address, fix the
matching `__SLAB_*` value in Step 3.

To confirm the **database** side is healthy without opening the app, run the
checker from the `customer-install` folder against your connection string:

```
./verify.sh "postgresql://postgres:PASSWORD@db.YOURREF.supabase.co:5432/postgres"
```

It checks the tables, security rules, and admin account are all in place and
prints a pass/fail summary. Done.

---

## Part B — ITAR / GovCloud (keep everything in your own cloud)
Same as Part A, but run the proxy as the **standalone service (2b) inside your
own AWS GovCloud VPC**, and point it at a US-sovereign AI instead of a public
key. In the proxy's environment set one of:

**AWS Bedrock GovCloud (Claude — the engine the product was validated on):**
```
ITAR_PROVIDER=bedrock
AWS_BEDROCK_REGION=us-gov-west-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20240620-v1:0
```
**Azure OpenAI Government:** set `ITAR_PROVIDER=azure` and the Azure variables
(see `ITAR_PROVISIONING.md`).

If no sovereign backend is configured, an ITAR request is **refused, never sent
to a public model** — that refusal is by design. Mark controlled projects as
export-controlled in the app; the AI data fence and this proxy both enforce it.

---

## Part C — Browser-only (no backend at all)
Serve the app files and set just this:
```html
<script> window.__SLAB_LOCAL_ONLY__ = true; </script>
```
Everything stays on the user's machine (and their own SharePoint / OneDrive if
they save there). No database, no proxy, nothing on any server. AI is off unless
the user supplies their own key directly.

---

## Optional — automatic invite emails
Not required. Without it, when an admin invites a teammate the app shows a link
to pass along by hand. If you want invites emailed automatically, deploy the
`notify-invite` edge function to your Supabase with your own email provider
(Resend) key. That is the only edge function a self-hosted install can use, and
it is optional.

---

## What "done" looks like
- Your database holds your projects; ours holds nothing.
- Your proxy holds your AI key; the browser never sees it; controlled work never
  leaves your boundary.
- `SLConfigEgress()` lists only your own addresses.
- The app runs, licensed, on your own web host.

# Microsoft 365 / Entra SSO — setup & operations

"SharePoint-style" login: users click **Sign in with Microsoft** and authenticate with their
Microsoft 365 work account. Restricted to **approved customer tenants** only.

## What's already built (this repo / your DB)
- **Web button** — `site/ms_sso.js` (born-modular). Injects the button into the sign-in
  modal and calls `supabase.auth.signInWithOAuth({ provider: 'azure' })`. The existing
  PKCE + `detectSessionInUrl` client finishes the exchange automatically, so sign-in flows
  through the same `_onSupabaseSignedIn` path as email login. Wired at `index.html` (`ms_sso.js?v=1.0`).
- **Tenant allowlist (server-side)** — `public.approved_tenants` table + `is_tenant_approved(uuid)`
  + `ms_sso_before_user_created(jsonb)` hook function. Applied to the DB and unit-tested
  (approved→allow, unapproved→403, issuer-URL parsing, email signups pass through, no-tid→fail-closed).

## Your steps to turn it on

### 1. Register an app in Microsoft Entra (Azure portal → Entra ID → App registrations)
- **Supported account types:** "Accounts in any organizational directory (multitenant)."
  (Multitenant + our allowlist = you approve tenants one by one, without a per-customer app.)
- **Redirect URI (Web):** `https://fhrqkhdrwbfnizkepkch.supabase.co/auth/v1/callback`
- Create a **client secret**; copy the **Application (client) ID** and the secret **value**.
- API permissions: Microsoft Graph delegated `openid`, `profile`, `email` (User.Read optional).

### 2. Enable the Azure provider in Supabase (Dashboard → Authentication → Providers → Azure)
- **Client ID** = the Application (client) ID from step 1.
- **Secret** = the client secret value. *(You paste this — never share it.)*
- **Azure Tenant URL:** `https://login.microsoftonline.com/organizations`
  (work/school accounts across tenants; the allowlist does the restricting).
- Confirm the callback URL matches the redirect URI from step 1.

### 3. Confirm the tenant-id claim path (one real sign-in)
Sign in once with a Microsoft account, then check where Entra put the tenant id:
```sql
select id, raw_user_meta_data, identities from auth.users order by created_at desc limit 1;
```
The hook already checks `identity_data.tid`, `user_metadata.tid`, and parses it from the
`iss` URL — one of these will hold it. If your tokens use a different key, tell me and I'll
adjust `ms_sso_before_user_created` (one-line change).

### 4. Register the enforcement hook (Dashboard → Authentication → Hooks)
- **Before user created →** Postgres → `public.ms_sso_before_user_created`.
- After this, a Microsoft sign-in from an unlisted tenant is rejected with a 403 + a
  "contact sales" message; email sign-ins are unaffected.

### 5. Approve a customer tenant (repeat per customer)
Get the customer's **Directory (tenant) ID** (they find it in their Entra admin center), then:
```sql
insert into public.approved_tenants (tenant_id, org_name, added_by)
values ('<their-tenant-guid>', 'Customer Org Name', 'you@safetylabaero.com');
```
Suspend without deleting: `update public.approved_tenants set status='suspended' where tenant_id='...';`

## Desktop (Electron)
Desktop OAuth can't complete an in-window browser redirect from `file://`. `ms_sso.js`
already detects desktop and, if a native bridge `window.safetyLabDesktop.openOAuth(url)` is
present, opens the system browser with `skipBrowserRedirect`. To finish the desktop loop:
1. Add a **custom protocol** (e.g. `safetylab://auth`) or loopback `http://localhost:<port>`
   redirect URI to the Entra app (step 1) **and** to Supabase's allowed redirect URLs.
2. In `safety-lab-desktop/main.js`, register the protocol handler, capture the redirect,
   and hand the code back to the renderer for `supabase.auth.exchangeCodeForSession`.
I can wire the `main.js` handler when you want the desktop half — it needs those redirect
URIs registered first.

## Notes
- **GCC High / Azure Government tenants** (some defense customers) live in a *separate*
  Microsoft cloud with different login endpoints. Standard commercial Entra SSO above does
  **not** cover GCC High — that's a separate provider config if/when a customer needs it.
- The allowlist table has RLS default-deny with no public policies: signed-in users cannot
  read the customer list; only admins / service role can.

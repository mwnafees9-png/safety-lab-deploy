# Safety Lab Aero — Security Hardening: Operator Runbook & Next Steps

_Prepared July 2026. This is an internal working document — not customer-facing._

This covers (1) what was just shipped, (2) the few switches only you can flip, and
(3) ready-to-send drafts for the external attestation track (the part that moves us
from a self-assessed 9 to an independently-validated 9.5–10).

---

## 1. What shipped in this pass

**Live in the database now (production):**

- **Advisor panel: 11 → 2 warnings, 1 → 0 info.** The 7 RLS-helper functions were
  moved to a non-exposed `private` schema (RLS still evaluates them; they're no
  longer callable via the public REST API). `erase_project`'s API exposure was
  revoked. The `approved_tenants` policy gap was closed.
- **The 2 remaining warnings are intentional and safe:** `erase_my_account` (only
  ever touches the caller's own data) and `verify_signoff_chain` (read-only integrity
  check). Both are deliberately callable by the signed-in user. A reviewer who knows
  Supabase will read these as correct. (If you want literal zero, we can move them
  behind Edge Functions later — it's a destructive-path change I'd test in isolation.)
- **Audit trail is provably append-only.** `audit_log` and `workspace_audit` had their
  UPDATE/DELETE/TRUNCATE privileges revoked and a hard trigger added that blocks any
  mutation, with a break-glass GUC (`app.allow_audit_maintenance`) for deliberate,
  audited admin corrections.

**Live in the app after the next deploy:**

- **MFA enforced for everyone (grace enrollment).** On next sign-in, any account
  without a 2FA factor is required to enroll before the app opens; accounts with a
  factor are challenged for their 6-digit code. Fails **open** if MFA infrastructure
  is unavailable, so a platform hiccup can never lock out all logins. Toggle:
  `window.SL_MFA_REQUIRED = false` disables enforcement (leaves 2FA opt-in).
- **Microsoft Entra SSO button** surfaced in the live sign-in gate (needs the Azure
  steps in §2 to actually complete a sign-in).
- **A+ security headers** were already enforced in `worker.js` (HSTS, enforcing CSP,
  frame-DENY, nosniff, Referrer-Policy, Permissions-Policy); added `Cross-Origin-Opener-Policy`.
- **`/.well-known/security.txt`** (RFC 9116) vulnerability-disclosure policy.
- **`/trust`** security page, routed through the security-header chokepoint.

**Deploy:** `cd ~/Desktop/safety-lab-deploy/site && npx wrangler deploy`

---

## 2. Switches only you can flip

### 2a. Enable Microsoft Entra SSO (≈15 min) — makes the SSO button functional

1. **Azure Portal → Entra ID → App registrations → New registration.**
   - Supported account types: **Accounts in any organizational directory (multitenant)**.
   - Redirect URI (Web): `https://fhrqkhdrwbfnizkepkch.supabase.co/auth/v1/callback`
   - Create a **client secret**; copy the **Application (client) ID** and the secret **value**.
   - API permissions (Microsoft Graph, delegated): `openid`, `profile`, `email`.
2. **Supabase → Authentication → Providers → Azure:** paste the Client ID + secret;
   Azure Tenant URL = `https://login.microsoftonline.com/organizations`. _(You paste
   the secret — I never see it.)_
3. **Supabase → Authentication → Hooks → Before user created →** Postgres →
   `public.ms_sso_before_user_created` (enforces the tenant allowlist).
4. **Approve a customer tenant** (repeat per customer) with their Directory (tenant) ID:
   ```sql
   insert into public.approved_tenants (tenant_id, org_name, added_by)
   values ('<their-tenant-guid>', 'Customer Org', 'waqas.nafees@safetylabaero.com');
   ```

### 2b. Confirm MFA is enabled at the project level

Supabase → Authentication → check that **TOTP MFA** is enabled (it is by default). If it
were disabled, enforcement would silently fail open (users pass through un-enrolled).

### 2c. Optional: leaked-password protection

Supabase → Authentication → Password settings → enable **"Check against HaveIBeenPwned"**
and set a minimum length/strength. One click; blocks known-breached passwords at signup.

---

## 3. External attestation track (moves 9 → 9.5–10)

These require a third party — they can't be coded. Draft copy below; adjust and send.

### 3a. Anthropic — Zero-Data-Retention (ZDR) + no-training confirmation

> **To:** Anthropic (via your account rep or privacy@anthropic.com)
> **Subject:** Zero-data-retention addendum request — Safety Lab Aero (aerospace/ITAR-adjacent)
>
> Hi — we're Safety Lab Aero, building certification-grade aerospace safety software on
> the Claude API. Our customers include clean-sheet aircraft programs and we're in
> evaluation with a defense-autonomy program, so data governance is contractually
> material for us.
>
> We'd like to (1) execute a **zero-data-retention** configuration for our API traffic,
> and (2) get written confirmation that our API content is **not used to train models**.
> Could you point us to the ZDR addendum and any eligibility requirements? We can share
> our use case and volumes on a call.
>
> Thanks, Waqas

### 3b. Subprocessor DPAs (Supabase, Cloudflare, Voyage, Microsoft)

> **Subject:** Data Processing Agreement request — Safety Lab Aero
>
> Hi — we process customer safety-engineering data on your platform and need a signed
> **Data Processing Agreement** (and your current subprocessor list + SOC 2 report under
> NDA, if available) for our own customer due-diligence. Could you send your standard DPA
> or point us to your self-serve signing flow? Thanks, Waqas

Send to each: Supabase (they have a self-serve DPA + SOC 2), Cloudflare (DPA + SOC 2 in
dashboard), Voyage AI, and Microsoft (Azure DPA is part of the Product Terms).

### 3c. Independent penetration test (RFP)

You already have `SEC9_Pen_Test_Scope_RFP.md`. Send it to 2–3 reputable app-pentest firms
(e.g. include a web-app + API scope, authenticated + unauthenticated, the Cloudflare
Worker proxy routes, and Supabase RLS boundary testing). Ask for a **letter of engagement**
now (that alone is what a reviewer wants to see) and a **report + remediation retest**.
Typical timeline: 2–4 weeks to schedule, 1–2 weeks to run.

### 3d. SOC 2 Type II

The long pole. Engage a firm (e.g. Vanta/Drata + an auditor) to start a **Type II
observation window** — the clock starts the day you begin, and "SOC 2 in progress,
window open" is a legitimate answer to a security questionnaire. 3–6 months to first report.

---

## 4. Honest scorecard

| | State |
|---|---|
| Controls (technical) | **~9** — enforced MFA, SSO, RLS on every table, encryption, append-only audit, A+ headers, disclosure policy, erasure w/ certificates |
| Attestation (independent proof) | **Not yet** — this is the gap between 9 and 9.5–10 |

Do §2a + §2b + §2c today (all self-serve), get §3a–§3c drafts sent this week, and start
§3d, and you can honestly tell Boeing: _"9-grade controls, SSO + enforced MFA live,
independent pen test engaged, SOC 2 window open."_ That's a legitimate 9.5 story.

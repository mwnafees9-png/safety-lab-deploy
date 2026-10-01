# Credential rotation runbook

**Written 1 Oct 2026.** Every rotation this platform needs, in the order that does not break it,
with the verification that proves each one landed. Claude never handles a value: every step below
is one Waqas runs, and the only thing Claude does is check afterwards that the new state is live.

Read the correction in section 0 first. The plan this replaces was written against a database
that no longer exists.

---

## 0. What is no longer true

`OPEN_ITEMS.md` SEC-5 (R8) says the service_role JWT sits in five database-webhook trigger
definitions, and that rotating it is a big-bang requiring the five triggers to be recreated.
**That has not been true since 17 September.** Verified against production on 1 Oct 2026:

- 23 triggers in `public`. **None** takes any argument. **None** contains a JWT.
- Exactly one function calls out over HTTP: `private.notify_post`.
- It reads its credential from **Supabase Vault**, secret name `notify_hook_secret`, created
  17 Sep 2026.

So the schema carries no credential, and a schema dump or a backup taken today leaks nothing.
SEC-5 as written is closed. What it leaves behind is section 2.

---

## 1. SEC-2 — rotate `notify_hook_secret`  (overdue since 17 Sep, 10 minutes)

**Why.** The value was visible in a screenshot pasted into a work session, so it exists in a chat
log. Its only power is to make the notify functions send an email, which is why this is a tidy-up
and not an emergency, but it has been outstanding for two weeks.

**Blast radius if it goes wrong.** Outbound email stops. S28 is the precedent: the last change to
this path killed every notification for three days, silently, because `net.http_post()` queues and
returns before the call is made. Nothing else breaks. No customer-visible failure.

**Steps.**

1. Generate a value. `openssl rand -base64 32 | tr -d '\n' | pbcopy`
2. Set it on the edge functions: `supabase secrets set NOTIFY_HOOK_SECRET=<paste>`
3. Set the same value in the vault:
   `select vault.update_secret('18364382-1b63-4d6e-bab2-805748217ec1', '<paste>');`
4. Do 2 and 3 within the same minute. Between them every notification fails.

**Verification — do not skip, the failure is silent.**

- Sign in to the app. A sign-in notification should arrive.
- Then check the queue actually drained rather than trusting the inbox:
  `select status_code, count(*) from net._http_response where created >= now() - interval '10 minutes' group by 1;`
  Anything other than 200 means the two halves do not match.

---

## 2. The legacy API keys  (the real remnant of R8)

**Why this still matters.** The project has both key systems enabled:

| Key | Type | State |
|---|---|---|
| `anon` | legacy JWT | enabled |
| `default` | `sb_publishable_…` | enabled, and the one the app uses |
| `service_role` | legacy JWT | enabled, injected into all seven edge functions |

The application already moved to the publishable key, so the legacy anon key is live but unused
by us. The service_role legacy key is a different matter: it was embedded in the schema before
17 September, which means it is in every backup taken before that date. It should be retired, and
retiring it no longer requires rotating the JWT secret.

**The dependency that decides the sequence.** All seven edge functions construct their client from
the auto-injected `SUPABASE_SERVICE_ROLE_KEY`. Disabling the legacy keys before those functions
use a modern secret key would break notify-signin, notify-signup, notify-review, notify-expiry,
notify-feedback, notify-invite and stripe-webhook at once. Do not disable first.

**Order.**

1. Issue a secret key (`sb_secret_…`) in the dashboard. Nothing changes yet; both work.
2. Set it as an explicit function secret, for example `SLAB_SERVICE_KEY`, and change the seven
   functions to read it with a fallback: `Deno.env.get('SLAB_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.
   The fallback is what makes this reversible.
3. Deploy the functions. `supabase functions deploy` — separate from `./ship.sh`, which does not
   touch them.
4. Verify every one of the seven before going further. Sign in (notify-signin), sign up a throwaway
   (notify-signup), leave feedback, send an invite, change a review status, and confirm the Stripe
   webhook still records. Each should behave exactly as before.
5. Only then disable the legacy keys in the dashboard. Both legacy JWTs stop working at that moment.
6. Verify again: the app signs in (publishable key), all seven functions still work (secret key).

**If anything fails at step 6**, re-enable the legacy keys in the dashboard. That is the whole
rollback, and it is why the fallback at step 2 stays in the code until a full week has passed with
no failures.

**What this does NOT require.** Rotating the JWT secret, recreating any trigger, or redeploying the
web app. Those were all in the old plan and none of them applies now.

---

## 3. The Anthropic key  (overdue since 16 Sep)

The key supplied for the R7 reference install was written into `~/dev/safety-lab-proxy-deploy/.env`
and had been in a chat window first, so it was marked for rotation the same day. It has not been
rotated.

1. Create a new key in the Anthropic console, **inside the workspace**, not at the organization
   level. An organization-level key is refused with "This API key is not scoped to a workspace".
2. Update it wherever the proxy reads it, and the local `.env`.
3. Revoke the old key in the console. Revoking is the step that matters; creating a new one and
   leaving the old one live achieves nothing.
4. Verify one AI call end to end through the proxy before revoking, not after.

`ANTHROPIC_WORKSPACE_ID` is not a secret and does not change.

---

## 4. The Entra client secret  (expires around February 2027)

"Sign in with Microsoft" runs on the app registration *Safety Lab Aero – Web Sign-in*. Its client
secret was created on 8 September with a short expiry, around February 2027. When it expires,
Microsoft SSO stops working for everyone who uses it, with no warning beforehand.

Create the replacement a month early, add it to the Supabase Azure provider, confirm a real sign-in,
then delete the old one. Put the date in the calendar now rather than discovering it on the day.

Do not touch the other registration. *ANEM* (client `e27845a3-…`) is the live Teams agent.

---

## 5. Order of work

| | What | Needs | Risk if deferred |
|---|---|---|---|
| 1 | SEC-2, `notify_hook_secret` | 10 minutes | A credential sitting in a chat log |
| 2 | Anthropic key | 15 minutes | The same, with a billable key |
| 3 | Legacy API keys, section 2 | An hour, staged | A key that is in pre-17-Sep backups stays valid |
| 4 | Entra secret | Calendar entry now, action in January | SSO stops dead on expiry |

One rotation at a time, with its verification finished, before the next one starts. The failure
mode on this path is silent, and two changes in flight at once make the silent failure
unattributable.

---

## 6. Standing rule

Claude does not generate, read, store, paste or transport any of these values, and does not run
these steps. It wrote this runbook, it will verify the resulting state against the live project,
and it will say plainly when a verification does not pass.

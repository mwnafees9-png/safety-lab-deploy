# Real-stack proof (3 Oct 2026)

The SQL proof one folder up runs against a bare Postgres. These two scripts run against the
real self-hosted Supabase stack from `customer-install/selfhost/stack-src` (GoTrue, PostgREST,
Realtime), with real password and TOTP sessions.

1. Start the stack (db, auth, rest, realtime, api-gw) on a fresh database, with
   ENABLE_EMAIL_AUTOCONFIRM=true, and apply kit files 00 to 18 with psql. Copy the kit files to
   /tmp/kit inside the db container (the script applies 19 and 20 from there).
2. Copy both scripts into a folder with `@supabase/supabase-js@2.116.0` and `otplib` installed:
   `STACK_DIR=/path/to/stack node stack_proof.mjs` (28 checks: today's hole, 19 before the app,
   private channels, two-factor in the database, the token hand-over after the second step,
   project move, sign-off identity, the Verify ledger).
3. Then `STACK_DIR=/path/to/stack MFA_JS=/path/to/repo/site/mfa.js node live_mfa.mjs` (11 checks: the real site/mfa.js password
   re-check keeps an open channel joined, records the sign-off as two-factor, refuses a wrong
   password or another account's, and a mutation that checks the password on the app session
   is caught because the server closes the channel).

Never point either script at a production project: they create users, a workspace, and apply
migrations.

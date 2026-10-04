# Safety Lab Aero — database install

This builds the Safety Lab Aero database on **your own** Postgres (a Supabase
project in your own account, or your own Postgres server). No data ever touches
Safety Lab's cloud.

## What you need
- A Postgres database you control. The easiest is a free/managed **Supabase**
  project in your own organization (it provides the auth + realtime the app uses).
- The database connection string (Supabase: Project Settings → Database → Connection string).

## Install
```
./apply.sh "postgresql://postgres:PASSWORD@db.YOURREF.supabase.co:5432/postgres"
```
This runs the SQL files in order:
1. `00_schema_baseline.sql` — the whole schema (tables, security rules, functions).
2. `01_..._cannot_mint_owner.sql` — membership hardening.
3. `02_drop_hardcoded_platform_admins.sql` — admin list lives in a table you own (starts EMPTY).
4. `03_collab_field_edit_locks.sql` — live co-editing locks.
5. `04_harden_api_surface.sql` — trims the exposed API surface.
6. `05_change_journal_problem_events.sql` — append-only, hash-chained change journal + problem-report event log.
7. `06_grants_lockdown.sql` — locks the function/RPC surface to the app's real client calls.
8. `07_verify_functions.sql` — server-side integrity check for the change journal / problem-report log (recomputes each record's fingerprint to catch content tampering).
9. `08_user_secrets_vault.sql`: per-user server-side secret vault (your own AI keys never sit in the browser).
10. `09_audit_writers_and_ledger_lockdown.sql`: audit writers and append-only lockdown of the ledgers.
11. `10_scheduled_chain_verification.sql`: scheduled hash-chain verification plus a trail on the break-glass path.
12. `11_truncate_grants_lockdown.sql`: takes TRUNCATE off the API roles (row security does not cover it).
13. `12_drop_dead_ai_usage.sql`: removes the retired per-user AI meter.
14. `13_chain_serialization.sql`: serializes chain writes so the hash chains cannot fork under concurrency.
15. `14_acknowledged_chain_breaks.sql`: registered, explained chain breaks.
16. `15_erasure_completeness.sql`: erasure routines cover every table that can hold project or user data.
17. `16_workspace_member_directory.sql`: the workspace member directory the reviewer picker and workflow screens read.
18. `17_auth_signup_trigger.sql`: the sign-up trigger that gives every new user their row and personal workspace (and backfills users created before it).
19. `18_verify_wrappers_match_inner.sql`: the two chain-check functions users call, re-declared to match what they return.
20. `19_realtime_private_channels.sql`: who may join and send on the live co-editing, lock and presence channels (workspace members receive; editors send edits and locks).
21. `20_access_rules_hardening.sql`: two-factor enforced by the database for accounts that have it turned on; projects cannot be moved between workspaces; reviewers can only record their own decision; sign-offs record the signer as the database knows them; chain checks report only what the caller can see.
22. `21_version_archive_prune_cheap.sql`: a project with a long save history keeps saving. Each archived version stores its item count once, so the clean-up of old versions no longer re-reads every archived copy on every save.

Run this once, on an empty database. It is a fresh-install sequence, not an upgrade script:
`00_schema_baseline.sql` fails if the tables already exist. To upgrade an existing install,
run only the numbered files you have not run yet, in order. `tests/regression_customer_kit_parity.test.js`
in the main repo checks that this list stays in step with the production migrations.

## After install
Then make yourself an administrator. First sign up in the app with that address and confirm it
from the email it sends (keep "Confirm email" switched on in your Supabase project's Auth
settings; it is on by default). Only then, in the Supabase SQL editor or psql:

```sql
insert into private.platform_admins(email) values ('you@yourcompany.com');
```

Do it in that order: the administrator role follows the address, so it must belong to an
account whose address you have confirmed yourself.
That's it for the database. Point the app and the AI proxy at it next (see the
deployment guide).

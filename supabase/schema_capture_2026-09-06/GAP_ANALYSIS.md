# Schema capture & gap analysis — production `fhrqkhdrwbfnizkepkch` (Safety-Lab, us-east-2)
**Captured 6 Sep 2026, read-only, from the live database. Postgres 17.6.**

This is the foundation finding for *no customer data on our cloud*: a customer
cannot stand up their own database until the database can be rebuilt from files in
this repo. Today it cannot — `supabase db push` on a clean project fails, because
the core tables have no `CREATE TABLE` anywhere and the RLS baseline (`0001`) and
the review tables (`0003`/`0004`) all assume those tables already exist.

## The gap in one line
**18 of 24 production base tables have no `CREATE TABLE` in `supabase/migrations/`.**
They were created directly in the Supabase dashboard and never written to a file.

### The 18 tables with NO create-table in the repo (dependency order)
1. `users`            (PK id; populated from auth.users by `handle_new_user`)
2. `workspaces`       (FK owner_id → users)
3. `workspace_members`(FK → workspaces, users)  ← the membership fix lives on this
4. `projects`         (FK → workspaces, users)
5. `project_documents`(FK → projects, users) — the safety-analysis blob
6. `project_crdt`     (FK → projects)          — live collaboration
7. `yjs_documents`    (FK → projects)          — live collaboration
8. `invitations`      (FK → workspaces, users)
9. `workspace_audit`  (FK → workspaces, users)
10. `feedback`        (FK → projects, workspaces, auth.users)
11. `ai_usage`        (FK → users)
12. `ai_org_cache`    (FK → auth.users)         — the AI answer cache
13. `audit_log`       (FK → users; append-only, hash-chained)
14. `license_tokens`  (FK → auth.users)
15. `destruction_certificates`
16. `notification_log`
17. `approved_tenants` (Entra SSO allowlist)
18. `pending_comps`

### The 6 tables the repo DOES create (migrations 0003/0004) — but they still can't apply first
`project_baselines`, `project_document_versions`, `reviews`, `review_assignments`,
`review_comments`, `signoffs`. Every one has a FK to `projects` and/or `users`, so
`0003`/`0004` fail on a clean database until the 18 above exist. **This is why the
baseline must be numbered before `0001`.**

### The 3 tables in the repo that are NOT in production (by design)
`config_baselines`, `config_change_notices`, `config_problem_reports` — all in
`0007_config_management.sql`, which is UNAPPLIED by design (config management is a
future build). A rebuild must skip `0007` unless config management ships.

## What else must be captured into the baseline (all present in the JSON files here)
- **39 functions** — 12 `private.*` RLS helpers (SECURITY DEFINER; a policy reads
  `workspace_members` through them without recursing) + 27 `public` RPCs and trigger
  functions. See `functions.json`.
- **60 RLS policies** across 24 tables. See `policies.json`. RLS is ON for every base
  table. This is the security floor and the part "getting wrong ships a silent
  authorization change" — it must be diffed live-vs-rebuilt, not eyeballed.
- **All constraints** (PK/FK/UNIQUE/CHECK) — `constraints.json`.
- **Non-implicit indexes** (partial indexes on `projects`, `audit_log`, `invitations`)
  — `indexes.json`.
- **20 triggers** — updated_at stamps, the audit/sign-off hash chains, the
  append-only immutability guards, the review-notify webhooks. `triggers.json`.
- **Column detail** (type, nullable, default, identity) — `columns.json`.

## Rules the rebuild must encode in the files themselves
- `0000_schema_baseline` (to be written) creates the 18 tables + their indexes,
  constraints, `set_updated_at`, and the private helpers, in dependency order, RLS
  enabled, BEFORE `0001`.
- `0001` and `0008` must never be applied to *production* (they would create a second
  set of helpers in `public` — a silent authorization downgrade; `0001`'s own header
  says so). On a clean CUSTOMER database the correct order is 0000 → 0001 → … → 0006 →
  (skip 0007) → 0008-equivalent already folded into 0000, then the dated RPC/guard files.
  The exact clean-install order is the deliverable of the "prove it" step.
- `0007` is unapplied by design.

## How this was captured (repeatable, read-only)
Catalog queries via the Supabase MCP: `information_schema.columns`, `pg_constraint`
(`pg_get_constraintdef`), `pg_policies`, `pg_proc`, `pg_indexes`,
`information_schema.triggers`. No production data was read or modified; only structure.

## Next step (needs a throwaway database — Waqas confirmed 6 Sep)
Write `0000_schema_baseline.sql` from these captures, apply 0000→0006,0008 to an EMPTY
throwaway Supabase project, then diff the throwaway's tables/policies/functions against
this capture. "We think it applies" is how the erase_project drift happened — it gets
proven on a clean database or it does not land.

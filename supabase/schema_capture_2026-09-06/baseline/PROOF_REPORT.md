# Baseline proof report — 0000_schema_baseline.sql
**6 Sep 2026. Local rebuild proof. No production change; nothing applied to any Supabase project.**

## What was proven
`0000_schema_baseline.sql` was reconstructed READ-ONLY from production's catalog and applied to a
fresh, empty PostgreSQL 16 database (with Supabase's managed built-ins stubbed — see
`local_stubs.sql`). It applied with `ON_ERROR_STOP=1` and zero errors, then was compared to
production object-by-object.

## Result — the rebuild reproduces production exactly
| Object | Production | Rebuilt | Match |
|---|---|---|---|
| Base tables | 24 | 24 | ✓ |
| Views | 1 (`expiry_watch`) | 1 | ✓ |
| Functions (public+private) | 39 | 39 | ✓ (rebuilt shows 41 incl. 2 local-only stubs) |
| RLS policies | 59 | 59 | ✓ names + **all 59 bodies byte-identical** |
| Triggers | 20 | 20 | ✓ |
| Foreign keys | 35 | 35 | ✓ |
| Check constraints | 14 | 14 | ✓ |
| Tables with RLS enabled | 24 | 24 | ✓ |

The policy-body check is the important one: a wrong `USING` / `WITH CHECK` line is a silent
authorization change. Every one of the 59 round-trips identically (whitespace-normalized diff empty).

## Two things deliberately NOT in the baseline
1. **The service-role JWT is redacted.** Production's three `notify-review` triggers embed a live
   service_role bearer token in plaintext in the schema. It is replaced with `<SERVICE_ROLE_JWT>` and
   must be set per install — and, per the 6 Sep ruling, pointed at the customer's own endpoint, not
   Safety Lab's. **Security finding: rotate that production token; anyone who can read the schema (or
   a captured dump) has full-database access.**
2. **Supabase's managed base is assumed, not created** — the `auth` schema + `auth.uid()`/`auth.jwt()`,
   the roles `anon`/`authenticated`/`service_role`, the `extensions` schema with `pgcrypto`, and
   `supabase_functions.http_request`. A fresh Supabase project provides all of these; the local proof
   stubs them (`local_stubs.sql`).

## What this does and doesn't settle
- SETTLES: the 18-table gap. The schema now rebuilds from ONE file, proven on a clean database.
- STILL OPEN (needs the throwaway Supabase project for real `auth`/roles/`pgcrypto`, not stubs):
  proving the baseline on genuine Supabase, deciding the clean-install order of 0000 vs the existing
  0001–0008 (0001/0008 must never touch production; on a clean DB the baseline already contains their
  end-state, so they become historical), and packaging the edge functions.
- This baseline is a FULL current-state snapshot (a squash), not a diff. It is the source of truth for
  a customer install. Do not apply it to production — production already has this schema.


---

## Throwaway-Supabase proof — 6 Sep 2026 (the high-fidelity pass)
The local proof used stubbed Supabase built-ins. To prove on the real thing, a throwaway
Supabase project (ref `wnnjnnlejvilbvzqvzww`, us-east-2) was created, the baseline applied,
and its object counts compared 1:1 to production `fhrqkhdrwbfnizkepkch`:

| Dimension | Production | Rebuilt | Match |
|---|---|---|---|
| Tables | 24 | 24 | ✓ |
| Views | 1 | 1 | ✓ |
| Functions | 39 | 39 | ✓ |
| RLS policies | 59 | 59 | ✓ |
| Triggers | 20 | 20 | ✓ |
| RLS enabled | 24 | 24 | ✓ |
| Foreign keys | 35 | 35 | ✓ |
| Checks | 14 | 14 | ✓ |
| Indexes | 69 | 69 | ✓ |
| Table grants | 493 | 493 | ✓ |
| Function grants | 77 | 77 | ✓ |

**What the real-Supabase pass caught that local could not:** fresh Supabase auto-grants ALL to
anon/authenticated/service_role on new tables and EXECUTE to PUBLIC on new functions. Production
had revoked those and locked down (append-only tables not writable by anon/authenticated;
sensitive RPCs service_role-only; expiry_watch view service_role-only). The first rebuild came
out OVER-PERMISSIONED (525 table-grants / 117 func-grants). The fix — three REVOKE statements
before the grants (now section `65_revoke_defaults.sql` in the baseline) — brought it to an exact
493 / 77 match. This is the layer local Postgres cannot model, and the reason the throwaway pass
was worth running.

The throwaway project holds no real data and must be deleted from the Supabase dashboard to stop
its $10/mo charge (MCP cannot delete a paid-tier project).

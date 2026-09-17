#!/usr/bin/env bash
# apply.sh — stand up the Safety Lab Aero database on YOUR OWN Postgres/Supabase.
# Usage:  ./apply.sh "postgresql://postgres:PASSWORD@db.YOURREF.supabase.co:5432/postgres"
#
# Runs the four SQL files IN ORDER. Safe to re-run (idempotent create-or-replace).
# Nothing here contacts Safety Lab — this builds YOUR database on YOUR server.
set -euo pipefail
DB_URL="${1:-${DATABASE_URL:-}}"
if [ -z "$DB_URL" ]; then echo "Give your database connection string as the first argument (or set DATABASE_URL)."; exit 1; fi
HERE="$(cd "$(dirname "$0")" && pwd)"
for f in 00_schema_baseline 01_ws_members_admin_cannot_mint_owner 02_drop_hardcoded_platform_admins 03_collab_field_edit_locks 04_harden_api_surface 05_change_journal_problem_events 06_grants_lockdown 07_verify_functions 08_user_secrets_vault 09_audit_writers_and_ledger_lockdown  10_scheduled_chain_verification 11_truncate_grants_lockdown; do
  echo "==> applying $f.sql"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/$f.sql"
done
echo "Done. Your database is ready. Add yourself as a platform admin with:"
echo "  insert into private.platform_admins(email) values ('you@yourcompany.com');"

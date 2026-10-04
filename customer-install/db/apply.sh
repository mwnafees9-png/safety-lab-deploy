#!/usr/bin/env bash
# apply.sh — stand up the Safety Lab Aero database on YOUR OWN Postgres/Supabase.
# Usage (preferred, keeps the password out of the process list):
#   DATABASE_URL="postgresql://postgres:PASSWORD@db.YOURREF.supabase.co:5432/postgres" ./apply.sh
# Also accepted, but the address is then visible to other users of this machine while it runs:
#   ./apply.sh "postgresql://postgres:PASSWORD@db.YOURREF.supabase.co:5432/postgres"
#
# Runs the SQL files IN ORDER on an EMPTY database. Fresh install only: 00 fails if the tables exist.
# To upgrade an existing install, run only the numbered files you have not run yet, in order.
# Nothing here contacts Safety Lab — this builds YOUR database on YOUR server.
set -euo pipefail
DB_URL="${1:-${DATABASE_URL:-}}"
if [ -z "$DB_URL" ]; then echo "Give your database connection string in DATABASE_URL (or as the first argument)."; exit 1; fi
# 3 Oct 2026 (security review, batch 3): the password used to ride on every psql command line,
# where any other user of the machine can read it (ps). It now goes to psql in PGPASSWORD, and
# the address psql sees carries no password.
re='^(postgres(ql)?://)([^:@/]*)(:([^@]*))?@(.*)$'
if [[ "$DB_URL" =~ $re ]]; then
  _pw="${BASH_REMATCH[5]}"
  if [ -n "$_pw" ]; then export PGPASSWORD="$(printf '%b' "${_pw//%/\\x}")"; fi
  DB_URL="${BASH_REMATCH[1]}${BASH_REMATCH[3]}@${BASH_REMATCH[6]}"
  unset _pw
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
for f in 00_schema_baseline 01_ws_members_admin_cannot_mint_owner 02_drop_hardcoded_platform_admins 03_collab_field_edit_locks 04_harden_api_surface 05_change_journal_problem_events 06_grants_lockdown 07_verify_functions 08_user_secrets_vault 09_audit_writers_and_ledger_lockdown  10_scheduled_chain_verification 11_truncate_grants_lockdown 12_drop_dead_ai_usage 13_chain_serialization 14_acknowledged_chain_breaks 15_erasure_completeness 16_workspace_member_directory 17_auth_signup_trigger 18_verify_wrappers_match_inner 19_realtime_private_channels 20_access_rules_hardening 21_version_archive_prune_cheap; do
  echo "==> applying $f.sql"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/$f.sql"
done
echo "Done. Your database is ready. Next: sign up in the app with your own address and confirm it"
echo "from the email (keep 'Confirm email' on in your Auth settings). Only then make it administrator:"
echo "  insert into private.platform_admins(email) values ('you@yourcompany.com');"

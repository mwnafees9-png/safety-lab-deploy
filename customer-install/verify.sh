#!/usr/bin/env bash
# verify.sh — check a Safety Lab Aero install stood up correctly on YOUR database.
# Usage:  ./verify.sh "postgresql://postgres:PASSWORD@db.YOURREF.supabase.co:5432/postgres"
# Reads nothing from Safety Lab; only inspects YOUR database.
set -uo pipefail
DB_URL="${1:-${DATABASE_URL:-}}"
[ -z "$DB_URL" ] && { echo "Give your database connection string as the first argument (or set DATABASE_URL)."; exit 1; }
q(){ psql "$DB_URL" -tAqc "$1" 2>/dev/null; }
fail=0
if [ "$(q 'select 1')" != "1" ]; then echo "  X   cannot connect to the database — check the connection string."; exit 2; fi
echo "Connected. Checking the install..."
ck_table(){ if [ "$(q "select 1 from information_schema.tables where table_schema='$1' and table_name='$2' limit 1")" = "1" ]; then echo "  ok    table $1.$2"; else echo "  X     MISSING table $1.$2"; fail=1; fi; }
ck_fn(){ if [ "$(q "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='$1' and p.proname='$2' limit 1")" = "1" ]; then echo "  ok    function $1.$2"; else echo "  X     MISSING function $1.$2"; fail=1; fi; }
for t in users workspaces workspace_members projects project_documents change_journal problem_report_events; do ck_table public "$t"; done
ck_table private platform_admins
ck_fn private is_workspace_member
ck_fn public verify_change_journal
rls=$(q "select relrowsecurity from pg_class where relname='projects' and relnamespace='public'::regnamespace")
if [ "$rls" = "t" ]; then echo "  ok    row-level security on public.projects"; else echo "  X     row-level security is OFF on public.projects"; fail=1; fi
echo "  info  platform admins configured: $(q 'select count(*) from private.platform_admins')"
echo
if [ "$fail" = "0" ]; then
  echo "All checks passed — your database is ready."
  echo "Next: load slab_env.js in the app and run  SLConfigEgress()  in the browser console to confirm"
  echo "the app only talks to YOUR servers."
  exit 0
else
  echo "Some checks failed. Re-run ./apply.sh against this database, then verify again."
  exit 1
fi

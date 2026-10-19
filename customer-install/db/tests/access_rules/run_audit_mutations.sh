#!/usr/bin/env bash
# SEC-0b mutation proof (18 Oct 2026): each line breaks one guarded piece of 23_workspace_audit_events.sql in a
# copy of the kit; checks_audit.txt must then fail. Same Postgres as run_proof.sh.
#   PGHOST=... PGUSER=postgres bash run_audit_mutations.sh
set -u
W="$(cd "$(dirname "$0")" && pwd)"; KIT0=${KIT:-$W/../..}
F=23_workspace_audit_events.sql
MUT=(
"  raise warning 'workspace_audit: % on % not recorded: %', p_event, p_ws, sqlerrm;~  raise;~a failed audit write fails the action"
"coalesce(p_details, '{}'::jsonb) || jsonb_build_object('source', 'database'));~coalesce(p_details, '{}'::jsonb));~database rows not marked"
"if new.role is distinct from old.role then~if true then~a save without a role change is recorded as one"
"'when (new.last_sign_in_at is distinct from old.last_sign_in_at) execute~'execute~any change to the account row counts as a sign-in"
"using (private.can_admin_workspace(workspace_id) or user_id = (select auth.uid()));~using (private.is_workspace_member(workspace_id));~every member reads everyone's activity"
"revoke insert, select on public.workspace_audit from anon;~select 1;~visitors keep their grants"
"     and not exists (select 1 from public.workspaces w where w.id = old.workspace_id) then~     then~rows of a live workspace can be deleted"
"  if tg_op = 'DELETE' and tg_table_name = 'workspace_audit'~  if false and tg_op = 'DELETE' and tg_table_name = 'workspace_audit'~account erasure blocked by its own activity rows"
"          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('source', 'app'));~          p_details);~app reports not marked"
"  elsif old.accepted_at is null then~  else~deleting an accepted invitation counts as a withdrawal"
"    perform private.ws_audit_write(r.workspace_id, 'user.signed_in'~    perform private.ws_audit_write(null, 'user.signed_in'~sign-ins not written"
)
red=0; n=0
for m in "${MUT[@]}"; do
  IFS='~' read -r from to what <<< "$m"; n=$((n+1))
  K=$(mktemp -d); cp "$KIT0"/*.sql "$K"/
  python3 - "$K/$F" "$from" "$to" <<'PY' || { echo "  ?     $what (pattern not found)"; continue; }
import sys; p,a,b=sys.argv[1:4]; s=open(p).read()
if s.count(a)!=1: sys.exit(1)
open(p,'w').write(s.replace(a,b))
PY
  if KIT="$K" DB=proofm bash "$W/run_proof.sh" checks_audit.txt >/tmp/slab_mut.out 2>&1; then echo "  GREEN $what"; else red=$((red+1)); echo "  RED   $what :: $(grep FAIL /tmp/slab_mut.out | head -1 | cut -c1-110)"; fi
  rm -rf "$K"
done
echo "== $red/$n mutations caught"
[ $red -eq $n ]

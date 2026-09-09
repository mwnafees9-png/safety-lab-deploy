-- Stage 3 gold-star — SERVER-SIDE content-verify for the append-only logs.
-- The client can only check chain LINKAGE (prev_hash <-> row_hash of fetched rows). These
-- functions run inside Postgres, where jsonb/timestamptz render EXACTLY as the chain trigger saw
-- them, so they re-hash every row from its own fields and catch CONTENT tampering, not just
-- deletion/reorder. Same shape as the existing private.verify_signoff_chain. Member-gated
-- (SECURITY DEFINER bypasses RLS, so we check membership explicitly) and per-project.

create or replace function public.verify_change_journal(p_project uuid)
  returns table(ok boolean, first_bad_id bigint, checked bigint)
  language plpgsql
  security definer
  set search_path to 'public','extensions','pg_temp'
as $function$
declare
  r record; expected_prev text := ''; computed text; bad bigint := null; cnt bigint := 0; v_ws uuid;
begin
  select workspace_id into v_ws from public.projects where id = p_project;
  if v_ws is null or not private.is_workspace_member(v_ws) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  for r in select * from public.change_journal where project_id = p_project order by id asc loop
    cnt := cnt + 1;
    if coalesce(r.prev_hash,'') is distinct from expected_prev then bad := r.id; exit; end if;
    computed := encode(digest(
        coalesce(r.prev_hash,'') || coalesce(r.project_id::text,'') || coalesce(r.actor::text,'')
        || coalesce(r.actor_email,'')
        || coalesce(r.action,'') || coalesce(r.entity_kind,'') || coalesce(r.entity_id,'')
        || coalesce(r.summary::text,'') || coalesce(r.ts::text,''), 'sha256'), 'hex');
    if computed is distinct from r.row_hash then bad := r.id; exit; end if;
    expected_prev := r.row_hash;
  end loop;
  return query select (bad is null), bad, cnt;
end $function$;

create or replace function public.verify_problem_events(p_project uuid)
  returns table(ok boolean, first_bad_id bigint, checked bigint)
  language plpgsql
  security definer
  set search_path to 'public','extensions','pg_temp'
as $function$
declare
  r record; expected_prev text := ''; computed text; bad bigint := null; cnt bigint := 0; v_ws uuid;
begin
  select workspace_id into v_ws from public.projects where id = p_project;
  if v_ws is null or not private.is_workspace_member(v_ws) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  for r in select * from public.problem_report_events where project_id = p_project order by id asc loop
    cnt := cnt + 1;
    if coalesce(r.prev_hash,'') is distinct from expected_prev then bad := r.id; exit; end if;
    computed := encode(digest(
        coalesce(r.prev_hash,'') || coalesce(r.project_id::text,'') || coalesce(r.report_id,'')
        || coalesce(r.event,'') || coalesce(r.actor::text,'') || coalesce(r.actor_email,'')
        || coalesce(r.payload::text,'')
        || coalesce(r.ts::text,''), 'sha256'), 'hex');
    if computed is distinct from r.row_hash then bad := r.id; exit; end if;
    expected_prev := r.row_hash;
  end loop;
  return query select (bad is null), bad, cnt;
end $function$;

-- Members may run the check; keep it off the anonymous surface.
revoke all on function public.verify_change_journal(uuid)  from public, anon;
revoke all on function public.verify_problem_events(uuid)  from public, anon;
grant execute on function public.verify_change_journal(uuid)  to authenticated;
grant execute on function public.verify_problem_events(uuid)  to authenticated;

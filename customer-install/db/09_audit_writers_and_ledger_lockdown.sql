-- Audit writers + append-only lockdown for a customer-hosted install (16 Sep 2026)
--
-- WHY THIS EXISTS AS A SEPARATE FILE. The main repo hardened the audit tables in
-- supabase/migrations/0002 and 0005, which are NOT part of this bundle. So a customer-hosted
-- install -- the deployment SL-WP-0003 section 17 is describing when it says "the deployment's
-- own database" -- shipped with UPDATE, DELETE and TRUNCATE all granted on both audit tables.
-- Demonstrated, not theorised: on a real install of this bundle, as an ordinary `authenticated`
-- role, `truncate public.audit_log` succeeded and left zero rows. TRUNCATE ignores row-level
-- policies and does not fire row triggers, so neither RLS nor audit_immutable stops it.
--
-- This file also adds the writers and the verifier, so a customer install records the workspace
-- and review activity the white paper says it records, and can verify the chain on demand.
--
-- Apply order: after 08_user_secrets_vault.sql. Safe to re-run.

create or replace function private.verify_audit_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint)
language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare r record; expected_prev text := ''; computed text; bad bigint := null; cnt bigint := 0;
begin
  for r in select * from public.audit_log order by id asc loop
    cnt := cnt + 1;
    if coalesce(r.prev_hash,'') is distinct from expected_prev then bad := r.id; exit; end if;
    computed := encode(digest(
        coalesce(r.prev_hash,'') || coalesce(r.user_id::text,'') || coalesce(r.feature,'')
        || coalesce(r.model,'') || coalesce(r.tokens_in::text,'') || coalesce(r.tokens_out::text,'')
        || coalesce(r.ts::text,''), 'sha256'), 'hex');
    if computed is distinct from r.row_hash then bad := r.id; exit; end if;
    expected_prev := r.row_hash;
  end loop;
  return query select (bad is null), bad, cnt;
end $function$;

create or replace function public.verify_audit_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint)
language sql security definer set search_path to 'public', 'pg_temp'
as $function$ select * from private.verify_audit_chain() $function$;

-- SECURITY INVOKER here would fail for every real user: `authenticated` has no USAGE on the
-- private schema, so the wrapper raises "permission denied for schema private" rather than
-- returning a result. That was the live bug on the hosted side.
create or replace function public.verify_signoff_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint)
language sql security definer set search_path to 'public', 'pg_temp'
as $function$ select * from private.verify_signoff_chain() $function$;

create or replace function public.audit_workspace_event(
  p_workspace uuid, p_event text, p_target uuid default null, p_details jsonb default null
) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if private.workspace_role(p_workspace) is null then raise exception 'not a member of that workspace'; end if;
  if p_event is null or length(trim(p_event)) = 0 then raise exception 'event type is required'; end if;
  insert into public.workspace_audit (workspace_id, user_id, event_type, target_id, details)
  values (p_workspace, auth.uid(), left(trim(p_event), 64), p_target, p_details);
end $function$;

-- No column here takes a prompt or a response, and none is offered. On a customer-hosted install
-- the audit lives in the customer's own database and still must not accumulate their content.
-- CONTENT NEVER GOES IN. audit_log has no column for a prompt or a response and this function
-- offers no way to add one. In a customer-hosted install the database is the customer's own, and
-- an audit record carrying prompts would put their content somewhere they never chose to put it.
create or replace function public.audit_ai_call(
  p_feature text, p_model text, p_tokens_in int default null, p_tokens_out int default null,
  p_weighted numeric default null, p_itar boolean default false,
  p_latency_ms int default null, p_ok boolean default true, p_error text default null
) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.audit_log (user_id, feature, model, tokens_in, tokens_out, weighted_cost,
                                itar, latency_ms, ok, error)
  values (auth.uid(), left(coalesce(p_feature,''), 64), left(coalesce(p_model,''), 64),
          p_tokens_in, p_tokens_out, p_weighted, coalesce(p_itar,false), p_latency_ms,
          coalesce(p_ok,true), left(p_error, 500));
end $function$;

revoke execute on function public.verify_audit_chain()   from public, anon;
revoke execute on function public.verify_signoff_chain() from public, anon;
revoke execute on function public.audit_workspace_event(uuid, text, uuid, jsonb) from public, anon;
revoke execute on function public.audit_ai_call(text, text, int, int, numeric, boolean, int, boolean, text) from public, anon;
grant  execute on function public.verify_audit_chain()   to authenticated;
grant  execute on function public.verify_signoff_chain() to authenticated;
grant  execute on function public.audit_workspace_event(uuid, text, uuid, jsonb) to authenticated;
grant  execute on function public.audit_ai_call(text, text, int, int, numeric, boolean, int, boolean, text) to authenticated;

-- The lockdown this bundle never had. INSERT and SELECT stay; nothing else.
revoke update, delete, truncate on public.audit_log                from anon, authenticated;
revoke update, delete, truncate on public.workspace_audit          from anon, authenticated;
revoke update, delete, truncate on public.signoffs                 from anon, authenticated;
revoke update, delete, truncate on public.project_baselines        from anon, authenticated;
revoke update, delete, truncate on public.destruction_certificates from anon, authenticated;

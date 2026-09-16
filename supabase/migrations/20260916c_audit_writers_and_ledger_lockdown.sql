-- The audit log had everything except entries, and append-only had a hole (16 Sep 2026)
--
-- SL-WP-0003 Data Security v3.0 section 17, already in Radia's hands, says the audit log is
-- hash-chained and append-only, that append-only is "enforced at the database-privilege level
-- rather than by convention -- update, delete, and truncate are revoked", that it is "verified on
-- a schedule and on demand", and lists tamper-evident audit logging among SOC 2 controls
-- "already operating". Checked against the running databases, three things were wrong.
--
-- 1. NOTHING EVER WROTE AN ENTRY. No function inserted into audit_log, no trigger wrote one, both
--    audit tables held ZERO rows, and there was no verifier at all. The table, the chain trigger,
--    the immutability trigger and the read policies all existed and were correct. The vault was
--    built and locked and nothing was ever put in it.
--
-- 2. THE ON-DEMAND VERIFICATION ERRORED FOR EVERY USER. public.verify_signoff_chain was SECURITY
--    INVOKER calling into the private schema, which `authenticated` has no USAGE on. The client
--    calls it (misc_fn_modules), so the trust page's "the chain can be re-verified on demand" was
--    a button that returned "permission denied for schema private". Missed on the first pass here
--    because verifying as a privileged role works; it has to be run as the role that calls it.
--
-- 3. APPEND-ONLY MEANT APPEND-ONLY EXCEPT TRUNCATE. Production had UPDATE and DELETE revoked on
--    the two audit tables, but TRUNCATE was still granted to anon and authenticated on signoffs,
--    project_baselines and destruction_certificates -- the tamper-evident chain, the immutable
--    baselines and the certificates of destruction could each be wiped wholesale. TRUNCATE is the
--    dangerous one: row policies do not apply to it and row triggers do not fire, so neither RLS
--    nor audit_immutable sees it. DEMONSTRATED on the throwaway project, where the customer-install
--    schema has no lockdown at all: as an ordinary `authenticated` role, `truncate
--    public.audit_log` succeeded and left zero rows. The customer bundle is what a customer-hosted
--    install runs, which is exactly the deployment section 17 is describing.
--
-- Nothing legitimately updates or deletes these tables. The client only inserts sign-offs and
-- baselines; the erase path is SECURITY DEFINER and runs as the owner, unaffected by these
-- revokes; and no database function updates or deletes any of them.

begin;

-- ---- 1. the verifier the paper says exists ---------------------------------------------------
create or replace function private.verify_audit_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
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

-- ---- 2. both public wrappers must be DEFINER, or a real user cannot call them -----------------
-- Definer is safe here: these return only (ok, first_bad_id, checked). No row content crosses the
-- boundary, so a caller learns whether the chain holds and nothing else.
create or replace function public.verify_audit_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint)
language sql security definer set search_path to 'public', 'pg_temp'
as $function$ select * from private.verify_audit_chain() $function$;

create or replace function public.verify_signoff_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint)
language sql security definer set search_path to 'public', 'pg_temp'
as $function$ select * from private.verify_signoff_chain() $function$;

revoke execute on function public.verify_audit_chain()   from public, anon;
revoke execute on function public.verify_signoff_chain() from public, anon;
grant  execute on function public.verify_audit_chain()   to authenticated, service_role;
grant  execute on function public.verify_signoff_chain() to authenticated, service_role;

-- ---- 3. the writers --------------------------------------------------------------------------
-- DEFINER with auth.uid() stamped server side, so the actor on the row is the actor who called.
-- Membership is required, so nobody writes noise into a workspace history they are not part of.
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

-- CONTENT NEVER GOES IN. audit_log has no column for a prompt or a response and this function
-- offers no way to add one. Waqas's rule is that customer data never touches Safety Lab's cloud,
-- and an audit record carrying prompts would break it in the name of accountability.
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

revoke execute on function public.audit_workspace_event(uuid, text, uuid, jsonb) from public, anon;
revoke execute on function public.audit_ai_call(text, text, int, int, numeric, boolean, int, boolean, text) from public, anon;
grant  execute on function public.audit_workspace_event(uuid, text, uuid, jsonb) to authenticated, service_role;
grant  execute on function public.audit_ai_call(text, text, int, int, numeric, boolean, int, boolean, text) to authenticated, service_role;

-- ---- 4. close the TRUNCATE hole on every append-only ledger -----------------------------------
revoke update, delete, truncate on public.audit_log                from anon, authenticated;
revoke update, delete, truncate on public.workspace_audit          from anon, authenticated;
revoke update, delete, truncate on public.signoffs                 from anon, authenticated;
revoke update, delete, truncate on public.project_baselines        from anon, authenticated;
revoke update, delete, truncate on public.destruction_certificates from anon, authenticated;

commit;

-- ---- PROVEN ON THE THROWAWAY PROJECT (yiisexbngnjakkqkmctw), 16 Sep 2026 ---------------------
-- As role `authenticated` with a real JWT: both writers insert; both chains verify (they errored
-- before); TRUNCATE and DELETE are refused on all five ledgers, ten for ten, where TRUNCATE of
-- audit_log had succeeded minutes earlier; writing into a workspace the caller is not in is
-- refused; and the inserts the app actually makes (sign-off, baseline) still work.
-- PRODUCTION IS NOT TOUCHED BY THIS FILE.

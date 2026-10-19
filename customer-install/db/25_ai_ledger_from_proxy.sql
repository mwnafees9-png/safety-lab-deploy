-- ============================================================================
-- 25 — the AI proxy writes the AI ledger row itself (SEC-3b, 18 Oct 2026). Twin of
-- supabase/migrations/20261018d_ai_ledger_from_proxy.sql; see it for the reasoning.
-- ============================================================================
alter table public.audit_log add column if not exists source text not null default 'app';
do $chk$
begin
  if not exists (select 1 from pg_constraint where conname = 'audit_log_source_known' and conrelid = 'public.audit_log'::regclass) then
    alter table public.audit_log add constraint audit_log_source_known check (source in ('app', 'proxy'));
  end if;
end $chk$;

create or replace function public.audit_ai_call_observed(
  p_user uuid, p_feature text, p_model text,
  p_tokens_in integer default null, p_tokens_out integer default null, p_weighted numeric default null,
  p_itar boolean default false, p_latency_ms integer default null, p_ok boolean default true, p_error text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- every ledger row belongs to a person (audit_log.user_id is NOT NULL): the proxy only writes for a
  -- caller it knows, and a user the database does not know is refused loudly (the proxy logs it)
  if p_user is null or not exists (select 1 from public.users u where u.id = p_user) then
    raise exception 'audit_ai_call_observed: unknown user %', p_user using errcode = '23503';
  end if;
  insert into public.audit_log (user_id, feature, model, tokens_in, tokens_out, weighted_cost,
                                itar, latency_ms, ok, error, source)
  values (p_user,
          left(coalesce(p_feature, ''), 64), left(coalesce(p_model, ''), 64),
          p_tokens_in, p_tokens_out, p_weighted, coalesce(p_itar, false), p_latency_ms,
          coalesce(p_ok, true), left(p_error, 500), 'proxy');
end $function$;

revoke execute on function public.audit_ai_call_observed(uuid, text, text, integer, integer, numeric, boolean, integer, boolean, text) from public, anon, authenticated;
grant  execute on function public.audit_ai_call_observed(uuid, text, text, integer, integer, numeric, boolean, integer, boolean, text) to service_role;

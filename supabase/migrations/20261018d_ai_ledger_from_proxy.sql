-- ============================================================================
-- 18 Oct 2026 — SEC-3b: the AI proxy writes the AI ledger row itself.
-- STATUS: APPLIED IN PRODUCTION 18 Oct 2026 on Waqas's go. The 165 existing rows read source 'app'; the
--   chain verifies clean after (165 checked, 12 segments). Customer kit: 25_ai_ledger_from_proxy.sql.
-- Apply BEFORE the proxy deploy that calls it; the app change is safe in any order (it only stops writing
-- its own row when the proxy says it wrote one).
--
-- WHAT WAS WRONG: every public.audit_log row was written by the BROWSER (audit_ai_call), so the ledger
-- recorded whatever the browser said: its model, its token counts, its ITAR flag, its feature name.
-- The proxy sees what actually happened and now records it (worker.js, SEC-3b), through this function.
--
-- WHAT THIS DOES
--   1. audit_log.source: 'proxy' for a row the proxy wrote from what it saw, 'app' for a row the app
--      reported (every row before today, and calls that never pass the proxy: a key held on the desktop,
--      a browser-only key, or a request the proxy refused before it reached the AI). Added with a
--      constant default, so no existing row is rewritten and the append-only trigger is not touched.
--      NOT in the row hash: the chain covers user, feature, model, tokens and time, as before; widening
--      it (itar, latency, outcome, source) is SEC-0d, which waits for Waqas's decision.
--   2. public.audit_ai_call_observed(...): the proxy's writer. Service role only: no signed-in person
--      and no visitor can call it, so nobody can write a row that claims the proxy saw it.
--      Every ledger row belongs to a person (audit_log.user_id is NOT NULL, unchanged), so the proxy writes
--      only for a caller it knows (every hosted licence has a user: 7 of 7 on 18 Oct 2026) and leaves any
--      other call to the app as before; a user the database does not know is refused with an error the
--      proxy logs.
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

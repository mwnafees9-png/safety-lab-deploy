-- 20260923a — drop the dead per-user AI meter.
--
-- public.ai_usage and public.increment_ai_usage(uuid, text, numeric) are the FIRST design of
-- AI metering (per user, per month). It was superseded by metering on the licence row:
-- license_tokens.tokens_used_this_month, moved by public.consume_tokens(text, bigint), which the
-- AI proxy (safety-lab-proxy-deploy/worker.js) calls after every request and which is what
-- returns "allowance_exhausted". Nothing in any of the three repos calls increment_ai_usage;
-- nothing reads ai_usage; the 17 Sep sweep listed it as "a writer with no caller".
--
-- A meter that exists and is never written is an audit finding waiting to recur (it already
-- recurred once). Remove it rather than document it. If a per-user view of AI spend is ever
-- wanted, it is a query over license_tokens, not a second ledger.
--
-- Idempotent; safe on a database that never had either object.

drop function if exists public.increment_ai_usage(uuid, text, numeric);
drop table if exists public.ai_usage cascade;

do $$
begin
  if to_regclass('public.ai_usage') is not null then raise exception 'ai_usage still exists'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'increment_ai_usage') then
    raise exception 'increment_ai_usage still exists';
  end if;
end $$;

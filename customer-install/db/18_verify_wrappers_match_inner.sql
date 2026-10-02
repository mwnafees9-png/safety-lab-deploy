-- ============================================================================
-- 20261002a_verify_wrappers_match_inner.sql — the two public chain-check wrappers broke on 29 Sep
--
-- 20260929a widened private.verify_audit_chain() and private.verify_signoff_chain() from three
-- columns to five (segments, acknowledged). The public wrappers that every signed-in user calls
-- ("select * from private.<fn>()") were left declaring the old three, and Postgres refuses a SQL
-- function whose final statement returns more columns than declared. Since then both public
-- calls fail with "return type mismatch in function declared to return record": the app's
-- Verify ledger button has shown "Could not verify ledger" and a reviewer calling
-- verify_audit_chain() by hand got the same. The scheduled check was unaffected (it calls the
-- private functions directly). Found 2 Oct 2026 proving the customer kit on a self-hosted stack.
--
-- Fix: drop and recreate the wrappers with the five-column shape. Grants as before: signed-in
-- users and the service role, never anon. The drop is needed because CREATE OR REPLACE cannot
-- change a function's return type.
--
-- Also here: ai_cache_put was revoked from "public" on 16 Sep but anon still held EXECUTE
-- through the role's own default privilege. Nothing anonymous should write the AI cache.
-- ============================================================================

drop function if exists public.verify_audit_chain();
create function public.verify_audit_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint, segments bigint, acknowledged bigint)
language sql security definer set search_path to 'public', 'pg_temp'
as $function$ select * from private.verify_audit_chain() $function$;

drop function if exists public.verify_signoff_chain();
create function public.verify_signoff_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint, segments bigint, acknowledged bigint)
language sql security definer set search_path to 'public', 'pg_temp'
as $function$ select * from private.verify_signoff_chain() $function$;

revoke execute on function public.verify_audit_chain()   from public, anon;
revoke execute on function public.verify_signoff_chain() from public, anon;
grant  execute on function public.verify_audit_chain()   to authenticated, service_role;
grant  execute on function public.verify_signoff_chain() to authenticated, service_role;

revoke execute on function public.ai_cache_put(text, text, jsonb, uuid, uuid) from anon;

-- Prove it in the same transaction: both wrappers must run.
do $check$
declare a record; s record;
begin
  select * into a from public.verify_audit_chain();
  select * into s from public.verify_signoff_chain();
  raise notice 'verify_audit_chain ok=% checked=%; verify_signoff_chain ok=% checked=%', a.ok, a.checked, s.ok, s.checked;
end $check$;

-- ============================================================================
-- 26: public.am_i_server_admin(): may the signed-in person manage THIS server? (21 Oct 2026)
-- Customer servers only (kit-only; see tests/regression_customer_kit_parity.test.js).
--
-- The server's AI service lets its administrator set the AI key from inside the app
-- (selfhost/ai-proxy/server_key.mjs). It asks this function, with the caller's own session token,
-- whether the caller is the administrator. The answer is the same rule every admin-only table
-- already uses (private.is_safety_lab_admin(): the signed-in address is in private.platform_admins),
-- exposed because the private schema is not reachable over the API. It returns only true or false
-- for the caller themselves; it reveals nothing about anyone else.
-- ============================================================================
create or replace function public.am_i_server_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(private.is_safety_lab_admin(), false);
$function$;
revoke all on function public.am_i_server_admin() from public, anon;
grant execute on function public.am_i_server_admin() to authenticated;

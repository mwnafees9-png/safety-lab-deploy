-- 20260907191000_drop_hardcoded_platform_admins.sql
-- 7 Sep 2026 — remove the two hard-coded super-admin emails from is_safety_lab_admin().
--
-- The old function embedded specific admin emails directly in its body. This replaces
-- that with a table each
-- install owns: private.platform_admins. A fresh customer install starts EMPTY (no
-- platform admins) — the operator adds their own. Safety Lab's own hosted/demo project
-- is seeded separately, OUT of this file, so the seed never travels to a customer.
--
-- Gates three policies: feedback + notification_log (select-admin) and approved_tenants (ALL).

create table if not exists private.platform_admins (
  email     text primary key,
  added_at  timestamptz not null default now()
);

-- private schema is never exposed to the API roles; deny explicitly regardless.
revoke all on private.platform_admins from anon, authenticated;

create or replace function private.is_safety_lab_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select coalesce((auth.jwt() ->> 'email') in (select email from private.platform_admins), false);
$function$;

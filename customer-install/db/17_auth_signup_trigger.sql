-- ============================================================================
-- 17_auth_signup_trigger.sql — the sign-up trigger the kit was missing (2 Oct 2026)
--
-- WHY THIS EXISTS. public.workspaces.owner_id points at public.users, and the row in
-- public.users is created by a trigger on auth.users (the sign-in service's own table) the
-- moment someone signs up. The 6 Sep capture that became 00_schema_baseline.sql recorded only
-- the public and private schemas, so the kit shipped handle_new_user() but never the trigger
-- that calls it. Found 2 Oct 2026 while proving the kit on the self-hosted Supabase stack:
-- sign-up succeeded, then every workspace insert failed with a foreign-key error.
--
-- The function is also replaced with a customer-install version. The hosted one carries
-- Safety Lab's own trial and partner rules (tier by email domain, a 10-day trial), which mean
-- nothing on a customer install: there the signed licence file is the only authority on tier
-- and the app ignores users.tier / users.trial_ends_at (helpers_modules getLicenseTier,
-- _syncEntitlementFromServer). Every user gets tier 'enterprise' and no trial clock.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    new_workspace_id uuid;
begin
    insert into public.users (id, email, tier, trial_ends_at)
    values (new.id, new.email, 'enterprise', null)
    on conflict (id) do nothing;

    insert into public.workspaces (name, owner_id, is_personal)
    values ('Personal', new.id, true)
    returning id into new_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (new_workspace_id, new.id, 'owner');

    return new;
end $function$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Users who signed up before this file ran (an install built from an earlier kit) have no
-- public.users row yet. Give them one, and a personal workspace, the same way the trigger would.
do $backfill$
declare r record; ws uuid;
begin
  for r in select u.id, u.email from auth.users u left join public.users p on p.id = u.id where p.id is null loop
    insert into public.users (id, email, tier, trial_ends_at) values (r.id, r.email, 'enterprise', null);
    insert into public.workspaces (name, owner_id, is_personal) values ('Personal', r.id, true) returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws, r.id, 'owner');
    raise notice 'backfilled user % with a personal workspace', r.email;
  end loop;
end $backfill$;

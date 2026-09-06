-- ============================================================================
-- 05 Sep 2026 — S1. Close the cross-tenant membership hole; make ownership real.
-- STATUS: READY TO APPLY, AWAITING WAQAS. NOT YET APPLIED.
--
-- RUN THE PRE-FLIGHT QUERY AT THE BOTTOM OF THIS FILE FIRST. This migration
-- shuts the door; it does not remove anyone who already walked through it.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT
--
--   0001_rls_baseline.sql:109
--     create policy ws_members_self_join on public.workspace_members
--       for insert to public with check (auth.uid() = user_id);
--
-- That is the whole condition. It asks whose row it is and never asks WHICH
-- WORKSPACE. Permissive INSERT policies OR together, so any signed-in user who
-- learns a workspace id can insert themselves into it at any role, including
-- owner, and then read, write and delete everything in that tenant. Verified
-- live in pg_policies on 5 Sep 2026; no trigger constrains it.
--
-- 0008 re-emitted every OTHER workspace_members policy under the private schema
-- and left this one alone, so the 0001 version is still the live one.
--
-- WHY IT SURVIVED THREE REVIEWS, which is the reusable part: the audit suite
-- (regression_h8_rls_disk_sync) walks 0001 and only considers policies whose
-- line contains one of the seven helper names, because its job was to prove the
-- private-schema qualification. `auth.uid() = user_id` names no helper, so the
-- one broken policy was invisible to the check BY CONSTRUCTION. That suite is
-- widened in the same commit as this file: every policy 0001 defines must now be
-- accounted for, re-emitted or deliberately listed, whether or not it calls a
-- helper.
--
-- ---------------------------------------------------------------------------
-- WHAT WAQAS RULED (5 Sep 2026)
--
--   "whoever creates the workspace should be automatically assigned as the
--    owner/admin of the workspace, only they should be the ones allowed to
--    invite people into the workspace, unless admin roles are assigned to
--    additional people in the workspace by the owner. People cannot enter a
--    workspace without an invite."
--   "Owner should be the only person allowed to transfer ownership."
--   "Admins should not be able to evict the owner, unless ownership has been
--    transferred."
--
-- For comparison (researched 5 Sep): Jama Connect has no self-join path at all —
-- access is granted by an organization or project administrator, to users or
-- groups, inheriting organization -> project -> folder -> item. Safety Lab's
-- creator-becomes-owner-plus-invite model is deliberately friendlier and still
-- closes the hole, because the ONLY self-service action left is "create a
-- workspace and be its owner".
--
-- ---------------------------------------------------------------------------
-- WHY A NEW HELPER RATHER THAN INLINE SQL
--
-- Waqas first ruled "I do not want helpers, I want it by policy". That cannot be
-- done: the seven helpers are SECURITY DEFINER precisely so a policy can read
-- workspace_members without recursing into that table's own RLS — 0008 says so
-- in its own comment. Inlining makes the membership policies recurse, and every
-- project read and write in the product passes through them. Put back to him as
-- "can this be fixed properly THROUGH helpers?" — answer yes, and it is the
-- smaller change. This adds ONE helper, matching the seven that exist.
--
-- It has to read workspaces.owner_id rather than a role, because at the moment
-- of creation the creator is not yet a member: is_workspace_owner() reads
-- workspace_members and would answer false for the very row being inserted.
-- ============================================================================

-- ---- 1. The eighth helper --------------------------------------------------
-- SECURITY DEFINER so it can see public.workspaces without tripping that table's
-- own RLS; search_path pinned, as with the other seven (#262).
create or replace function private.owns_workspace(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select w.owner_id = auth.uid() from public.workspaces w where w.id = p_workspace),
    false);
$$;

-- Never NULL — the 20260831c lesson. A NULL here would make a policy expression
-- NULL, which Postgres treats as "not permitted" for a WITH CHECK but which is
-- indistinguishable from a real answer when someone reads the code.
revoke execute on function private.owns_workspace(uuid) from anon, public;
grant  execute on function private.owns_workspace(uuid) to authenticated, service_role;

-- ---- 2. An owner can always see their own workspace ------------------------
-- workspaces_member_read requires membership, so between creating the workspace
-- row and inserting the first member row the creator cannot SELECT what they
-- just made. The client's fallback path (used when crypto.randomUUID is
-- unavailable) does insert(row).select('id').single(), i.e. a RETURNING, which
-- needs SELECT — so that path is broken today and nobody noticed, because the
-- primary path generates the id client-side. Permissive policies OR, so this
-- widens nothing for anyone else.
drop policy if exists workspaces_owner_read on public.workspaces;
create policy workspaces_owner_read on public.workspaces
  for select to public using (owner_id = auth.uid());

-- ---- 3. Self-join is now ONLY the creator's own first row ------------------
-- Three conditions, all required: it is your own row; you own that workspace;
-- and the role is owner. Every other way in goes through accept_invitation,
-- which is SECURITY DEFINER and already enforces email match, expiry, single
-- use, no downgrade, and a role whitelist that excludes owner
-- (20260831_invitation_accept_rpc.sql:90).
drop policy if exists ws_members_self_join on public.workspace_members;
create policy ws_members_self_join on public.workspace_members
  for insert to public
  with check (
        auth.uid() = user_id
    and private.owns_workspace(workspace_id)
    and role = 'owner'
  );

-- ---- 4. Admins cannot promote to owner, or touch the owner's row ----------
-- ws_members_admin_update had NO with-check at all, so an admin could update
-- their own row and set role = 'owner'. Both clauses now exclude the owner role:
--   USING      — which existing rows an admin may edit (not the owner's)
--   WITH CHECK — what a row may become (never owner)
-- Consequence, and it is deliberate: promotion to owner is no longer possible
-- through an ordinary update by ANYONE, including the current owner. Ownership
-- moves only through the RPC in section 6, which is atomic.
drop policy if exists ws_members_admin_update on public.workspace_members;
create policy ws_members_admin_update on public.workspace_members
  for update to public
  using       (private.can_admin_workspace(workspace_id) and role <> 'owner')
  with check  (private.can_admin_workspace(workspace_id) and role <> 'owner');

-- ---- 5. Admins cannot evict the owner --------------------------------------
-- Waqas: "Admins should not be able to evict the owner, unless ownership has
-- been transferred." A DELETE policy takes no WITH CHECK, but USING is evaluated
-- against the row being deleted, which is exactly what is needed here. After a
-- transfer the former owner is an ordinary member and can be removed normally.
drop policy if exists ws_members_admin_delete on public.workspace_members;
create policy ws_members_admin_delete on public.workspace_members
  for delete to public
  using (private.can_admin_workspace(workspace_id) and role <> 'owner');

-- ---- 6. Ownership transfer, owner-only and atomic --------------------------
-- Sections 4 and 5 make ownership immovable by ordinary means, which is the
-- point; this is the one sanctioned route. It is SECURITY DEFINER because it
-- must write the very rows those policies protect, and it re-checks the caller
-- itself rather than trusting RLS.
--
-- The new owner must ALREADY be a member. That is not fussiness: it means
-- ownership can only ever move to someone who came in through an invitation,
-- so the invite-only rule holds even here.
create or replace function public.transfer_workspace_ownership(
  p_workspace uuid,
  p_new_owner uuid
) returns table (status text, workspace_id uuid, new_owner uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return query select 'not_signed_in'::text, p_workspace, p_new_owner; return;
  end if;

  if not exists (select 1 from public.workspaces w
                  where w.id = p_workspace and w.owner_id = v_uid) then
    return query select 'not_owner'::text, p_workspace, p_new_owner; return;
  end if;

  if p_new_owner = v_uid then
    return query select 'already_owner'::text, p_workspace, p_new_owner; return;
  end if;

  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace and m.user_id = p_new_owner) then
    return query select 'not_a_member'::text, p_workspace, p_new_owner; return;
  end if;

  -- One statement each, one transaction: the workspace never has two owners and
  -- never has none.
  update public.workspaces  set owner_id = p_new_owner where id = p_workspace;
  update public.workspace_members set role = 'admin'
     where workspace_id = p_workspace and user_id = v_uid;
  update public.workspace_members set role = 'owner'
     where workspace_id = p_workspace and user_id = p_new_owner;

  return query select 'ok'::text, p_workspace, p_new_owner;
end;
$$;

revoke execute on function public.transfer_workspace_ownership(uuid, uuid) from anon, public;
grant  execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated;

-- ---- 7. The erase_project grant drift (S12) --------------------------------
-- 0005_security_perf_hardening.sql:43 grants erase_project to `authenticated`.
-- Production grants it to postgres/service_role only — confirmed by
-- 20260831c's own comment ("erase_project has the same shape but is granted only
-- to postgres/service_role, so it was latent rather than reachable"). The disk
-- is therefore MORE PERMISSIVE THAN PRODUCTION, and a rebuild from this repo —
-- a customer-hosted install, a recovery, a staging environment — would hand a
-- destructive RPC to every signed-in user. Rides with this migration because it
-- is the same table of grants and the same deploy.
revoke execute on function public.erase_project(uuid, boolean) from anon, authenticated, public;
grant  execute on function public.erase_project(uuid, boolean) to service_role;

-- ============================================================================
-- PRE-FLIGHT — RUN THIS BEFORE APPLYING, AND KEEP THE RESULT
--
-- This migration closes the door. It does not remove anyone already inside.
-- Every membership row should be explainable as either the workspace's owner or
-- a redeemed invitation. Anything else walked through the open policy.
--
--   select m.workspace_id, m.user_id, m.role, w.name as workspace, w.owner_id
--     from public.workspace_members m
--     join public.workspaces w on w.id = m.workspace_id
--    where m.user_id <> w.owner_id
--      and not exists (
--          select 1 from public.invitations i
--           where i.workspace_id = m.workspace_id
--             and i.accepted_at is not null
--             and lower(i.email) = lower((select u.email from auth.users u
--                                          where u.id = m.user_id)))
--    order by m.workspace_id;
--
-- Expected on a single-tenant estate: zero rows. Any row is a membership with no
-- invitation behind it — investigate before it is written off as historical.
--
-- POST-APPLY VERIFICATION (rule 9 — prove it by breaking the guarded thing):
--   a) as an ordinary signed-in user, insert into workspace_members a row for a
--      workspace you do not own -> must be refused (42501)
--   b) as that user, insert your own row into someone else's workspace -> refused
--   c) create a workspace -> your owner row must insert, and you must be able to
--      select the workspace back
--   d) as an admin, update another member to role 'owner' -> refused
--   e) as an admin, delete the owner's membership row -> refused
--   f) as the owner, call transfer_workspace_ownership to a member -> 'ok', and
--      the two role rows swap
--   g) as a non-owner, call it -> 'not_owner'
--   h) as any signed-in user, call erase_project -> refused (42501)
-- ============================================================================

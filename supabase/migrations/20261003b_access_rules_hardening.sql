-- ============================================================================
-- 20261003b_access_rules_hardening.sql — five access-rule fixes from the 2 Oct 2026 review
--
-- APPLY ONLY AFTER the web app carrying the 3 Oct re-authentication change is live (see
-- part 1 for why). Every part keeps what the app does today working; each says how.
--
-- 1. TWO-FACTOR IS ENFORCED BY THE DATABASE, NOT ONLY BY THE BROWSER.
--    Until now the step-up to two-factor (AAL2) happened only in the sign-in screen. Someone
--    holding a password could sign in through the public API, skip that screen, and read every
--    project the account can see. The rule now lives in the database, and it is the SAME rule
--    the sign-in screen applies, so nobody who can sign in today is locked out:
--      an account with a verified second factor must present an AAL2 session;
--      an account with no second factor is unaffected (two-factor stays opt-in).
--    It is enforced in the membership helpers every workspace rule is built on
--    (workspace_role, is_workspace_member, owns_workspace), in a restrictive policy on the
--    one per-user table that can hold project text (ai_org_cache), and at the top of the
--    functions that act on the caller's own account without going through those helpers.
--    The user's own account rows (tier, licence plan) stay readable at AAL1: the app reads
--    them the moment a password is accepted, before the second-factor prompt, and they hold
--    nothing about any project.
--    Why the web app must ship first: until 3 Oct the password re-check before signing off
--    or taking a lock called signInWithPassword on the app's own session, which replaced an
--    AAL2 session with an AAL1 one. Under this rule that would lock a two-factor user out
--    mid-task. The 3 Oct app checks the password on a separate, throwaway session instead.
--
-- 2. A PROJECT CANNOT BE MOVED TO ANOTHER WORKSPACE.
--    projects_editor_update had no WITH CHECK, so Postgres reused its USING clause on the new
--    row: an editor of the company workspace could set workspace_id to their own Personal
--    workspace, become its owner there, and delete it. Nothing in the app ever changes
--    workspace_id. A trigger now refuses the change for any signed-in caller.
--
-- 3. A REVIEWER CAN ONLY RECORD THEIR OWN DECISION ON THEIR OWN ASSIGNMENT.
--    rasg_update let the assignee change every column of their row, including review_id, so a
--    reviewer could move their row onto another review (any workspace) and, with
--    decision = 'rejected', make the rollup trigger flip that review. The app only ever updates
--    decision and decided_at. A trigger now keeps review_id and user_id fixed for every
--    signed-in caller, and lets only an editor of the workspace change the role.
--
-- 4. A SIGN-OFF RECORDS WHO SIGNED, AS THE DATABASE KNOWS THEM.
--    The chain trigger sealed signer_email, role_at_signing and auth_assurance exactly as the
--    browser sent them, so a reviewer could record an approval under someone else's e-mail as
--    "approver". They are now set by the database before the chain trigger seals the row:
--      signer_user_id  = the signed-in user;
--      signer_email    = that user's e-mail from auth.users;
--      role_at_signing = 'approver' when the user is assigned as approver on that review,
--                        otherwise 'reviewer' (the same rule the sign-off screen uses);
--      auth_assurance  = from the session itself, in the vocabulary the column already allows:
--                        'mfa' when the session is AAL2; 'password_reauth' when the password
--                        was entered within the last five minutes (the sign-off screen asks
--                        for it); otherwise 'session'.
--    The service role (no signed-in user) is left as it was.
--
-- 5. THE CHAIN CHECKS NO LONGER REPORT ACROSS CUSTOMERS.
--    verify_signoff_chain() and verify_audit_chain() check one chain that spans every
--    workspace, and returned the total row count and the first bad row id to any signed-in
--    user. The integrity verdict (ok) is still global, because the chain is; the count is now
--    the rows the caller can see, and first_bad_id is shown only when the caller can see that
--    row. A platform admin still gets the global figures. The app's "Verify ledger" button
--    reads ok, checked and first_bad_id and keeps working unchanged.
--
-- Customer kit: the same file is 20_access_rules_hardening.sql.
-- ============================================================================

-- ---- 0. self-check: the second-factor table must be readable, or nothing changes ----------
do $chk$
begin
  perform 1 from auth.mfa_factors limit 1;
exception when others then
  raise exception 'auth.mfa_factors is not readable by the migration role (%). Nothing was changed.', sqlerrm;
end
$chk$;

-- ---- 1. two-factor -------------------------------------------------------------------------
create or replace function private.mfa_satisfied()
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select auth.uid() is null
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f
                      where f.user_id = auth.uid() and f.status::text = 'verified');
$function$;
revoke all on function private.mfa_satisfied() from public, anon;
grant execute on function private.mfa_satisfied() to authenticated, service_role;

create or replace function private.workspace_role(p_workspace uuid)
returns text
language sql
stable security definer
set search_path to 'public'
as $function$
    select role from public.workspace_members
    where workspace_id = p_workspace and user_id = auth.uid()
      and private.mfa_satisfied()
    limit 1;
$function$;

create or replace function private.is_workspace_member(p_workspace uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
    select private.mfa_satisfied() and exists (
        select 1 from public.workspace_members
        where workspace_id = p_workspace
          and user_id = auth.uid()
    );
$function$;

create or replace function private.owns_workspace(p_workspace uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select private.mfa_satisfied() and coalesce(
    (select w.owner_id = auth.uid() from public.workspaces w where w.id = p_workspace),
    false);
$function$;

drop policy if exists ai_cache_mfa on public.ai_org_cache;
create policy ai_cache_mfa on public.ai_org_cache as restrictive for all to authenticated
  using (private.mfa_satisfied()) with check (private.mfa_satisfied());

-- One refusal, worded once, for the functions that act on the caller's own account.
create or replace function private.require_mfa()
returns void
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not private.mfa_satisfied() then
    raise exception using errcode = '42501',
      message = 'This account has two-factor sign-in turned on. Finish the second step, then try again.';
  end if;
end $function$;
revoke all on function private.require_mfa() from public, anon;
grant execute on function private.require_mfa() to authenticated, service_role;

-- The bodies below are the current ones (kit 08, 15, 16 and the 6 Sep baseline) with one line
-- added at the top of each: perform private.require_mfa(). Nothing else changes.
create or replace function public.transfer_workspace_ownership(p_workspace uuid, p_new_owner uuid)
returns table(status text, workspace_id uuid, new_owner uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  perform private.require_mfa();
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

  update public.workspaces as w
     set owner_id = p_new_owner
   where w.id = p_workspace;

  update public.workspace_members as m
     set role = 'admin'
   where m.workspace_id = p_workspace and m.user_id = v_uid;

  update public.workspace_members as m
     set role = 'owner'
   where m.workspace_id = p_workspace and m.user_id = p_new_owner;

  return query select 'ok'::text, p_workspace, p_new_owner;
end;
$function$;

create or replace function public.accept_invitation(p_token text)
returns table(status text, workspace_id uuid, workspace_name text, role text, invited_email text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''));
  v_inv   public.invitations%rowtype;
  v_ws    public.workspaces%rowtype;
  v_existing text;
begin
  perform private.require_mfa();
  if v_uid is null then
    raise exception 'accept_invitation requires an authenticated session';
  end if;

  select i.* into v_inv from public.invitations i where i.token = p_token;
  if not found then
    return query select 'invalid'::text, null::uuid, null::text, null::text, null::text; return;
  end if;

  select w.* into v_ws from public.workspaces w where w.id = v_inv.workspace_id;

  if lower(v_inv.email) <> v_email then
    return query select 'wrong_account'::text, v_inv.workspace_id, v_ws.name, v_inv.role, v_inv.email; return;
  end if;
  if v_inv.accepted_at is not null then
    return query select 'already_used'::text, v_inv.workspace_id, v_ws.name, v_inv.role, v_inv.email; return;
  end if;
  if v_inv.expires_at <= now() then
    return query select 'expired'::text, v_inv.workspace_id, v_ws.name, v_inv.role, v_inv.email; return;
  end if;
  if v_inv.role not in ('admin','editor','reviewer','viewer') then
    return query select 'invalid_role'::text, v_inv.workspace_id, v_ws.name, v_inv.role, v_inv.email; return;
  end if;

  select wm.role into v_existing
    from public.workspace_members wm
   where wm.workspace_id = v_inv.workspace_id and wm.user_id = v_uid;

  if v_existing is not null then
    update public.invitations i set accepted_at = now() where i.id = v_inv.id;
    return query select 'already_member'::text, v_inv.workspace_id, v_ws.name, v_existing, v_inv.email; return;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, v_uid, v_inv.role);

  update public.invitations i set accepted_at = now() where i.id = v_inv.id;

  return query select 'joined'::text, v_inv.workspace_id, v_ws.name, v_inv.role, v_inv.email;
end;
$function$;

create or replace function public.save_secret(p_kind text, p_secret text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  perform private.require_mfa();
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_kind not in ('anthropic_key','voyage_key','jama_token') then raise exception 'unknown secret kind: %', p_kind; end if;
  if p_secret is null or length(p_secret) < 1 or length(p_secret) > 8192 then raise exception 'invalid secret length'; end if;
  insert into public.user_secrets(user_id, kind, secret, meta, updated_at)
    values (uid, p_kind, p_secret, coalesce(p_meta, '{}'::jsonb), now())
    on conflict (user_id, kind) do update set secret = excluded.secret, meta = excluded.meta, updated_at = now();
end $function$;

create or replace function public.delete_secret(p_kind text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  perform private.require_mfa();
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  delete from public.user_secrets where user_id = uid and kind = p_kind;
end $function$;

-- A read: answers "nothing stored" before the second step instead of failing, so a status
-- check that runs early can never break the page. It holds no secret either way.
create or replace function public.my_secrets_status()
returns table(kind text, meta jsonb, updated_at timestamp with time zone)
language sql
security definer
set search_path to 'public'
as $function$
  select kind, meta, updated_at from public.user_secrets
  where user_id = auth.uid() and private.mfa_satisfied();
$function$;

create or replace function public.erase_my_account(p_confirm boolean default false)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
begin
  perform private.require_mfa();
  return private.erase_my_account(p_confirm);
end $function$;

create or replace function public.user_emails_for_ids(p_ids uuid[])
returns table(id uuid, email text)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select u.id, u.email
  from public.users u
  where u.id = any(p_ids)
    and private.mfa_satisfied()
    and (u.id = auth.uid() or exists (
      select 1
      from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = auth.uid() and theirs.user_id = u.id));
$function$;

-- ---- 2. a project stays in its workspace ---------------------------------------------------
create or replace function private.guard_project_workspace()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.workspace_id is distinct from OLD.workspace_id and auth.uid() is not null then
    raise exception using errcode = 'P0001',
      message = 'A project cannot be moved to another workspace.';
  end if;
  return NEW;
end $function$;
drop trigger if exists sl_guard_project_workspace on public.projects;
create trigger sl_guard_project_workspace before update on public.projects
  for each row execute function private.guard_project_workspace();

-- ---- 3. review assignments -----------------------------------------------------------------
create or replace function private.guard_review_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_ws uuid;
begin
  if auth.uid() is null then return NEW; end if;          -- service role / backend
  if NEW.review_id is distinct from OLD.review_id or NEW.user_id is distinct from OLD.user_id then
    raise exception using errcode = 'P0001',
      message = 'A review assignment cannot be moved to another review or person. Remove it and add a new one.';
  end if;
  if NEW.role is distinct from OLD.role then
    select p.workspace_id into v_ws
      from public.reviews r join public.projects p on p.id = r.project_id
     where r.id = OLD.review_id;
    if not coalesce(private.can_edit_workspace(v_ws), false) then
      raise exception using errcode = '42501',
        message = 'Only an editor of the workspace can change a reviewer''s role on a review.';
    end if;
  end if;
  return NEW;
end $function$;
drop trigger if exists sl_guard_review_assignment on public.review_assignments;
create trigger sl_guard_review_assignment before update on public.review_assignments
  for each row execute function private.guard_review_assignment();

-- ---- 4. sign-off identity ------------------------------------------------------------------
-- Fires before trg_signoffs_chain (triggers fire in name order), so the chain seals these values.
create or replace function private.signoff_identity()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_pw_at bigint;
begin
  if v_uid is null then return NEW; end if;               -- service role: left as written
  if NEW.signer_user_id is not null and NEW.signer_user_id <> v_uid then
    raise exception using errcode = '42501', message = 'A sign-off can only be made in your own name.';
  end if;
  NEW.signer_user_id := v_uid;
  NEW.signer_email   := (select u.email from auth.users u where u.id = v_uid);
  NEW.role_at_signing := case
    when NEW.review_id is not null and exists (
           select 1 from public.review_assignments a
            where a.review_id = NEW.review_id and a.user_id = v_uid and a.role = 'approver')
      then 'approver' else 'reviewer' end;
  select max((m ->> 'timestamp')::bigint) into v_pw_at
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m
   where m ->> 'method' = 'password' and (m ->> 'timestamp') ~ '^[0-9]+$';
  NEW.auth_assurance := case
    when coalesce(auth.jwt() ->> 'aal', '') = 'aal2' then 'mfa'
    when v_pw_at is not null and v_pw_at >= extract(epoch from now())::bigint - 300 then 'password_reauth'
    else 'session' end;
  return NEW;
end $function$;
drop trigger if exists trg_signoffs_a_identity on public.signoffs;
create trigger trg_signoffs_a_identity before insert on public.signoffs
  for each row execute function private.signoff_identity();

-- ---- 5. chain checks report only what the caller can see -----------------------------------
-- drop first: works whether or not 20261002a (which reshaped these two) has been applied yet.
drop function if exists public.verify_signoff_chain();
create function public.verify_signoff_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint, segments bigint, acknowledged bigint)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare r record; v_admin boolean := coalesce(private.is_safety_lab_admin(), false) or auth.uid() is null;
begin
  select * into r from private.verify_signoff_chain();
  if v_admin then
    return query select r.ok, r.first_bad_id, r.checked, r.segments, r.acknowledged; return;
  end if;
  return query select
    r.ok,
    case when r.first_bad_id is not null and exists (
           select 1 from public.signoffs s join public.projects p on p.id = s.project_id
            where s.id = r.first_bad_id and private.is_workspace_member(p.workspace_id))
         then r.first_bad_id end,
    (select count(*) from public.signoffs s join public.projects p on p.id = s.project_id
      where private.is_workspace_member(p.workspace_id)),
    null::bigint, null::bigint;
end $function$;

drop function if exists public.verify_audit_chain();
create function public.verify_audit_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint, segments bigint, acknowledged bigint)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare r record; v_admin boolean := coalesce(private.is_safety_lab_admin(), false) or auth.uid() is null;
begin
  select * into r from private.verify_audit_chain();
  if v_admin then
    return query select r.ok, r.first_bad_id, r.checked, r.segments, r.acknowledged; return;
  end if;
  return query select
    r.ok,
    case when r.first_bad_id is not null and exists (
           select 1 from public.audit_log a where a.id = r.first_bad_id and a.user_id = auth.uid())
         then r.first_bad_id end,
    (select count(*) from public.audit_log a where a.user_id = auth.uid()),
    null::bigint, null::bigint;
end $function$;

revoke execute on function public.verify_audit_chain()   from public, anon;
revoke execute on function public.verify_signoff_chain() from public, anon;
grant  execute on function public.verify_audit_chain()   to authenticated, service_role;
grant  execute on function public.verify_signoff_chain() to authenticated, service_role;

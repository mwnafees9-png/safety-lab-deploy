-- ============================================================================
-- 18 Oct 2026 — SEC-0b: the workspace activity log records what happens in a workspace.
-- STATUS: NOT YET APPLIED IN PRODUCTION (waits for Waqas's go). Customer kit: 23_workspace_audit_events.sql.
--
-- WHAT WAS WRONG (production, read-only, 18 Oct 2026): public.workspace_audit has 0 rows in the product's
-- whole life. SL-WP-0003 section 17 and the trust page say workspace activity is recorded. The only writer
-- is the app calling audit_workspace_event for baseline cuts and reviews (16 Sep), and nobody has cut a
-- baseline or requested a review since. Sign-ins, role changes, invitations, project archive, restore and
-- erasure were never recorded anywhere.
--
-- WHAT THIS DOES
--   1. The database records these itself, from triggers on the tables they change, so the record does not
--      depend on any app being honest or up to date (a call from a script or the API is recorded too):
--        user.signed_in                 one row per workspace the person belongs to
--        workspace.created              workspace.ownership_transferred
--        member.added                   member.role_changed           member.removed
--        invitation.sent                invitation.accepted           invitation.revoked
--        project.created                project.archived              project.restored     project.erased
--      Each row says who did it (the signed-in person, or none for the service), what it was done to,
--      and details.source = 'database'. Rows the app reports through audit_workspace_event now carry
--      details.source = 'app', so a reader can tell what was observed from what was reported.
--   2. A failed audit write never fails the action it records (the 16 Sep rule for the app's writer):
--      the trigger raises a warning instead. When a whole workspace is being deleted (account erasure),
--      nothing is written for the rows going with it.
--   3. Who can read it: owners and admins of the workspace, and each person their own rows. It was every
--      member, which would show every member everyone's sign-in times and the addresses invited.
--      Nothing in the app reads this table yet, so no screen changes.
--   4. Direct INSERT and SELECT grants on the table to anon, and INSERT to authenticated, are revoked.
--      Row security already refused them; the writers are the definer functions above.
--
--   5. The table stays append-only (private.audit_immutable), with one opening: when a workspace is deleted
--      (account erasure deletes the ones the person owns), its rows go with it, each noted in
--      private.maintenance_events. Without it, account erasure would fail as soon as a row existed.
-- STILL OPEN (S13): a hash chain over workspace_audit like audit_log's, and an admin view in the app.
--
-- AFTER APPLYING, PROBE: sign in, then
--   select event_type, details from public.workspace_audit order by id desc limit 5;  -> user.signed_in rows
-- ============================================================================

-- ---- the one writer ---------------------------------------------------------
create or replace function private.ws_audit_write(p_ws uuid, p_event text, p_target uuid, p_details jsonb, p_actor uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_ws is null then return; end if;
  -- the workspace is being deleted with everything in it: there is nothing to record it in
  if not exists (select 1 from public.workspaces w where w.id = p_ws) then return; end if;
  insert into public.workspace_audit (workspace_id, user_id, event_type, target_id, details)
  values (p_ws,
          case when p_actor is not null and exists (select 1 from public.users u where u.id = p_actor) then p_actor end,
          p_event, p_target,
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('source', 'database'));
exception when others then
  raise warning 'workspace_audit: % on % not recorded: %', p_event, p_ws, sqlerrm;
end $function$;
revoke execute on function private.ws_audit_write(uuid, text, uuid, jsonb, uuid) from public, anon, authenticated;

-- ---- workspaces ---------------------------------------------------------------
create or replace function private.tg_ws_audit_workspaces()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    perform private.ws_audit_write(new.id, 'workspace.created', new.id, jsonb_build_object('name', new.name, 'personal', new.is_personal), coalesce(auth.uid(), new.owner_id));
  elsif new.owner_id is distinct from old.owner_id then
    perform private.ws_audit_write(new.id, 'workspace.ownership_transferred', new.id, jsonb_build_object('from', old.owner_id, 'to', new.owner_id), auth.uid());
  end if;
  return null;
end $function$;
drop trigger if exists ws_audit_workspaces on public.workspaces;
create trigger ws_audit_workspaces after insert or update of owner_id on public.workspaces
  for each row execute function private.tg_ws_audit_workspaces();

-- ---- members ------------------------------------------------------------------
create or replace function private.tg_ws_audit_members()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    perform private.ws_audit_write(new.workspace_id, 'member.added', new.user_id, jsonb_build_object('role', new.role), coalesce(auth.uid(), new.user_id));
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform private.ws_audit_write(new.workspace_id, 'member.role_changed', new.user_id, jsonb_build_object('from', old.role, 'to', new.role), auth.uid());
    end if;
  else
    perform private.ws_audit_write(old.workspace_id, 'member.removed', old.user_id, jsonb_build_object('role', old.role), auth.uid());
  end if;
  return null;
end $function$;
drop trigger if exists ws_audit_members on public.workspace_members;
create trigger ws_audit_members after insert or update of role or delete on public.workspace_members
  for each row execute function private.tg_ws_audit_members();

-- ---- invitations ----------------------------------------------------------------
create or replace function private.tg_ws_audit_invitations()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    perform private.ws_audit_write(new.workspace_id, 'invitation.sent', new.id, jsonb_build_object('email', new.email, 'role', new.role), coalesce(auth.uid(), new.invited_by));
  elsif tg_op = 'UPDATE' then
    if old.accepted_at is null and new.accepted_at is not null then
      perform private.ws_audit_write(new.workspace_id, 'invitation.accepted', new.id, jsonb_build_object('email', new.email, 'role', new.role), auth.uid());
    end if;
  elsif old.accepted_at is null then
    perform private.ws_audit_write(old.workspace_id, 'invitation.revoked', old.id, jsonb_build_object('email', old.email, 'role', old.role), auth.uid());
  end if;
  return null;
end $function$;
drop trigger if exists ws_audit_invitations on public.invitations;
create trigger ws_audit_invitations after insert or update of accepted_at or delete on public.invitations
  for each row execute function private.tg_ws_audit_invitations();

-- ---- projects -------------------------------------------------------------------
create or replace function private.tg_ws_audit_projects()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    perform private.ws_audit_write(new.workspace_id, 'project.created', new.id, jsonb_build_object('name', new.name), coalesce(auth.uid(), new.created_by));
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      perform private.ws_audit_write(new.workspace_id, 'project.archived', new.id, jsonb_build_object('name', new.name), auth.uid());
    elsif old.deleted_at is not null and new.deleted_at is null then
      perform private.ws_audit_write(new.workspace_id, 'project.restored', new.id, jsonb_build_object('name', new.name), auth.uid());
    end if;
  else
    perform private.ws_audit_write(old.workspace_id, 'project.erased', old.id, jsonb_build_object('name', old.name), auth.uid());
  end if;
  return null;
end $function$;
drop trigger if exists ws_audit_projects on public.projects;
create trigger ws_audit_projects after insert or update of deleted_at or delete on public.projects
  for each row execute function private.tg_ws_audit_projects();

-- ---- sign-ins -------------------------------------------------------------------
-- The sign-in service stamps auth.users.last_sign_in_at on every sign-in (password, code, single
-- sign-on), not on a token refresh. One row per workspace the person belongs to, so each workspace's
-- admins see their own members' sign-ins and nobody else's.
create or replace function private.tg_ws_audit_signin()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare r record;
begin
  for r in select m.workspace_id from public.workspace_members m where m.user_id = new.id loop
    perform private.ws_audit_write(r.workspace_id, 'user.signed_in', new.id, '{}'::jsonb, new.id);
  end loop;
  return null;
exception when others then
  raise warning 'workspace_audit: sign-in of % not recorded: %', new.id, sqlerrm;
  return null;
end $function$;
revoke execute on function private.tg_ws_audit_signin() from public, anon, authenticated;
do $signin$
begin
  -- a plain Postgres with the kit's stub auth.users has no last_sign_in_at: nothing signs in there
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'last_sign_in_at') then
    execute 'drop trigger if exists ws_audit_signin on auth.users';
    execute 'create trigger ws_audit_signin after update of last_sign_in_at on auth.users for each row '
         || 'when (new.last_sign_in_at is distinct from old.last_sign_in_at) execute function private.tg_ws_audit_signin()';
  end if;
end $signin$;

revoke execute on function private.tg_ws_audit_workspaces()  from public, anon, authenticated;
revoke execute on function private.tg_ws_audit_members()     from public, anon, authenticated;
revoke execute on function private.tg_ws_audit_invitations() from public, anon, authenticated;
revoke execute on function private.tg_ws_audit_projects()    from public, anon, authenticated;

-- ---- what the app reports is marked as reported ------------------------------------
create or replace function public.audit_workspace_event(p_workspace uuid, p_event text, p_target uuid default null, p_details jsonb default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if private.workspace_role(p_workspace) is null then raise exception 'not a member of that workspace'; end if;
  if p_event is null or length(trim(p_event)) = 0 then raise exception 'event type is required'; end if;
  insert into public.workspace_audit (workspace_id, user_id, event_type, target_id, details)
  values (p_workspace, auth.uid(), left(trim(p_event), 64), p_target,
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('source', 'app'));
end $function$;

-- ---- a workspace that is deleted takes its activity with it ---------------------------
-- Found by the kit proof: with activity on record, "Delete my account & data" failed, because deleting an
-- owned workspace cascades to its workspace_audit rows and the table is append-only. (Production never hit
-- it: the table had no rows.) A row may now go only in that cascade, when its workspace is already gone;
-- each one is noted in private.maintenance_events like any other maintenance. Deleting rows of a workspace
-- that still exists is refused exactly as before, and so is every UPDATE.
create or replace function private.audit_immutable()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- Deliberate maintenance: SET LOCAL app.allow_audit_maintenance = 'on' in a transaction to
  -- permit a one-off correction. It is recorded in private.maintenance_events.
  if coalesce(current_setting('app.allow_audit_maintenance', true), 'off') = 'on' then
    perform private.record_maintenance(tg_table_name::text, tg_op::text,
      case when tg_op = 'DELETE' then old.id::text else new.id::text end);
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- 18 Oct 2026: a workspace's activity goes with the workspace (the cascade from its deletion)
  if tg_op = 'DELETE' and tg_table_name = 'workspace_audit'
     and not exists (select 1 from public.workspaces w where w.id = old.workspace_id) then
    perform private.record_maintenance(tg_table_name::text, 'DELETE (workspace deleted)', old.id::text);
    return old;
  end if;
  raise exception 'audit records are append-only: % on % is not permitted', tg_op, tg_table_name
    using errcode = 'insufficient_privilege';
end $function$;

-- ---- who reads it -------------------------------------------------------------------
drop policy if exists ws_audit_member_read on public.workspace_audit;
drop policy if exists ws_audit_admin_read on public.workspace_audit;
create policy ws_audit_admin_read on public.workspace_audit for select to authenticated
  using (private.can_admin_workspace(workspace_id) or user_id = (select auth.uid()));

-- ---- nobody writes it directly ----------------------------------------------------------
revoke insert, select on public.workspace_audit from anon;
revoke insert on public.workspace_audit from authenticated;

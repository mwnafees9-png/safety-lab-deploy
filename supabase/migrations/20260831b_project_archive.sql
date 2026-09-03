-- ============================================================================
-- H-7 — project archive/restore. APPLIED TO PRODUCTION 31 Aug 2026.
-- Ruled by Waqas: ADMIN/OWNER ONLY, and ARCHIVE (reversible), not hard delete.
--
-- Before this, customers could not retire a project at all: nothing client-side
-- ever set projects.deleted_at, even though projects_member_read has always
-- filtered on it. The machinery existed and nothing used it.
--
-- RLS as it stands lets an EDITOR set deleted_at (projects_editor_update is
-- `using private.can_edit_workspace(workspace_id)` and, with no separate WITH
-- CHECK, that expression is used for the check too). The ruling tightens that,
-- and a WITH CHECK cannot express it because WITH CHECK cannot see OLD — so the
-- restriction is a BEFORE UPDATE trigger, which can.
--
-- !! SUPERSEDED THE SAME DAY by 20260831c_rls_helpers_never_return_null.sql. !!
-- Every gate below is written `if not private.can_admin_workspace(x) then` and
-- that form DOES NOT FIRE for a non-member, because the helper returned NULL
-- rather than false and `not NULL` is NULL. Kept on disk unrewritten as the
-- historical record — the H-8 lesson, one day old: a file rewritten to look
-- correct is how drift survives. Read 20260831c for what production runs now.
-- ============================================================================

create or replace function private.guard_project_archive()
  returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  -- Only interested in a change to the archive flag itself. Every other column
  -- keeps the editor-level posture RLS already grants.
  if NEW.deleted_at is not distinct from OLD.deleted_at then
    return NEW;
  end if;
  -- auth.uid() is null in a service-role / backend context (edge functions,
  -- migrations, the recovery RPCs). Those are already fully trusted; this guard
  -- exists to grade BROWSER callers, so it steps aside rather than blocking them.
  if auth.uid() is null then
    return NEW;
  end if;
  if not private.can_admin_workspace(NEW.workspace_id) then
    raise exception using errcode = 'P0001',
      message = 'Only a workspace owner or admin can archive or restore a project.',
      hint = 'Ask an admin of this workspace, or open Workspace settings to see who they are.';
  end if;
  return NEW;
end $$;

drop trigger if exists sl_guard_project_archive on public.projects;
create trigger sl_guard_project_archive
  before update on public.projects
  for each row execute function private.guard_project_archive();

create or replace function public.archive_project(p_project uuid)
  returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_ws uuid; v_name text; v_already timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select p.workspace_id, p.name, p.deleted_at into v_ws, v_name, v_already
    from public.projects p where p.id = p_project;
  if v_ws is null then raise exception 'project not found'; end if;
  if not private.can_admin_workspace(v_ws) then
    raise exception 'only a workspace owner or admin can archive a project';
  end if;
  if v_already is not null then
    return jsonb_build_object('ok', true, 'already_archived', true, 'name', v_name);
  end if;
  update public.projects p set deleted_at = now() where p.id = p_project;
  return jsonb_build_object('ok', true, 'archived', true, 'name', v_name, 'workspace_id', v_ws);
end $$;

create or replace function public.restore_project(p_project uuid)
  returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_ws uuid; v_name text; v_deleted timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select p.workspace_id, p.name, p.deleted_at into v_ws, v_name, v_deleted
    from public.projects p where p.id = p_project;
  if v_ws is null then raise exception 'project not found'; end if;
  if not private.can_admin_workspace(v_ws) then
    raise exception 'only a workspace owner or admin can restore a project';
  end if;
  if v_deleted is null then
    return jsonb_build_object('ok', true, 'already_active', true, 'name', v_name);
  end if;
  update public.projects p set deleted_at = null where p.id = p_project;
  return jsonb_build_object('ok', true, 'restored', true, 'name', v_name, 'workspace_id', v_ws);
end $$;

-- projects_member_read filters `deleted_at is null`, so an archived project is
-- invisible to an ordinary select — which is the point. Restoring one therefore
-- needs a definer-side lister. Admin-gated, and EVERY column reference is
-- table-qualified: an unqualified `name` or `id` collides with the RETURNS TABLE
-- out-parameters and raises "column reference is ambiguous" only at call time,
-- which is exactly how accept_invitation shipped broken on 31 Aug.
create or replace function public.archived_projects(p_workspace uuid)
  returns table (id uuid, name text, cert_basis text, updated_at timestamptz, deleted_at timestamptz)
  language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not private.can_admin_workspace(p_workspace) then
    raise exception 'only a workspace owner or admin can see archived projects';
  end if;
  return query
    select p.id, p.name, p.cert_basis, p.updated_at, p.deleted_at
      from public.projects p
     where p.workspace_id = p_workspace
       and p.deleted_at is not null
     order by p.deleted_at desc;
end $$;

revoke execute on function public.archive_project(uuid)   from public, anon;
revoke execute on function public.restore_project(uuid)   from public, anon;
revoke execute on function public.archived_projects(uuid) from public, anon;
grant  execute on function public.archive_project(uuid)   to authenticated, service_role;
grant  execute on function public.restore_project(uuid)   to authenticated, service_role;
grant  execute on function public.archived_projects(uuid) to authenticated, service_role;

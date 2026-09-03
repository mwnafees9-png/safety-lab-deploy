-- ============================================================================
-- SECURITY FIX — APPLIED TO PRODUCTION 31 Aug 2026. The RLS role helpers
-- returned NULL, not false, for a non-member, and every plpgsql gate of the form
--     if not private.can_edit_workspace(v_ws) then raise ...
-- therefore DID NOT FIRE for exactly the population it exists to stop:
-- `not NULL` is NULL, which is not TRUE, so the IF body is skipped.
--
-- private.workspace_role() returns NULL for a non-member, and
--     null in ('owner','admin')   ->   NULL
-- so can_edit / can_admin / can_review / is_workspace_owner all returned NULL.
--
-- RLS POLICIES WERE NEVER AFFECTED: a policy expression evaluating to NULL is
-- treated as false by Postgres. Only the SECURITY DEFINER RPCs were exposed,
-- because they check the same helpers with plpgsql IF semantics instead.
--
-- PROVEN, NOT INFERRED (rolled back): acting as a signed-in user who is a member
-- of no workspace, public.sl_restore_project_version(<a live project someone
-- else owns>, 999999) passed the "Not permitted to restore this project" gate
-- and reached the version lookup, failing only because that version number does
-- not exist. sl_restore_project_baseline has the same shape and the same
-- `authenticated` grant. erase_project has the same shape but is granted only to
-- postgres/service_role, so it was latent rather than reachable.
--
-- Re-probed after applying, same method: the stranger now gets 42501 from
-- sl_restore_project_version, archive_project and archived_projects; the helpers
-- return false rather than NULL; an admin still works; and an EDITOR is refused
-- the archive while their ordinary edit on the same row still succeeds.
--
-- THE FIX IS AT THE HELPERS, deliberately, rather than at each call site: it
-- closes every caller that exists today and every one written tomorrow, and it
-- is behaviour-identical for the 59 RLS policies that already coerce NULL to
-- false. is_workspace_member (exists(...)) and is_safety_lab_admin (already
-- coalesced) were never affected and are deliberately not touched here.
-- ============================================================================

create or replace function private.is_workspace_owner(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select coalesce(private.workspace_role(p_workspace) = 'owner', false); $$;

create or replace function private.can_edit_workspace(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select coalesce(private.workspace_role(p_workspace) in ('owner','admin','editor'), false); $$;

create or replace function private.can_admin_workspace(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select coalesce(private.workspace_role(p_workspace) in ('owner','admin'), false); $$;

create or replace function private.can_review_workspace(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select coalesce(private.workspace_role(p_workspace) in ('owner','admin','editor','reviewer'), false); $$;

-- Defence in depth at the three H-7 call sites written today: a helper that is
-- ever rewritten without the coalesce must not silently re-open these.
create or replace function private.guard_project_archive()
  returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if NEW.deleted_at is not distinct from OLD.deleted_at then return NEW; end if;
  if auth.uid() is null then return NEW; end if;   -- service-role / backend, already trusted
  if coalesce(private.can_admin_workspace(NEW.workspace_id), false) is not true then
    raise exception using errcode = 'P0001',
      message = 'Only a workspace owner or admin can archive or restore a project.',
      hint = 'Ask an admin of this workspace, or open Workspace settings to see who they are.';
  end if;
  return NEW;
end $$;

create or replace function public.archive_project(p_project uuid)
  returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_ws uuid; v_name text; v_already timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select p.workspace_id, p.name, p.deleted_at into v_ws, v_name, v_already
    from public.projects p where p.id = p_project;
  if v_ws is null then raise exception 'project not found'; end if;
  if coalesce(private.can_admin_workspace(v_ws), false) is not true then
    raise exception 'only a workspace owner or admin can archive a project' using errcode = '42501';
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
  if coalesce(private.can_admin_workspace(v_ws), false) is not true then
    raise exception 'only a workspace owner or admin can restore a project' using errcode = '42501';
  end if;
  if v_deleted is null then
    return jsonb_build_object('ok', true, 'already_active', true, 'name', v_name);
  end if;
  update public.projects p set deleted_at = null where p.id = p_project;
  return jsonb_build_object('ok', true, 'restored', true, 'name', v_name, 'workspace_id', v_ws);
end $$;

create or replace function public.archived_projects(p_workspace uuid)
  returns table (id uuid, name text, cert_basis text, updated_at timestamptz, deleted_at timestamptz)
  language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(private.can_admin_workspace(p_workspace), false) is not true then
    raise exception 'only a workspace owner or admin can see archived projects' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.cert_basis, p.updated_at, p.deleted_at
      from public.projects p
     where p.workspace_id = p_workspace
       and p.deleted_at is not null
     order by p.deleted_at desc;
end $$;

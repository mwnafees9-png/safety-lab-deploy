-- ============================================================================
-- 20 Aug 2026 (b) — make the archived history RECOVERABLE, not just recorded.
--
-- Applied to production as 20260820215430 (project_recovery_rpc), then amended
-- by 20260820215558 (project_recovery_rpc_fix_flag_leak). This file is the
-- canonical disk copy of the FINAL deployed state, reconstructed from the live
-- definitions after the disk copy went missing. The guard-function amendments
-- those migrations also carried live in 20260820_project_document_loss_guard.sql.
--
-- WHY NOT project_crdt: it mirrors 10 of 36 stores, lags by hours-to-days, and
-- for Sylla 2.0 holds the SAME 6 items the gutted live doc holds. The versions
-- table is the restore source.
--
-- TWO DEFECTS FOUND BY TESTING THE FIRST VERSION (20260820215558), both real:
--
-- [H] sl.restore LEAKED. set_config(..., is_local => true) scopes the flag to
--     the TRANSACTION, not the statement. Over PostgREST each RPC is its own
--     transaction so it looked fine, but any transaction that called restore
--     ran with the anti-wipe guard disabled for everything that followed it.
--     Proven by test H: a plain gutting UPDATE issued after a restore in the
--     same transaction was ALLOWED. Now cleared immediately after the one
--     UPDATE it exists for, so the window is a single statement.
--
-- [B] The refusal message claimed 'The previous state is archived (version N)'.
--     It is not. The guard archives OLD and then RAISEs, and the raise rolls
--     the archive insert back with it — measured: zero archive rows after a
--     refused wipe. The claim was false at the moment it was shown. Nothing is
--     lost (the refusal is what keeps the live document intact) but telling a
--     customer their work is banked somewhere it is not is worse than saying
--     nothing, especially since the hint then invites them to force the write.
--     The corrected message lives in the guard (loss_guard file).
-- ============================================================================

create or replace function public.sl_recovery_points(p_project uuid)
returns table (
  kind text, version integer, saved_at timestamptz, items integer,
  bytes integer, saved_by uuid, is_restorable boolean
)
language sql stable security invoker set search_path = public
as $fn$
  select 'live'::text, d.version, d.updated_at,
         public.sl_doc_items(d.data), length(d.data::text), d.updated_by, false
    from public.project_documents d
   where d.project_id = p_project
  union all
  select 'archive'::text, v.version, v.saved_at,
         public.sl_doc_items(v.data), length(v.data::text), v.saved_by, true
    from public.project_document_versions v
   where v.project_id = p_project
   order by 3 desc;
$fn$;

comment on function public.sl_recovery_points(uuid) is
  'Restore points for a project: the live document plus every archived version, newest first, with authored-item counts. RLS-scoped to workspace members.';

create or replace function public.sl_restore_project_version(p_project uuid, p_version integer)
returns jsonb language plpgsql security definer set search_path = public
as $fn$
declare
  v_workspace uuid; v_cur_data jsonb; v_cur_version integer;
  v_cur_by uuid; v_cur_at timestamptz; v_new_data jsonb;
  v_new_version integer; v_archived_as integer; v_max_ver integer;
begin
  select p.workspace_id into v_workspace
    from public.projects p where p.id = p_project and p.deleted_at is null;
  if v_workspace is null then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_workspace(v_workspace) then
    raise exception 'Not permitted to restore this project' using errcode = '42501';
  end if;

  select v.data into v_new_data from public.project_document_versions v
   where v.project_id = p_project and v.version = p_version;
  if v_new_data is null then
    raise exception 'No archived version % for this project', p_version using errcode = 'P0002';
  end if;

  select d.data, d.version, d.updated_by, d.updated_at
    into v_cur_data, v_cur_version, v_cur_by, v_cur_at
    from public.project_documents d where d.project_id = p_project for update;
  if v_cur_data is null then
    raise exception 'Project has no live document' using errcode = 'P0002';
  end if;

  select coalesce(max(v.version), 0) into v_max_ver
    from public.project_document_versions v where v.project_id = p_project;

  begin
    insert into public.project_document_versions (project_id, version, data, saved_by, saved_at)
    values (p_project, v_cur_version, v_cur_data, v_cur_by, coalesce(v_cur_at, now()))
    returning version into v_archived_as;
  exception when unique_violation then
    if exists (select 1 from public.project_document_versions
                where project_id = p_project and version = v_cur_version and data = v_cur_data) then
      v_archived_as := v_cur_version;
    else
      v_max_ver := v_max_ver + 1;
      insert into public.project_document_versions (project_id, version, data, saved_by, saved_at)
      values (p_project, v_max_ver, v_cur_data, v_cur_by, coalesce(v_cur_at, now()))
      returning version into v_archived_as;
    end if;
  end;

  v_new_version := greatest(v_cur_version, v_max_ver, v_archived_as) + 1;

  -- Open the guard for exactly one statement, then shut it. is_local scopes to
  -- the TRANSACTION, so without the reset below every later statement in the
  -- caller's transaction would run unguarded.
  perform set_config('sl.restore', 'on', true);
  update public.project_documents d
     set data = v_new_data,
         version = v_new_version,
         updated_by = coalesce(auth.uid(), v_cur_by),
         updated_at = now()
   where d.project_id = p_project;
  perform set_config('sl.restore', 'off', true);

  return jsonb_build_object(
    'ok', true, 'project_id', p_project, 'restored_from', p_version,
    'new_version', v_new_version, 'undo_version', v_archived_as,
    'items_before', public.sl_doc_items(v_cur_data),
    'items_after', public.sl_doc_items(v_new_data)
  );
end;
$fn$;

comment on function public.sl_restore_project_version(uuid, integer) is
  'Restore a project document to an archived version. Archives the current state first and returns undo_version, so the restore is itself reversible. Requires workspace edit rights.';

revoke all on function public.sl_restore_project_version(uuid, integer) from public;
grant execute on function public.sl_restore_project_version(uuid, integer) to authenticated;
grant execute on function public.sl_recovery_points(uuid) to authenticated;

-- ============================================================================
-- 21 Aug 2026 — restore a SEALED REVISION (project_baselines) server-side,
-- through the same archive-first, guard-aware path as version restore.
--
-- WHY. The Version history panel's "Restore" on a revision row ran client-side:
-- fetch baseline data → apply in memory → saveProjectToCloud(). Since the
-- 20 Aug anti-wipe trigger, that write is REFUSED whenever the revision being
-- restored is much smaller than the live document (a deliberate rollback looks
-- exactly like the wipe the guard exists to stop), and the refusal hint steers
-- the user to _slIntentionalClear — the wrong hatch, which also stamps a marker
-- into their document. sl_restore_project_version() already solved this for
-- saved versions; this is the same contract for sealed revisions:
--   authorise → archive current state (undoable) → write under sl.restore,
--   flag cleared immediately after the one UPDATE (the [H] lesson from
--   20260820215558: is_local scopes to the TRANSACTION, not the statement).
--
-- The baseline row itself is never modified — a sealed revision stays sealed.
-- ============================================================================

create or replace function public.sl_restore_project_baseline(p_project uuid, p_baseline uuid)
returns jsonb language plpgsql security definer set search_path = public
as $fn$
declare
  v_workspace uuid; v_cur_data jsonb; v_cur_version integer;
  v_cur_by uuid; v_cur_at timestamptz; v_new_data jsonb; v_label text; v_rev_no integer;
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

  -- The baseline must belong to THIS project — p_baseline alone is not trusted.
  select b.data, b.label, b.version_no into v_new_data, v_label, v_rev_no
    from public.project_baselines b
   where b.id = p_baseline and b.project_id = p_project;
  if v_new_data is null then
    raise exception 'No such revision for this project' using errcode = 'P0002';
  end if;

  select d.data, d.version, d.updated_by, d.updated_at
    into v_cur_data, v_cur_version, v_cur_by, v_cur_at
    from public.project_documents d where d.project_id = p_project for update;
  if v_cur_data is null then
    raise exception 'Project has no live document' using errcode = 'P0002';
  end if;

  select coalesce(max(v.version), 0) into v_max_ver
    from public.project_document_versions v where v.project_id = p_project;

  -- Bank the pre-restore state so the restore itself is reversible. Same
  -- collision handling as sl_restore_project_version: recognise a byte-identical
  -- row already banked, otherwise allocate max+1 — never silently drop the copy.
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

  -- Open the guard for exactly one statement, then shut it.
  perform set_config('sl.restore', 'on', true);
  update public.project_documents d
     set data = v_new_data,
         version = v_new_version,
         updated_by = coalesce(auth.uid(), v_cur_by),
         updated_at = now()
   where d.project_id = p_project;
  perform set_config('sl.restore', 'off', true);

  return jsonb_build_object(
    'ok', true, 'project_id', p_project, 'restored_from_baseline', p_baseline,
    'revision_no', v_rev_no, 'revision_label', v_label,
    'new_version', v_new_version, 'undo_version', v_archived_as,
    'items_before', public.sl_doc_items(v_cur_data),
    'items_after', public.sl_doc_items(v_new_data)
  );
end;
$fn$;

comment on function public.sl_restore_project_baseline(uuid, uuid) is
  'Restore a project document to a sealed revision (project_baselines row). Archives the current state first and returns undo_version, so the restore is itself reversible. The baseline row is never modified. Requires workspace edit rights.';

revoke all on function public.sl_restore_project_baseline(uuid, uuid) from public;
revoke execute on function public.sl_restore_project_baseline(uuid, uuid) from anon;
grant execute on function public.sl_restore_project_baseline(uuid, uuid) to authenticated;

-- Housekeeping (flagged to Waqas 21 Aug): the 20 Aug migration revoked PUBLIC
-- on sl_restore_project_version but Supabase's default privileges had already
-- granted anon separately, and that grant survived. Not exploitable (the
-- workspace-edit check refuses anonymous callers) but not what was intended.
revoke execute on function public.sl_restore_project_version(uuid, integer) from anon;

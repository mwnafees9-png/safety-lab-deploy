-- ============================================================================
-- 31 Aug 2026 — H-2. Version-counter monotonicity for project_documents.
-- STATUS: READY TO APPLY, AWAITING WAQAS'S SIGN-OFF. NOT YET APPLIED.
--
-- WHY. Reproduced live on 31 Aug (project f7a7bda2): a tab that opened a project
-- from cloud without loading its version token wrote version 1 over version 3.
-- The client is fixed (misc_fn_modules 66.45 / helpers 2.57 / cloud_sync 1.6
-- adopt the server version instead of regressing), but every build already in
-- the wild keeps the old behavior until its tab reloads — the same reasoning
-- that put sl_guard_project_document in the database in the first place.
--
-- WHAT. Amends sl_guard_project_document: on UPDATE, when NEW.version is not
-- greater than OLD.version and the restore flag is not open, the version is
-- REWRITTEN to OLD.version + 1 rather than refused. A refusal would turn every
-- stale-tab save into an error the engineer cannot act on; the rewrite preserves
-- the write (content guards below are untouched) and keeps the counter honest,
-- at the cost that the stale client's next save sees a version conflict — which
-- the fixed client now handles safely (bank first, honest wording).
--
-- WHY THE WHOLE FUNCTION IS RE-EMITTED RATHER THAN PATCHED. Generated from the
-- live pg_get_functiondef on 31 Aug 2026, per the drift lesson recorded in the
-- 20 Aug file and re-learned the hard way in H-8: the disk copy of a database
-- object is not evidence of what production runs. The ONLY change against that
-- live definition is the block marked [H-2] near the end. Everything else —
-- the archive block, the 80/50/10 pruning, the shrink refusal and its message —
-- is byte-for-byte what is running now.
--
-- WHERE THE BLOCK SITS, AND WHY. Last, immediately before RETURN. It must run
-- after the archive block (so the pre-write snapshot is banked with OLD.version
-- intact) and it is deliberately BELOW the shrink refusal: if a save is going to
-- be refused for gutting the document, the version must not be quietly bumped on
-- the way to raising.
--
-- SCOPE OF THE REWRITE. Only when a version is present on both sides and did not
-- advance. A null on either side is left alone — that is a different bug and
-- silently inventing a number for it would hide it. `sl.restore` is honoured
-- exactly as the shrink guard honours it, so the recovery RPCs still write under
-- their one-statement flag without interference.
--
-- APPLY (direct-to-production path, then reconcile this header with a SYNC NOTE):
--   supabase mcp apply_migration, or psql against the project.
-- ROLLBACK: re-apply the live definition captured above this line, minus [H-2].
-- ============================================================================

create or replace function public.sl_guard_project_document()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  old_items integer;
  new_items integer;
  last_archive timestamptz;
begin
  if TG_OP = 'INSERT' then
    return NEW;
  end if;

  old_items := public.sl_doc_items(OLD.data);
  new_items := public.sl_doc_items(NEW.data);

  select max(saved_at) into last_archive
    from project_document_versions where project_id = OLD.project_id;

  if old_items > 0
     and (new_items < old_items or last_archive is null or last_archive < now() - interval '10 minutes')
  then
    insert into project_document_versions (project_id, version, data, saved_by, saved_at)
    values (OLD.project_id, OLD.version, OLD.data, OLD.updated_by, coalesce(OLD.updated_at, now()))
    on conflict (project_id, version) do nothing;

    if (select count(*) from project_document_versions where project_id = OLD.project_id) > 80 then
      delete from project_document_versions v
      where v.project_id = OLD.project_id
        and v.id not in (
          select id from (
            (select id from project_document_versions
              where project_id = OLD.project_id order by saved_at desc limit 50)
            union
            (select id from project_document_versions
              where project_id = OLD.project_id order by public.sl_doc_items(data) desc limit 10)
          ) keepers
        );
    end if;
  end if;

  if old_items >= 10
     and new_items < (old_items * 0.2)
     and coalesce((NEW.data->>'_slIntentionalClear')::boolean, false) is not true
     and coalesce(current_setting('sl.restore', true), '') <> 'on'
  then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Refused: this save would cut project content from %s items to %s. Nothing was written - the saved project still holds all %s.',
        old_items, new_items, old_items),
      hint = 'Earlier snapshots are listed by sl_recovery_points(). If this really is intentional, save again with _slIntentionalClear set on the payload.';
  end if;

  -- [H-2] 31 Aug 2026 — THE ONLY CHANGE IN THIS FILE.
  -- A stale tab that never loaded the document's version token writes version 1
  -- over version N. Rewrite rather than refuse: the engineer's content is kept,
  -- the counter stays monotonic, and the stale client discovers the conflict on
  -- its NEXT save, where the fixed client banks first and says so plainly.
  -- Nulls are left alone deliberately — a missing version is a different defect
  -- and inventing a number for it would hide it.
  if TG_OP = 'UPDATE'
     and NEW.version is not null and OLD.version is not null
     and NEW.version <= OLD.version
     and coalesce(current_setting('sl.restore', true), '') <> 'on'
  then
    NEW.version := OLD.version + 1;
  end if;

  return NEW;
end;
$function$;

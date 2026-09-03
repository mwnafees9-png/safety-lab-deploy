-- ============================================================================
-- 20 Aug 2026 — stop a transient client-side wipe from destroying a customer's
-- cloud project.
--
-- SYNC NOTE (20 Aug 2026, evening). This file is the canonical disk copy of
-- what is DEPLOYED, reconstructed from the live definitions
-- (pg_get_functiondef + supabase_migrations.schema_migrations) after the disk
-- copy drifted. The original disk version had a prune block that does not
-- compile (bare LIMIT before UNION — Postgres requires each limited SELECT in
-- a UNION to be parenthesized) and predated two amendments that were applied
-- to production by 20260820215430 (project_recovery_rpc) and 20260820215558
-- (project_recovery_rpc_fix_flag_leak):
--   • the guard now stands down for one statement when sl.restore = 'on'
--     (set only by sl_restore_project_version, see
--     20260820b_project_recovery_rpc.sql);
--   • the refusal message no longer claims the previous state "is archived".
--     That claim was FALSE: the guard archives OLD and then RAISEs, and the
--     raise rolls the archive insert back with it — measured, zero archive
--     rows after a refused wipe. Nothing is lost (the refusal itself is what
--     keeps the live document intact), but telling a customer their work is
--     banked somewhere it is not is worse than saying nothing, especially
--     since the hint then invites them to force the write.
-- The guard itself was applied directly to production on 20 Aug and is NOT in
-- supabase_migrations history under this file's name — this file exists so
-- the repo compiles and matches what runs.
--
-- WHY THIS IS IN THE DATABASE AND NOT ONLY IN THE CLIENT
-- The client fix ships with a deploy and only protects tabs that have reloaded.
-- Every build already in the wild keeps pushing every 12 seconds. A trigger
-- protects all of them from the moment it lands, and it cannot be bypassed by a
-- stale tab, a second client, or a future code path nobody remembered to guard.
--
-- WHAT WENT WRONG (measured, not theorised)
--   • _applyProjectData() defaults every absent key to empty:
--         acFunctionsData = data.acFunctionsData || []
--         ftaPages        = data.ftaPages        || [{ one blank page }]
--     so a PARTIAL payload silently zeroes exactly the stores it omits.
--   • cloud_sync.js then pushes that state over the live document within 12s
--     (immediately on pagehide/visibilitychange). Its _hasRealContent() guard
--     is only on the PROVISIONING branch — the update path has no guard at all.
--   • cloud_sync never calls _recordSaveHistory. 1,271 pushes ever produced
--     225 history rows; 233 of 411 projects have NO history whatsoever.
--
--   Four projects already hit, all collapsing to the same 0/0/0/1-blank-page
--   shape: bc881634 (212 items incl. 150 requirements), 420657c9 (71 items),
--   cb9876d6 (-172 requirements), 4734185f (-31 fault trees).
--
-- CALIBRATION
-- Across all 225 recorded transitions there were 6 shrinks. The rule below
-- (>=10 items collapsing to <20%) matches exactly 4 — the four known wipes —
-- and nothing else. No false positives in the entire recorded history.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. How much *content* a project document holds.
--    Counts rows the user authored. Deliberately ignores config, counters and
--    projectSourceDocs (a 2.3MB upload is not evidence of authored work — one
--    real project is 2.26MB of source PDFs with nothing else built yet, and it
--    must not read as "populated").
-- ---------------------------------------------------------------------------
create or replace function public.sl_doc_items(d jsonb)
returns integer
language plpgsql
immutable
parallel safe
as $$
declare
  k text;
  n integer := 0;
begin
  if d is null or jsonb_typeof(d) <> 'object' then
    return 0;
  end if;
  foreach k in array array[
      'acFunctionsData','acFcimData','acFhaData','acReqData','acAssumptionsData',
      'systemsData','ftaPages','fmeaData','itemsData',
      'praData','zsaData','cmaData','routingData','resourcesData'
  ] loop
    if jsonb_typeof(d->k) = 'array' then
      n := n + jsonb_array_length(d->k);
    end if;
  end loop;
  -- A lone blank fault-tree page is the app's EMPTY state, not content. Without
  -- this, the exact wipe shape (0/0/0/1-blank-page) scores 1 instead of 0 and
  -- slips under a "collapsed to nothing" test.
  if n = 1
     and jsonb_typeof(d->'ftaPages') = 'array'
     and jsonb_array_length(d->'ftaPages') = 1
     and coalesce(d->'ftaPages'->0->>'root','null') in ('null','')
  then
    n := 0;
  end if;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Archive-then-guard, on every write to a project document.
--
--    SECURITY DEFINER because RLS is enabled on project_document_versions and
--    the archive must succeed regardless of which member is saving.
-- ---------------------------------------------------------------------------
create or replace function public.sl_guard_project_document()
returns trigger language plpgsql security definer set search_path = public
as $$
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

  -- ---- (a) ARCHIVE ------------------------------------------------------
  -- Every SHRINK is archived without exception: that is the direction data is
  -- lost in, and it is the direction there is currently no history for. Beyond
  -- that, one archive per project per 10 minutes as a periodic safety net, so
  -- a 12-second push cadence cannot flood the table.
  select max(saved_at) into last_archive
    from project_document_versions where project_id = OLD.project_id;

  if old_items > 0
     and (new_items < old_items or last_archive is null or last_archive < now() - interval '10 minutes')
  then
    insert into project_document_versions (project_id, version, data, saved_by, saved_at)
    values (OLD.project_id, OLD.version, OLD.data, OLD.updated_by, coalesce(OLD.updated_at, now()))
    on conflict (project_id, version) do nothing;   -- manual Save may already hold this version

    -- Prune: keep the 50 most recent AND the 10 largest ever, so a periodic
    -- net can never evict the peak that makes a project recoverable.
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

  -- ---- (b) REFUSE A CATASTROPHIC OVERWRITE -------------------------------
  -- A populated document must not be replaced by a gutted one. This is the
  -- write that destroyed four customer projects.
  --
  -- Escape hatches: a client that genuinely means it sets _slIntentionalClear
  -- in the payload, and sl_restore_project_version opens sl.restore for
  -- exactly one statement. Deleting a project outright still works — this
  -- trigger is on UPDATE of the document, not on DELETE of the project.
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

  return NEW;
end;
$$;

drop trigger if exists sl_guard_project_document_trg on public.project_documents;
create trigger sl_guard_project_document_trg
  before update on public.project_documents
  for each row execute function public.sl_guard_project_document();

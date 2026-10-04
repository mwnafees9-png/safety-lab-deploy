-- ============================================================================
-- 4 Oct 2026 — the project-save guard stops timing out on projects with a long history.
-- STATUS: NOT YET APPLIED. Waits for Waqas's "apply it". Customer kit: 21_version_archive_prune_cheap.sql.
--
-- WHAT WAS WRONG (measured on production, 4 Oct 2026, read-only)
--   sl_guard_project_document runs on every save of project_documents. Once a project has
--   more than 80 archived versions, the guard prunes them, and the prune decided which ten
--   "largest" versions to keep with `order by public.sl_doc_items(data)` over EVERY archived
--   version. That parses every archived copy of the project, every save: 81 copies x 1 MB on
--   the FHA eval project = 57 MB of JSON per save. The app's role runs with an 8 second
--   statement timeout, so the save is cancelled ("canceling statement due to statement
--   timeout"), the prune rolls back with it, the count stays above 80, and the next save
--   does the same. The document can never be saved again.
--   Six projects are stuck this way today, frozen at their last good save (3 to 24 Sep).
--   Nothing is lost: the live collaborative copy (project_crdt) still saves, and the
--   frozen document still holds its last good state. But the backup copy stopped
--   following, and any customer project with a long enough history would hit the same wall.
--
-- WHAT THIS DOES
--   1. project_document_versions gets an `items` column: the item count, worked out ONCE
--      when a version is archived (a BEFORE INSERT trigger, so every writer is covered,
--      including the app's own history insert and the recovery function), and back-filled
--      here for the versions already archived.
--   2. The guard keeps exactly the same rules (keep the 50 newest and the 10 largest, the
--      wipe refusal, the version counter, the restore flag). The ONLY change: "largest" is
--      read from the stored `items` column instead of re-parsing every archived copy, and
--      the archive insert stores the count it already worked out.
--   On the stuck projects the first save after this prunes 81..244 versions down to 60 and
--   goes through (its last archive is weeks old, so the archive branch runs); after that a save
--   reads a stored number per archived row instead of parsing it.
-- ============================================================================

alter table public.project_document_versions add column if not exists items integer;

create or replace function public.sl_version_items_fill()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.items is null then
    NEW.items := public.sl_doc_items(NEW.data);
  end if;
  return NEW;
end;
$$;
revoke all on function public.sl_version_items_fill() from anon, authenticated, public;

drop trigger if exists sl_version_items_fill_trg on public.project_document_versions;
create trigger sl_version_items_fill_trg
  before insert on public.project_document_versions
  for each row execute function public.sl_version_items_fill();

-- one-time back-fill (runs as the migration owner, outside the app's 8 s limit)
update public.project_document_versions set items = public.sl_doc_items(data) where items is null;

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
    insert into project_document_versions (project_id, version, data, saved_by, saved_at, items)
    values (OLD.project_id, OLD.version, OLD.data, OLD.updated_by, coalesce(OLD.updated_at, now()), old_items)
    on conflict (project_id, version) do nothing;

    -- 4 Oct 2026: reads the stored item count instead of re-parsing every archived copy.
    -- Same keepers as before: the 50 newest and the 10 largest.
    if (select count(*) from project_document_versions where project_id = OLD.project_id) > 80 then
    delete from project_document_versions v
    where v.project_id = OLD.project_id
      and v.id not in (
        select id from (
          (select id from project_document_versions
            where project_id = OLD.project_id order by saved_at desc limit 50)
          union
          (select id from project_document_versions
            where project_id = OLD.project_id order by coalesce(items, 0) desc, saved_at desc limit 10)
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

  -- [H-2] 31 Aug 2026 — version counter stays monotonic (unchanged).
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
revoke all on function public.sl_guard_project_document() from anon, authenticated, public;

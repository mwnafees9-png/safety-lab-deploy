-- 12 Nov 2026 (live team data): the project history's pruning kept the 50 newest versions and the 10 "largest" by a
-- count that only counts rows and fault tree PAGES. A project lost 45 fault tree events on 11 Nov; the versions that
-- still held them had the same page count as the smaller ones, were not among the keepers, and were pruned the same
-- evening. The history now also keeps the 10 versions holding the most data (the stored size of the document), so the
-- fullest copies of a project are never the ones thrown away. Everything else in the trigger is unchanged.
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
    -- Keepers: the 50 newest, the 10 largest by item count, and (12 Nov 2026) the 10 holding the most data.
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
          union
          (select id from project_document_versions
            where project_id = OLD.project_id order by pg_column_size(data) desc, saved_at desc limit 10)
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

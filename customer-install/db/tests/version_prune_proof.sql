-- Proof for 21_version_archive_prune_cheap.sql (4 Oct 2026). Run on a scratch database built from
-- the kit (00..19 + local_stubs), seeded with an 81-version history, AFTER applying 21.
-- Needs: public.items_calls sequence + sl_doc_items wrapped to count calls (see setup in the header
-- of tests/version_prune_setup.sql). Every check raises on failure; the last line says ALL PASS.
\set ON_ERROR_STOP on
do $$ declare n int; begin
  select count(*) into n from public.project_document_versions where items is null;
  if n <> 0 then raise exception 'FAIL: % archived versions have no stored item count after the back-fill', n; end if;
  raise notice 'back-fill: every archived version has its item count — OK';
end $$;

-- 1. a save over a long history parses the live document twice and NO archived copy
select setval('public.items_calls', 1, false);
update public.project_documents set data = jsonb_set(data, '{acFhaData}', (data->'acFhaData') || '[{"fcId":"NEW"}]'::jsonb)
 where project_id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ declare c bigint; n int; begin
  select last_value into c from public.items_calls;
  if c > 2 then raise exception 'FAIL: the save parsed % documents (the old guard parsed every archived copy)', c; end if;
  select count(*) into n from public.project_document_versions where project_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n > 60 then raise exception 'FAIL: history not pruned (% versions)', n; end if;
  raise notice 'save over 81 versions: % parse(s), history pruned to % — OK', c, n;
end $$;

-- 2. the archived copy carries the count the guard already worked out
do $$ declare i int; begin
  select items into i from public.project_document_versions where project_id = 'aaaaaaaa-0000-0000-0000-000000000001' and version = 82;
  if i is distinct from 500 then raise exception 'FAIL: archived version 82 stores % items, expected 500', i; end if;
  raise notice 'archive stores its item count (500) — OK';
end $$;

-- 3. any other writer (the app''s own history insert) gets the count filled in
insert into public.project_document_versions(project_id, version, data)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 9001, '{"acFhaData":[1,2,3],"acReqData":[1]}');
do $$ declare i int; begin
  select items into i from public.project_document_versions where version = 9001;
  if i is distinct from 4 then raise exception 'FAIL: a direct insert stored % items, expected 4', i; end if;
  raise notice 'a direct insert gets its item count filled — OK';
end $$;

-- 4. the wipe refusal is unchanged
do $$ begin
  begin
    update public.project_documents set data = '{"acFhaData":[]}' where project_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FAIL: a wipe was written';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'Refused: this save would cut project content%' then raise notice 'wipe refused as before — OK';
    else raise; end if;
  end;
end $$;

-- 5. the version counter still never goes backwards
update public.project_documents set data = data, version = 1 where project_id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ declare v int; begin
  select version into v from public.project_documents where project_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if v <= 82 then raise exception 'FAIL: version went back to %', v; end if;
  raise notice 'stale version 1 rewritten to % — OK', v;
end $$;

-- 6. the app''s role cannot call the new trigger function directly
do $$ begin
  if has_function_privilege('authenticated', 'public.sl_version_items_fill()', 'execute') then raise exception 'FAIL: authenticated can execute sl_version_items_fill'; end if;
  raise notice 'trigger function not callable by the app role — OK';
end $$;
select 'ALL PASS';

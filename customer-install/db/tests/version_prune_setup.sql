-- Seed for version_prune_proof.sql (4 Oct 2026): a project with an 81-version history of different sizes.
-- Run on a scratch kit database (local_stubs + 00..19), THEN apply 21, THEN the proof.
\set ON_ERROR_STOP on
set session_replication_role = replica;
insert into public.projects(id, workspace_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', gen_random_uuid(), 'big');
insert into public.project_documents(project_id, data, version, updated_at)
  select 'aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_object('acFhaData', (select jsonb_agg(jsonb_build_object('fcId','FC-'||g)) from generate_series(1,500) g)), 82, now() - interval '1 day';
-- 81 archived versions with DIFFERENT sizes (so "the 10 largest" is a real choice), saved a minute apart
insert into public.project_document_versions(project_id, version, data, saved_at)
  select 'aaaaaaaa-0000-0000-0000-000000000001', v,
         jsonb_build_object('acFhaData', (select jsonb_agg(jsonb_build_object('fcId','FC-'||g)) from generate_series(1, ((v*37) % 97) + 20) g)),
         now() - interval '30 days' + (v || ' minutes')::interval
  from generate_series(1,81) v;
set session_replication_role = origin;
-- count how many times sl_doc_items runs (the proof reads this counter)
create sequence if not exists public.items_calls;
alter function public.sl_doc_items(jsonb) rename to sl_doc_items_real;
create function public.sl_doc_items(d jsonb) returns integer language plpgsql volatile as $$ begin perform nextval('public.items_calls'); return public.sl_doc_items_real(d); end $$;

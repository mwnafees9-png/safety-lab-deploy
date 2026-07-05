-- =============================================================================
-- Safety Lab Aero — Office-style version history (every save)
-- Project: fhrqkhdrwbfnizkepch (Safety-Lab, us-east-2)  ·  [Collab / Versioning]
--
-- Complements 0003. Two distinct concepts:
--   * project_document_versions (THIS file) — append-only history of EVERY save,
--     like Microsoft Office "Version History". Lightweight, automatic, browsable.
--   * project_baselines (0003) — deliberate, numbered REVISIONS (Rev 1, Rev 2, ...)
--     that go through review / approval / sign-off.
--
-- Same access model as 0003: project-scoped, inherits workspace membership via a
-- join to public.projects. Additive only — rollback = drop this one table.
-- =============================================================================

create table if not exists public.project_document_versions (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  version     integer not null,                 -- mirrors project_documents.version at save time
  data        jsonb   not null,                 -- full snapshot for this save
  saved_by    uuid references public.users(id),
  saved_at    timestamptz not null default now(),
  unique (project_id, version)
);
create index if not exists idx_pdv_project on public.project_document_versions (project_id, version desc);

alter table public.project_document_versions enable row level security;

-- Read: any member of the owning workspace.
drop policy if exists pdv_member_read on public.project_document_versions;
create policy pdv_member_read on public.project_document_versions for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_document_versions.project_id
                 and is_workspace_member(p.workspace_id) and p.deleted_at is null));

-- Insert: editors/admins (same gate as writing the working copy).
drop policy if exists pdv_editor_insert on public.project_document_versions;
create policy pdv_editor_insert on public.project_document_versions for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_document_versions.project_id
                      and can_edit_workspace(p.workspace_id)));

-- Delete: admins only (for retention / pruning old history). History points are
-- never UPDATEd — they are immutable snapshots of a moment.
drop policy if exists pdv_admin_delete on public.project_document_versions;
create policy pdv_admin_delete on public.project_document_versions for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = project_document_versions.project_id
                 and can_admin_workspace(p.workspace_id)));

grant select, insert, delete on public.project_document_versions to authenticated;
grant all on public.project_document_versions to service_role;
revoke update on public.project_document_versions from anon, authenticated;  -- history is immutable

-- =============================================================================
-- App notes:
--   * On every successful cloud save, insert one row here with the same `version`
--     written to project_documents (the optimistic-concurrency token).
--   * "Restore" = load a history row's `data` as the working copy, which then
--     becomes the next save (a new version), so nothing is lost.
--   * Retention (e.g. keep last N per project + all baseline-linked points) can be
--     added later as a scheduled cleanup; admins can already delete.
-- =============================================================================

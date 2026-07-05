-- =============================================================================
-- Safety Lab Aero — Reviews, Approvals, Versions & Sign-offs (Phase A)
-- Project: fhrqkhdrwbfnizkepch (Safety-Lab, us-east-2)  ·  [Collab / Cert-Controls]
--
-- Adds the data model for "controlled, attributable change": immutable version
-- baselines, an in-app review/approval workflow, and CRYPTOGRAPHIC SIGN-OFFS
-- that bind a signature to the exact baseline hash (append-only + hash-chained,
-- mirroring the audit_log ledger in 0002 §C / #267).
--
-- Access model is unchanged: every row is project-scoped and inherits workspace
-- membership via a join to public.projects (same pattern as project_documents in
-- 0001). Reviewers (workspace role 'reviewer') can comment + sign; editors/admins
-- drive transitions; signed baselines are immutable.
--
-- SAFETY: this file is VETTED but should be reviewed and applied in the Supabase
-- SQL editor (or on a branch first) — do NOT run blind against production. It is
-- additive (new tables/functions only); rollback = drop the 5 tables + helpers.
-- Re-appliable (if not exists / drop-then-create throughout).
--
-- Design defaults baked in (see Reviews_Approvals_Signatures_Roadmap.md):
--   * Approval authority is assigned PER REVIEW (review_assignments.role='approver'),
--     not as a global workspace role.
--   * A signature is bound to baseline_sha256; if the live analysis later diverges
--     from that hash, the app treats the approval as superseded (re-approval needed).
--   * Baseline snapshots are stored as full JSONB (fine at current scale).
-- =============================================================================

create extension if not exists pgcrypto;  -- digest() for the sign-off hash chain

-- ---- New membership helper: reviewers may act (comment + sign) -----------------
-- Mirrors can_edit_workspace (0001) but also includes the 'reviewer' role, which
-- is intentionally NOT an editor. SECURITY DEFINER + pinned search_path (#262).
create or replace function public.can_review_workspace(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select public.workspace_role(p_workspace) in ('owner','admin','editor','reviewer'); $$;

-- Match the 0002 §B2 grant posture: drop anon exposure, keep authenticated (RLS) + service_role.
revoke execute on function public.can_review_workspace(uuid) from public;
grant  execute on function public.can_review_workspace(uuid) to authenticated, service_role;


-- =============================================================================
-- 1. project_baselines — immutable, hashable version snapshots
-- =============================================================================
create table if not exists public.project_baselines (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  version_no  integer not null,
  label       text,
  status      text not null default 'draft'
              check (status in ('draft','in_review','approved','released','superseded')),
  data        jsonb not null,                 -- full _buildProjectSnapshot() blob
  sha256      text  not null,                 -- canonical hash of `data` (computed client/edge)
  note        text,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  unique (project_id, version_no)
);
create index if not exists idx_project_baselines_project on public.project_baselines (project_id, version_no desc);

-- Auto-number versions per project (NULL version_no => max+1). BEFORE INSERT, so
-- the value is set before the NOT NULL / unique checks run.
create or replace function public.set_baseline_version_no()
  returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.version_no is null then
    select coalesce(max(version_no), 0) + 1 into new.version_no
      from public.project_baselines where project_id = new.project_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_baseline_version_no on public.project_baselines;
create trigger trg_baseline_version_no before insert on public.project_baselines
  for each row execute function public.set_baseline_version_no();

-- Immutability guard: a snapshot's identity (data / hash / version / project) can
-- never change once written. Status, label and note remain editable for lifecycle.
create or replace function public.forbid_baseline_snapshot_mutation()
  returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.data is distinct from old.data
     or new.sha256 is distinct from old.sha256
     or new.version_no is distinct from old.version_no
     or new.project_id is distinct from old.project_id then
    raise exception 'project_baselines: snapshot (data/sha256/version_no/project_id) is immutable once created';
  end if;
  return new;
end $$;
drop trigger if exists trg_baseline_immutable on public.project_baselines;
create trigger trg_baseline_immutable before update on public.project_baselines
  for each row execute function public.forbid_baseline_snapshot_mutation();

alter table public.project_baselines enable row level security;

drop policy if exists baselines_member_read on public.project_baselines;
create policy baselines_member_read on public.project_baselines for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_baselines.project_id
                 and is_workspace_member(p.workspace_id) and p.deleted_at is null));

drop policy if exists baselines_editor_insert on public.project_baselines;
create policy baselines_editor_insert on public.project_baselines for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_baselines.project_id
                      and can_edit_workspace(p.workspace_id)));

drop policy if exists baselines_editor_update on public.project_baselines;
create policy baselines_editor_update on public.project_baselines for update to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_baselines.project_id and can_edit_workspace(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_baselines.project_id and can_edit_workspace(p.workspace_id)));

drop policy if exists baselines_admin_delete on public.project_baselines;
create policy baselines_admin_delete on public.project_baselines for delete to authenticated
  using (status <> 'released' and exists (select 1 from public.projects p where p.id = project_baselines.project_id
         and can_admin_workspace(p.workspace_id)));

grant select, insert, update, delete on public.project_baselines to authenticated;
grant all on public.project_baselines to service_role;


-- =============================================================================
-- 2. reviews — a review request against a baseline
-- =============================================================================
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  baseline_id   uuid references public.project_baselines(id) on delete set null,
  scope         text not null default 'project'
                check (scope in ('project','system','fta_page','analysis')),
  target_ref    text,                          -- e.g. systemId / ftaPageId / internalId
  title         text not null,
  status        text not null default 'draft'
                check (status in ('draft','in_review','changes_requested','approved','released','rejected','withdrawn')),
  requested_by  uuid references public.users(id),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);
create index if not exists idx_reviews_project on public.reviews (project_id, status);

alter table public.reviews enable row level security;

drop policy if exists reviews_member_read on public.reviews;
create policy reviews_member_read on public.reviews for select to authenticated
  using (exists (select 1 from public.projects p where p.id = reviews.project_id
                 and is_workspace_member(p.workspace_id) and p.deleted_at is null));

drop policy if exists reviews_editor_insert on public.reviews;
create policy reviews_editor_insert on public.reviews for insert to authenticated
  with check (requested_by = auth.uid() and exists (select 1 from public.projects p
              where p.id = reviews.project_id and can_edit_workspace(p.workspace_id)));

drop policy if exists reviews_editor_update on public.reviews;
create policy reviews_editor_update on public.reviews for update to authenticated
  using      (exists (select 1 from public.projects p where p.id = reviews.project_id and can_edit_workspace(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = reviews.project_id and can_edit_workspace(p.workspace_id)));

drop policy if exists reviews_admin_delete on public.reviews;
create policy reviews_admin_delete on public.reviews for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = reviews.project_id and can_admin_workspace(p.workspace_id)));

grant select, insert, update, delete on public.reviews to authenticated;
grant all on public.reviews to service_role;


-- =============================================================================
-- 3. review_assignments — N reviewers + a designated approver per review
-- =============================================================================
create table if not exists public.review_assignments (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.reviews(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  role        text not null check (role in ('reviewer','approver')),
  decision    text not null default 'pending' check (decision in ('pending','approved','rejected')),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (review_id, user_id, role)
);
create index if not exists idx_review_assignments_review on public.review_assignments (review_id);
create index if not exists idx_review_assignments_user   on public.review_assignments (user_id);

alter table public.review_assignments enable row level security;

-- Read: any member of the owning workspace (join through reviews -> projects).
drop policy if exists rasg_member_read on public.review_assignments;
create policy rasg_member_read on public.review_assignments for select to authenticated
  using (exists (select 1 from public.reviews r join public.projects p on p.id = r.project_id
                 where r.id = review_assignments.review_id and is_workspace_member(p.workspace_id) and p.deleted_at is null));

-- Insert/delete: editors/admins assign reviewers.
drop policy if exists rasg_editor_insert on public.review_assignments;
create policy rasg_editor_insert on public.review_assignments for insert to authenticated
  with check (exists (select 1 from public.reviews r join public.projects p on p.id = r.project_id
                      where r.id = review_assignments.review_id and can_edit_workspace(p.workspace_id)));

drop policy if exists rasg_editor_delete on public.review_assignments;
create policy rasg_editor_delete on public.review_assignments for delete to authenticated
  using (exists (select 1 from public.reviews r join public.projects p on p.id = r.project_id
                 where r.id = review_assignments.review_id and can_edit_workspace(p.workspace_id)));

-- Update: an editor/admin, OR the assignee recording their own decision (a
-- 'reviewer' is not an editor, so they need this to act on their assignment).
drop policy if exists rasg_update on public.review_assignments;
create policy rasg_update on public.review_assignments for update to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.reviews r join public.projects p on p.id = r.project_id
                    where r.id = review_assignments.review_id and can_edit_workspace(p.workspace_id)))
  with check (user_id = auth.uid()
         or exists (select 1 from public.reviews r join public.projects p on p.id = r.project_id
                    where r.id = review_assignments.review_id and can_edit_workspace(p.workspace_id)));

grant select, insert, update, delete on public.review_assignments to authenticated;
grant all on public.review_assignments to service_role;


-- =============================================================================
-- 4. review_comments — threaded comments against specific records
-- =============================================================================
create table if not exists public.review_comments (
  id                uuid primary key default gen_random_uuid(),
  review_id         uuid not null references public.reviews(id) on delete cascade,
  target_internal_id text,                     -- stable record internalId, or null for general
  body              text not null,
  author            uuid references public.users(id),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);
create index if not exists idx_review_comments_review on public.review_comments (review_id, created_at);

alter table public.review_comments enable row level security;

drop policy if exists rcom_member_read on public.review_comments;
create policy rcom_member_read on public.review_comments for select to authenticated
  using (exists (select 1 from public.reviews r join public.projects p on p.id = r.project_id
                 where r.id = review_comments.review_id and is_workspace_member(p.workspace_id) and p.deleted_at is null));

-- Reviewers (and above) may comment, as themselves.
drop policy if exists rcom_reviewer_insert on public.review_comments;
create policy rcom_reviewer_insert on public.review_comments for insert to authenticated
  with check (author = auth.uid() and exists (select 1 from public.reviews r join public.projects p on p.id = r.project_id
              where r.id = review_comments.review_id and can_review_workspace(p.workspace_id)));

-- The author may edit/resolve their own comment; admins may moderate.
drop policy if exists rcom_author_update on public.review_comments;
create policy rcom_author_update on public.review_comments for update to authenticated
  using (author = auth.uid()
         or exists (select 1 from public.reviews r join public.projects p on p.id = r.project_id
                    where r.id = review_comments.review_id and can_admin_workspace(p.workspace_id)));

drop policy if exists rcom_author_delete on public.review_comments;
create policy rcom_author_delete on public.review_comments for delete to authenticated
  using (author = auth.uid()
         or exists (select 1 from public.reviews r join public.projects p on p.id = r.project_id
                    where r.id = review_comments.review_id and can_admin_workspace(p.workspace_id)));

grant select, insert, update, delete on public.review_comments to authenticated;
grant all on public.review_comments to service_role;


-- =============================================================================
-- 5. signoffs — append-only, hash-chained cryptographic signatures
--    (mirrors the audit_log ledger pattern in 0002 §C / #267)
-- =============================================================================
create table if not exists public.signoffs (
  id               bigint generated always as identity primary key,
  ts               timestamptz not null default now(),
  review_id        uuid references public.reviews(id) on delete set null,
  project_id       uuid not null references public.projects(id) on delete cascade,
  baseline_id      uuid references public.project_baselines(id) on delete set null,
  baseline_sha256  text not null,              -- binds the signature to an exact snapshot
  signer_user_id   uuid references public.users(id),
  signer_email     text,
  role_at_signing  text not null check (role_at_signing in ('reviewer','approver')),
  decision         text not null check (decision in ('approve','reject')),
  meaning          text,                        -- e.g. "I approve this FHA for release"
  auth_assurance   text check (auth_assurance in ('password_reauth','mfa','session')),
  ip               text,
  user_agent       text,
  prev_hash        text,
  row_hash         text
);
create index if not exists idx_signoffs_project on public.signoffs (project_id, ts desc);
create index if not exists idx_signoffs_review  on public.signoffs (review_id);

-- Hash chain: each row hashes the previous row_hash + its own content (sha256).
-- search_path includes `extensions` so digest() resolves under Supabase (pgcrypto
-- lives there); harmless locally where pgcrypto installs into public.
create or replace function public.signoffs_chain()
  returns trigger language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare last_hash text;
begin
  select row_hash into last_hash from public.signoffs order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  new.row_hash  := encode(digest(
      coalesce(new.prev_hash,'') || coalesce(new.project_id::text,'') || coalesce(new.baseline_sha256,'')
      || coalesce(new.signer_user_id::text,'') || coalesce(new.signer_email,'') || coalesce(new.role_at_signing,'')
      || coalesce(new.decision,'') || coalesce(new.meaning,'') || coalesce(new.ts::text,''), 'sha256'), 'hex');
  return new;
end $$;
drop trigger if exists trg_signoffs_chain on public.signoffs;
create trigger trg_signoffs_chain before insert on public.signoffs
  for each row execute function public.signoffs_chain();

alter table public.signoffs enable row level security;

drop policy if exists signoffs_member_read on public.signoffs;
create policy signoffs_member_read on public.signoffs for select to authenticated
  using (exists (select 1 from public.projects p where p.id = signoffs.project_id
                 and is_workspace_member(p.workspace_id) and p.deleted_at is null));

-- Sign as yourself; reviewers and above may sign. No UPDATE/DELETE policy exists,
-- and the grants below make the table an append-only ledger.
drop policy if exists signoffs_self_insert on public.signoffs;
create policy signoffs_self_insert on public.signoffs for insert to authenticated
  with check (signer_user_id = auth.uid() and exists (select 1 from public.projects p
              where p.id = signoffs.project_id and can_review_workspace(p.workspace_id)));

grant select, insert on public.signoffs to authenticated;   -- no update/delete on purpose
grant all on public.signoffs to service_role;
revoke update, delete on public.signoffs from anon, authenticated;  -- append-only ledger


-- =============================================================================
-- Notes for the app / edge layers (not part of this migration):
--   * version_no is auto-assigned; insert baselines with version_no = NULL.
--   * Compute sha256 over a CANONICAL serialization of the snapshot (stable key
--     order) on the client/edge before insert, and pass the same value into the
--     sign-off so baseline_sha256 matches.
--   * "Approval superseded": compare a project's current canonical hash to the
--     approved baseline's sha256; mismatch => prompt re-approval.
--   * Write human-readable events (review_requested, changes_requested, approved,
--     released, role_changed, signed) to public.workspace_audit for the activity feed.
--   * Verify the sign-off chain: walk public.signoffs ordered by id and recompute
--     row_hash; any mismatch means a row was altered/removed (same as audit_log).
-- =============================================================================

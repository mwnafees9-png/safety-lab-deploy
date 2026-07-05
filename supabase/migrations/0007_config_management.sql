-- 0007_config_management.sql
-- OPT-IN cloud audit store for ARP4754B §5.6 configuration management (SC1/SC2 baselining).
-- The LOCAL project file is the default audit location (air-gap / ITAR friendly); these tables
-- back the "cloud" auditLocation preference. Mirrors the established patterns: project-scoped RLS,
-- append-only + hash-chained baselines/ECNs (like project_baselines + signoffs in 0003/0005/0006).
-- Idempotent. REVIEW before applying to production (consistent with the 0002/0005 "apply by hand"
-- guidance). Requires pgcrypto for the hash chain (already used by the sign-off ledger).
create extension if not exists pgcrypto;

-- ── config_baselines — immutable, numbered, hash-chained snapshots of the configuration index ──
create table if not exists public.config_baselines (
  id            bigint generated always as identity primary key,
  project_id    uuid not null references public.projects(id) on delete cascade,
  version       text not null,                         -- '1.0', '1.1', ... (app-assigned)
  label         text,
  milestone     text,                                  -- 'manual' | 'change' | 'validation' | 'verification' | 'design-complete'
  parent_id     bigint references public.config_baselines(id),
  index_json    jsonb not null,                        -- the configuration index (CI rows + SC + version + open PRs)
  sha256        text not null,
  prev_hash     text,
  chain_hash    text,
  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists idx_config_baselines_project on public.config_baselines (project_id, id desc);

-- ── config_problem_reports — mutable status (open -> closed); project-scoped ──
create table if not exists public.config_problem_reports (
  id            bigint generated always as identity primary key,
  project_id    uuid not null references public.projects(id) on delete cascade,
  pr_uid        text not null,                         -- app-side id (pr-...)
  against_ci    text,
  title         text,
  description   text,
  safety_impact boolean not null default false,
  status        text not null default 'open',          -- 'open' | 'in-work' | 'closed' | 'deferred'
  ecn_uid       text,
  raised_by     uuid not null default auth.uid(),
  raised_at     timestamptz not null default now(),
  resolution    text
);
create index if not exists idx_config_pr_project on public.config_problem_reports (project_id, id desc);

-- ── config_change_notices — immutable, project-scoped (the ECN ledger) ──
create table if not exists public.config_change_notices (
  id             bigint generated always as identity primary key,
  project_id     uuid not null references public.projects(id) on delete cascade,
  ecn_uid        text not null,
  pr_ref         text,
  ci_id          text,
  from_version   text,
  to_version     text,
  change_class   text,                                 -- 'I' | 'II'
  description    text,
  reason         text,
  substantiation text,
  approved_by    uuid not null default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists idx_config_ecn_project on public.config_change_notices (project_id, id desc);

-- ── RLS — project membership (mirror of the project-scoped tables in 0001/0003) ──
alter table public.config_baselines       enable row level security;
alter table public.config_problem_reports enable row level security;
alter table public.config_change_notices  enable row level security;

-- read for any member of the owning project's workspace; write for editors+.
-- (Uses the same membership shape as project_documents; align with your 0001 helpers if they differ.)
do $$ begin
  -- baselines: read
  if not exists (select 1 from pg_policies where policyname='cb_read' and tablename='config_baselines') then
    create policy cb_read on public.config_baselines for select using (
      project_id in (select p.id from public.projects p
                     join public.workspace_members wm on wm.workspace_id = p.workspace_id
                     where wm.user_id = auth.uid()) and project_id is not null);
  end if;
  -- baselines: insert (editors+); append-only (no update/delete policy = denied)
  if not exists (select 1 from pg_policies where policyname='cb_insert' and tablename='config_baselines') then
    create policy cb_insert on public.config_baselines for insert with check (
      public.can_edit_workspace((select workspace_id from public.projects where id = project_id)));
  end if;
  -- problem reports: read + write (mutable status)
  if not exists (select 1 from pg_policies where policyname='pr_read' and tablename='config_problem_reports') then
    create policy pr_read on public.config_problem_reports for select using (
      project_id in (select p.id from public.projects p
                     join public.workspace_members wm on wm.workspace_id = p.workspace_id
                     where wm.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where policyname='pr_write' and tablename='config_problem_reports') then
    create policy pr_write on public.config_problem_reports for all using (
      public.can_edit_workspace((select workspace_id from public.projects where id = project_id)))
      with check (public.can_edit_workspace((select workspace_id from public.projects where id = project_id)));
  end if;
  -- change notices: read + insert only (append-only ledger)
  if not exists (select 1 from pg_policies where policyname='ecn_read' and tablename='config_change_notices') then
    create policy ecn_read on public.config_change_notices for select using (
      project_id in (select p.id from public.projects p
                     join public.workspace_members wm on wm.workspace_id = p.workspace_id
                     where wm.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where policyname='ecn_insert' and tablename='config_change_notices') then
    create policy ecn_insert on public.config_change_notices for insert with check (
      public.can_edit_workspace((select workspace_id from public.projects where id = project_id)));
  end if;
end $$;

-- ── hash chain on config_baselines (append-only ledger, mirrors signoffs_chain) ──
create or replace function public.config_baselines_chain()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare prev text;
begin
  select chain_hash into prev from public.config_baselines
    where project_id = new.project_id order by id desc limit 1;
  new.prev_hash  := prev;
  new.chain_hash := encode(digest(coalesce(prev,'') || new.sha256 || new.version || coalesce(new.milestone,''), 'sha256'), 'hex');
  return new;
end $$;
drop trigger if exists trg_config_baselines_chain on public.config_baselines;
create trigger trg_config_baselines_chain before insert on public.config_baselines
  for each row execute function public.config_baselines_chain();

-- forbid mutation of a written baseline (append-only)
create or replace function public.forbid_config_baseline_mutation()
returns trigger language plpgsql as $$
begin raise exception 'config_baselines is append-only'; end $$;
drop trigger if exists trg_forbid_config_baseline_mut on public.config_baselines;
create trigger trg_forbid_config_baseline_mut before update or delete on public.config_baselines
  for each row execute function public.forbid_config_baseline_mutation();

-- verify the chain end-to-end (no row content returned -> safe for authenticated)
create or replace function public.verify_config_chain(p_project uuid)
returns table(ok boolean, first_bad_id bigint, checked int)
language plpgsql security definer set search_path = public, extensions as $$
declare r record; prev text := null; calc text; bad bigint := null; cnt int := 0;
begin
  for r in select * from public.config_baselines where project_id = p_project order by id asc loop
    calc := encode(digest(coalesce(prev,'') || r.sha256 || r.version || coalesce(r.milestone,''), 'sha256'), 'hex');
    cnt := cnt + 1;
    if r.chain_hash is distinct from calc then bad := r.id; exit; end if;
    prev := r.chain_hash;
  end loop;
  return query select (bad is null), bad, cnt;
end $$;
revoke execute on function public.verify_config_chain(uuid) from anon, public;
grant  execute on function public.verify_config_chain(uuid) to authenticated, service_role;

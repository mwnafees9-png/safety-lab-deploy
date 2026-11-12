-- 12 Nov 2026 (live team data, 10 and 11 Nov): a teammate's browser saved an old copy of a shared project over the
-- team's newer work. A RECOVERY puts back what a saved version had and the project lost, without removing or changing
-- anything added since. Safety Lab prepares it (the saved version is copied here, so the project history's pruning can
-- never take it away), Safety Lab approves it after review, and the first member who opens the project on a build that
-- knows recoveries applies it through the live shared copy, once. Members can read their project's recoveries; nobody
-- inserts or approves from the app; marking one applied goes through mark_project_recovery_applied().
create table if not exists public.project_recoveries (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id),
  from_version integer not null,
  snapshot     jsonb not null,
  reason       text,
  preview      jsonb,
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  applied_at   timestamptz,
  applied_by   uuid,
  result       jsonb
);
create index if not exists project_recoveries_project_idx on public.project_recoveries(project_id);
alter table public.project_recoveries enable row level security;
drop policy if exists project_recoveries_member_read on public.project_recoveries;
create policy project_recoveries_member_read on public.project_recoveries for select
  using (exists (select 1 from public.projects p where p.id = project_recoveries.project_id
                 and private.is_workspace_member(p.workspace_id) and p.deleted_at is null));
revoke insert, update, delete on public.project_recoveries from anon, authenticated;

create or replace function public.mark_project_recovery_applied(p_id uuid, p_result jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.project_recoveries%rowtype;
begin
  select * into r from public.project_recoveries where id = p_id for update;
  if not found or r.approved_at is null or r.applied_at is not null then
    return false;
  end if;
  if not exists (select 1 from public.projects p where p.id = r.project_id and private.can_edit_workspace(p.workspace_id)) then
    return false;
  end if;
  -- 12 Nov 2026: a row that takes a recovery back (snapshot.undo) can only be marked by a build that knows how to do
  -- it (it reports result.undo = true). An older open tab reads the row as "nothing to add" and must not close it.
  if (r.snapshot ? 'undo') and coalesce(p_result->>'undo', '') <> 'true' then
    return false;
  end if;
  update public.project_recoveries set applied_at = now(), applied_by = auth.uid(), result = p_result where id = p_id;
  return true;
end;
$$;
revoke all on function public.mark_project_recovery_applied(uuid, jsonb) from public, anon;
grant execute on function public.mark_project_recovery_applied(uuid, jsonb) to authenticated;

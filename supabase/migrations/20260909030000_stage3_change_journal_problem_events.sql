-- Stage 3 — server-side append-only, hash-chained CHANGE JOURNAL + PROBLEM REPORT EVENT LOG.
-- 9 Sep 2026. Follows the existing tamper-evident pattern already live in production
-- (audit_log_chain / signoffs_chain / audit_immutable / forbid_baseline_snapshot_mutation):
--   * BEFORE INSERT chain trigger fills prev_hash/row_hash (SECURITY DEFINER), chained PER PROJECT
--     so each project's log is an independently verifiable chain (per-project export + customer-hosted).
--   * BEFORE UPDATE/DELETE immutability trigger makes rows append-only, with the same deliberate
--     maintenance escape shape as private.audit_immutable() (a SET LOCAL, audited elsewhere).
--   * server sets actor := auth.uid() and ts := now() in the chain trigger so neither is client-forgeable.
--   * RLS: workspace members read; workspace editors append (rows for their own projects only).
--   * grants locked down (select+insert only) like the other append-only tables.
--
-- change journal = MEANINGFUL ACTIONS (edited FHA row / added req / cut baseline / signed off), not
-- every field. problem reports = an EVENT LOG (opened/updated/resolved each its own locked entry).

-- ======================================================================= tables
create table if not exists public.change_journal (
  id           bigint generated always as identity primary key,
  project_id   uuid not null references public.projects(id) on delete cascade,
  actor        uuid,
  actor_email  text,
  action       text not null,                            -- 'fha.edit','req.add','baseline.cut','signoff', ...
  entity_kind  text,                                     -- 'acFha','sysFha','req','baseline', ...
  entity_id    text,
  summary      jsonb not null default '{}'::jsonb,       -- human-readable label + any detail
  ts           timestamptz not null default now(),
  prev_hash    text,
  row_hash     text
);
create index if not exists change_journal_project_idx on public.change_journal (project_id, id);

create table if not exists public.problem_report_events (
  id           bigint generated always as identity primary key,
  project_id   uuid not null references public.projects(id) on delete cascade,
  report_id    text not null,                            -- the problem report's stable id
  event        text not null,                            -- 'opened','updated','resolved','reopened','closed'
  payload      jsonb not null default '{}'::jsonb,       -- title/description/severity/status/notes at this event
  actor        uuid,
  actor_email  text,
  ts           timestamptz not null default now(),
  prev_hash    text,
  row_hash     text
);
create index if not exists problem_report_events_project_idx on public.problem_report_events (project_id, id);
create index if not exists problem_report_events_report_idx  on public.problem_report_events (project_id, report_id, id);

-- ======================================================================= chain triggers (per project)
-- server sets actor := auth.uid() AND actor_email := the JWT email claim so neither is client-forgeable,
-- and both are folded into row_hash so the displayed attribution is tamper-evident, not just the UUID.
create or replace function public.change_journal_chain()
  returns trigger language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $$
declare last_hash text; claims jsonb;
begin
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  new.actor       := coalesce(auth.uid(), new.actor);    -- server-authoritative identity + time
  new.actor_email := coalesce(claims->>'email', new.actor_email);
  new.ts          := now();
  select row_hash into last_hash from public.change_journal where project_id = new.project_id order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  new.row_hash  := encode(digest(
      coalesce(new.prev_hash,'') || coalesce(new.project_id::text,'') || coalesce(new.actor::text,'')
      || coalesce(new.actor_email,'')
      || coalesce(new.action,'') || coalesce(new.entity_kind,'') || coalesce(new.entity_id,'')
      || coalesce(new.summary::text,'') || coalesce(new.ts::text,''), 'sha256'), 'hex');
  return new;
end $$;

create or replace function public.problem_report_events_chain()
  returns trigger language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $$
declare last_hash text; claims jsonb;
begin
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  new.actor       := coalesce(auth.uid(), new.actor);
  new.actor_email := coalesce(claims->>'email', new.actor_email);
  new.ts          := now();
  select row_hash into last_hash from public.problem_report_events where project_id = new.project_id order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  new.row_hash  := encode(digest(
      coalesce(new.prev_hash,'') || coalesce(new.project_id::text,'') || coalesce(new.report_id,'')
      || coalesce(new.event,'') || coalesce(new.actor::text,'') || coalesce(new.actor_email,'')
      || coalesce(new.payload::text,'')
      || coalesce(new.ts::text,''), 'sha256'), 'hex');
  return new;
end $$;

-- ======================================================================= immutability triggers
create or replace function private.change_journal_immutable()
  returns trigger language plpgsql set search_path to '' as $$
begin
  if coalesce(current_setting('app.allow_journal_maintenance', true), 'off') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'change journal is append-only: % is not permitted', tg_op using errcode = 'insufficient_privilege';
end $$;

create or replace function private.problem_events_immutable()
  returns trigger language plpgsql set search_path to '' as $$
begin
  if coalesce(current_setting('app.allow_problem_maintenance', true), 'off') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'problem report events are append-only: % is not permitted', tg_op using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists trg_change_journal_chain     on public.change_journal;
drop trigger if exists trg_change_journal_immutable on public.change_journal;
drop trigger if exists trg_problem_events_chain     on public.problem_report_events;
drop trigger if exists trg_problem_events_immutable on public.problem_report_events;
create trigger trg_change_journal_chain     before insert           on public.change_journal        for each row execute function public.change_journal_chain();
create trigger trg_change_journal_immutable before update or delete on public.change_journal        for each row execute function private.change_journal_immutable();
create trigger trg_problem_events_chain     before insert           on public.problem_report_events for each row execute function public.problem_report_events_chain();
create trigger trg_problem_events_immutable before update or delete on public.problem_report_events for each row execute function private.problem_events_immutable();

-- ======================================================================= RLS
alter table public.change_journal        enable row level security;
alter table public.problem_report_events enable row level security;

drop policy if exists change_journal_member_read   on public.change_journal;
drop policy if exists change_journal_editor_insert on public.change_journal;
create policy change_journal_member_read on public.change_journal for select to authenticated
  using (exists (select 1 from public.projects p where p.id = change_journal.project_id and private.is_workspace_member(p.workspace_id) and p.deleted_at is null));
create policy change_journal_editor_insert on public.change_journal for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = change_journal.project_id and private.can_edit_workspace(p.workspace_id)));

drop policy if exists problem_events_member_read   on public.problem_report_events;
drop policy if exists problem_events_editor_insert on public.problem_report_events;
create policy problem_events_member_read on public.problem_report_events for select to authenticated
  using (exists (select 1 from public.projects p where p.id = problem_report_events.project_id and private.is_workspace_member(p.workspace_id) and p.deleted_at is null));
create policy problem_events_editor_insert on public.problem_report_events for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = problem_report_events.project_id and private.can_edit_workspace(p.workspace_id)));

-- ======================================================================= grants (append-only lock-down)
revoke all on public.change_journal        from anon, authenticated;
revoke all on public.problem_report_events from anon, authenticated;
grant select, insert on public.change_journal        to authenticated;
grant select, insert on public.problem_report_events to authenticated;

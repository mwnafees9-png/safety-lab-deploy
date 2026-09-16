-- Scheduled chain verification + a trail on the break-glass path, for a customer-hosted install
-- (16 Sep 2026)
--
-- Companion to 09_audit_writers_and_ledger_lockdown.sql. SL-WP-0003 Data Security v3.0 section 17
-- says the audit chain "is verified on a schedule and on demand", and that the break-glass
-- maintenance path "itself leaves a trail". Neither was true of any install: nothing verified the
-- chain on any schedule, no record of a verification existed, and reaching for the maintenance
-- hatch was completely silent -- the one path that can alter a tamper-evident record was the one
-- path that recorded nothing.
--
-- Apply order: after 09_audit_writers_and_ledger_lockdown.sql. Safe to re-run.
--

begin;

-- ---- 1. somewhere for a verification to be recorded ------------------------------------------
-- Readable by any signed-in user: it is the evidence a DER or a certification reviewer is meant
-- to be able to ask for, and it holds no content -- a chain name, a verdict, a row count, a time.
create table if not exists public.chain_verifications (
  id           bigserial primary key,
  chain        text        not null,
  ok           boolean     not null,
  first_bad_id bigint,
  checked      bigint      not null default 0,
  ran_by       text        not null default 'schedule',
  ts           timestamptz not null default now()
);

create index if not exists chain_verifications_chain_ts on public.chain_verifications (chain, ts desc);

alter table public.chain_verifications enable row level security;

drop policy if exists chain_verifications_read on public.chain_verifications;
create policy chain_verifications_read on public.chain_verifications
  for select to authenticated using (true);

-- Written only by the definer runner below. Same lockdown as the ledgers it reports on: a record
-- of verifications that an application role can rewrite or wipe proves nothing.
revoke all on public.chain_verifications from anon, authenticated;
grant select on public.chain_verifications to authenticated;
revoke all on sequence public.chain_verifications_id_seq from anon, authenticated;

-- ---- 2. the scheduled run --------------------------------------------------------------------
create or replace function private.run_chain_verification(p_ran_by text default 'schedule')
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare v record;
begin
  for v in select 'audit_log'::text as chain, a.ok, a.first_bad_id, a.checked
             from private.verify_audit_chain() a
           union all
           select 'signoffs'::text  as chain, s.ok, s.first_bad_id, s.checked
             from private.verify_signoff_chain() s
  loop
    insert into public.chain_verifications (chain, ok, first_bad_id, checked, ran_by)
    values (v.chain, v.ok, v.first_bad_id, v.checked, coalesce(p_ran_by, 'schedule'));
  end loop;
end $function$;

revoke execute on function private.run_chain_verification(text) from public, anon, authenticated;

-- 03:17 UTC daily, IF this install has pg_cron. A self-hosted Postgres may not have it in
-- shared_preload_libraries, and this file has to apply cleanly either way -- so the schedule is
-- best-effort and the failure is loud rather than silent. An operator without pg_cron runs
--     select private.run_chain_verification('cron');
-- from their own scheduler instead; see the note printed below.
do $sched$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('verify-audit-chains-daily')
      where exists (select 1 from cron.job where jobname = 'verify-audit-chains-daily');
    perform cron.schedule('verify-audit-chains-daily', '17 3 * * *',
                          $cron$select private.run_chain_verification('schedule')$cron$);
    raise notice 'chain verification scheduled daily at 03:17 UTC';
  else
    raise warning 'pg_cron is not installed: the chain will NOT be verified on a schedule. Run "select private.run_chain_verification(''cron'');" from your own scheduler, or install pg_cron and re-run this file.';
  end if;
end $sched$;

-- ---- 3. the latest verdict, for the trust page and for a reviewer ----------------------------
create or replace function public.chain_verification_status()
returns table(chain text, ok boolean, checked bigint, ts timestamptz)
language sql security definer set search_path to 'public', 'pg_temp'
as $function$
  select distinct on (c.chain) c.chain, c.ok, c.checked, c.ts
  from public.chain_verifications c
  order by c.chain, c.ts desc
$function$;

revoke execute on function public.chain_verification_status() from public, anon;
grant  execute on function public.chain_verification_status() to authenticated, service_role;

-- ---- 4. the break-glass path leaves a trail --------------------------------------------------
-- Deliberately in private and deliberately not readable by an application role: it records who
-- reached for the hatch, and the operator is the only party who can reach for it.
create table if not exists private.maintenance_events (
  id         bigserial primary key,
  table_name text        not null,
  op         text        not null,
  actor      text        not null,
  row_id     text,
  ts         timestamptz not null default now()
);

revoke all on private.maintenance_events from public, anon, authenticated;

create or replace function private.record_maintenance(p_table text, p_op text, p_row text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into private.maintenance_events (table_name, op, actor, row_id)
  values (p_table, p_op, coalesce(current_user::text, 'unknown'), p_row);
end $function$;

revoke execute on function private.record_maintenance(text, text, text) from public, anon, authenticated;
grant  execute on function private.record_maintenance(text, text, text) to service_role;

-- The three immutability triggers, re-created with their existing behavior plus the trail. The
-- refusal path and its exact message are unchanged -- only the permitted path now writes a
-- record before it returns. They stay SECURITY INVOKER, as they are today; the recorder they
-- call is the definer, so the trail is written whoever reached for the hatch.
create or replace function private.audit_immutable()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- Deliberate maintenance: SET LOCAL app.allow_audit_maintenance = 'on' in a transaction to
  -- permit a one-off correction. It is recorded in private.maintenance_events.
  if coalesce(current_setting('app.allow_audit_maintenance', true), 'off') = 'on' then
    perform private.record_maintenance(tg_table_name::text, tg_op::text,
      case when tg_op = 'DELETE' then old.id::text else new.id::text end);
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'audit records are append-only: % on % is not permitted', tg_op, tg_table_name
    using errcode = 'insufficient_privilege';
end $function$;

create or replace function private.change_journal_immutable()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if coalesce(current_setting('app.allow_journal_maintenance', true), 'off') = 'on' then
    perform private.record_maintenance(tg_table_name::text, tg_op::text,
      case when tg_op = 'DELETE' then old.id::text else new.id::text end);
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'change journal is append-only: % is not permitted', tg_op using errcode = 'insufficient_privilege';
end $function$;

create or replace function private.problem_events_immutable()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if coalesce(current_setting('app.allow_problem_maintenance', true), 'off') = 'on' then
    perform private.record_maintenance(tg_table_name::text, tg_op::text,
      case when tg_op = 'DELETE' then old.id::text else new.id::text end);
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'problem report events are append-only: % is not permitted', tg_op using errcode = 'insufficient_privilege';
end $function$;

commit;

-- ---- 5. seed the first verification, so the record is not empty on day one -------------------
select private.run_chain_verification('migration');

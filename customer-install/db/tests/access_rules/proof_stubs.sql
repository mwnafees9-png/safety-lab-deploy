-- LOCAL-PROOF ONLY: the pieces of a Supabase project that the access-rule proof needs and a
-- plain Postgres does not have. Shapes follow Supabase: realtime.messages carries topic and
-- extension, realtime.topic() returns the topic of the message being authorized (Realtime
-- sets it per request; here a setting stands in), auth.mfa_factors carries user_id and status.
create schema if not exists realtime;
create table if not exists realtime.messages (
  id bigserial primary key, topic text not null, extension text not null,
  payload jsonb, event text, private boolean default true, inserted_at timestamptz default now());
create or replace function realtime.topic() returns text language sql stable
  as $$ select nullif(current_setting('realtime.topic', true), '') $$;
alter table realtime.messages enable row level security;
grant usage on schema realtime to authenticated, anon;
grant select, insert on realtime.messages to authenticated;
grant usage, select on all sequences in schema realtime to authenticated;
grant execute on function realtime.topic() to authenticated, anon;

do $t$ begin create type auth.factor_status as enum ('unverified', 'verified');
exception when duplicate_object then null; end $t$;
create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  status auth.factor_status not null, factor_type text default 'totp');

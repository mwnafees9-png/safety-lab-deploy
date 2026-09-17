-- =====================================================================================
-- Notifications: take the credential out of the trigger definitions, and make a failed
-- send visible.  17 Sep 2026.
--
-- WHAT WAS BROKEN.  Every email the system sends -- sign-in, signup, review, and the daily
-- licence-expiry sweep -- had been failing since 14 Sep.  Proof, from production:
--   * public.notification_log has rows every day from 5 Sep to 14 Sep, then nothing at all.
--   * cron job 'notify-expiry-daily' reported SUCCEEDED on every run, including today.
--   * every row in net._http_response was 401 {"error":"unauthorized"}.
--
-- WHY.  On 14 Sep (S10) the four notify-* functions stopped accepting any Bearer of 16+ chars
-- and started requiring an exact match against SUPABASE_SERVICE_ROLE_KEY.  That was a real hole
-- and closing it was right.  But the callers are five Dashboard database webhooks, and
-- supabase_functions.http_request() takes its headers as a STRING LITERAL baked into the trigger
-- definition.  Those literals hold a legacy service-role JWT that no longer equals the key the
-- platform injects into the function, so the project now refuses itself.
--
-- WHY IT WAS SILENT FOR THREE DAYS.  net.http_post() queues the request and returns an id
-- immediately.  The cron statement therefore succeeds the moment it hands the request off and
-- never sees the reply.  A green scheduled job delivering nothing is the same shape as every
-- other defect found this week: the control is correct and nothing ever ran it.
--
-- WHAT THIS CHANGES, AND WHY NOT JUST RE-PASTE THE KEY.
--   1. The secret moves to Vault and is read at send time.  Rotating it is one row, not five
--      trigger definitions, so the two sides cannot drift apart again.
--   2. It becomes a PURPOSE-SPECIFIC secret, not the database master key.  Losing the notify
--      secret lets someone send a notification; it does not hand them the database.  The master
--      key also stops being readable by anyone who can read a trigger definition, which
--      pg_get_triggerdef() makes fairly public.
--   3. The send NEVER raises.  Two of these triggers sit on auth.users, which is written on
--      every single sign-in.  A notification problem must not be able to block a login.
--   4. Every send is recorded WITH ITS FUNCTION NAME, and an hourly sweep fills in what came
--      back.  The first draft of this migration recovered the name by joining pg_net's request
--      queue; its own test showed that pg_net deletes the queue row once the request is sent, so
--      every failure read 'unknown'.  The name is now written at send time.
--
-- ORDER OF DEPLOY.  The edge functions accept NOTIFY_HOOK_SECRET *or* the service-role key, so
-- they can be deployed before or after this migration with no window where mail is dead.
-- =====================================================================================

create schema if not exists private;

-- ---------------------------------------------------------------- where to send
-- Not a secret -- it is in every client bundle already -- but it IS per-install, which is why it
-- is a row and not a literal: customer-install needs its own.
create table if not exists private.notify_config (
  id          boolean primary key default true check (id),
  base_url    text not null,
  updated_at  timestamptz not null default now()
);
revoke all on table private.notify_config from public, anon, authenticated;

-- ---------------------------------------------------------------- what happened to each send
create table if not exists private.notify_outbox (
  id          bigserial primary key,
  fn          text        not null,
  request_id  bigint      unique,          -- pg_net's id; null when the send never happened
  queued_at   timestamptz not null default now(),
  outcome     text,                        -- null = still waiting; ok | refused | no reply | not sent
  http_status int,
  detail      text,
  checked_at  timestamptz
);
create index if not exists notify_outbox_pending on private.notify_outbox (queued_at)
  where outcome is null;
revoke all on table private.notify_outbox from public, anon, authenticated;

-- ---------------------------------------------------------------- the sender
-- SECURITY DEFINER because it reads Vault, which authenticated must never reach.
-- Returns void and swallows everything: see point 3 above.
create or replace function private.notify_post(
  p_fn     text,
  p_type   text,
  p_table  text,
  p_record jsonb,
  p_old    jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_secret text;
  v_base   text;
  v_req    bigint;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_hook_secret' limit 1;
  select base_url into v_base from private.notify_config where id;

  if v_secret is null or v_secret = '' then
    insert into private.notify_outbox (fn, outcome, detail, checked_at)
      values (p_fn, 'not sent', 'no notify_hook_secret in vault', now());
    return;
  end if;
  if v_base is null or v_base = '' then
    insert into private.notify_outbox (fn, outcome, detail, checked_at)
      values (p_fn, 'not sent', 'no base_url in private.notify_config', now());
    return;
  end if;

  select net.http_post(
    url     := v_base || '/functions/v1/' || p_fn,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_secret),
    body    := jsonb_build_object(
                 'type',       p_type,
                 'table',      p_table,
                 'record',     coalesce(p_record, '{}'::jsonb),
                 'old_record', coalesce(p_old,    '{}'::jsonb)),
    timeout_milliseconds := 5000)
    into v_req;

  -- Written HERE, while we still know which function this was.
  insert into private.notify_outbox (fn, request_id) values (p_fn, v_req);

exception when others then
  -- Last line of defence. A login must not fail because an email could not be queued.
  begin
    insert into private.notify_outbox (fn, outcome, detail, checked_at)
      values (p_fn, 'not sent', left(sqlerrm, 500), now());
  exception when others then
    null;
  end;
end;
$fn$;
revoke all on function private.notify_post(text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- the five trigger bodies
create or replace function private.tg_notify_signin() returns trigger
language plpgsql security definer set search_path = '' as $tg$
begin
  -- only when a sign-in actually happened, not on every auth.users write
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    perform private.notify_post('notify-signin', 'UPDATE', 'users', to_jsonb(new), to_jsonb(old));
  end if;
  return null;
end $tg$;

create or replace function private.tg_notify_signup() returns trigger
language plpgsql security definer set search_path = '' as $tg$
begin
  perform private.notify_post('notify-signup', 'INSERT', 'users', to_jsonb(new), '{}'::jsonb);
  return null;
end $tg$;

create or replace function private.tg_notify_review() returns trigger
language plpgsql security definer set search_path = '' as $tg$
begin
  perform private.notify_post('notify-review', tg_op, tg_table_name,
    to_jsonb(new), case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end);
  return null;
end $tg$;

revoke all on function private.tg_notify_signin() from public, anon, authenticated;
revoke all on function private.tg_notify_signup() from public, anon, authenticated;
revoke all on function private.tg_notify_review() from public, anon, authenticated;

-- ---------------------------------------------------------------- fill in what came back
-- This is the part that answers "why did nobody notice for three days". pg_net prunes its
-- response table within hours, so a daily sweep would miss most of it; hourly does not.
-- Anything still unanswered after an hour is reported as such rather than left blank forever.
create or replace function private.sweep_notify_health() returns integer
language plpgsql security definer set search_path = '' as $fn$
declare n integer := 0;
begin
  update private.notify_outbox o
     set outcome    = case when r.status_code between 200 and 299 then 'ok' else 'refused' end,
         http_status= r.status_code,
         detail     = case when r.status_code between 200 and 299 then null
                           else left(coalesce(r.content, r.error_msg, ''), 300) end,
         checked_at = now()
    from net._http_response r
   where o.request_id = r.id
     and o.outcome is null;
  get diagnostics n = row_count;

  -- pg_net threw the reply away before we looked, or it never came.
  update private.notify_outbox
     set outcome = 'no reply', detail = 'no response on record within the hour', checked_at = now()
   where outcome is null
     and queued_at < now() - interval '1 hour';

  return n;
end $fn$;
revoke all on function private.sweep_notify_health() from public, anon, authenticated;

-- ---------------------------------------------------------------- swap the callers
-- These five were Dashboard "Database Webhooks": supabase_functions.http_request() with the
-- headers as a STRING LITERAL, which is where the stale credential lived. Replacing them with
-- our own trigger functions is the point -- the header is now built at send time.
--
-- The two on auth.users are the delicate ones: auth.users is written on every sign-in. They are
-- dropped and recreated inside this one transaction, and private.notify_post() cannot raise, so
-- there is no state in which a login fails because of this.
drop trigger if exists "notify-signin-trigger"  on auth.users;
drop trigger if exists "notify-signup"          on auth.users;
drop trigger if exists "notify-review-assigned" on public.review_assignments;
drop trigger if exists "notify-review-comment"  on public.review_comments;
drop trigger if exists "notify-review-status"   on public.reviews;

create trigger "notify-signin-trigger"  after update on auth.users
  for each row execute function private.tg_notify_signin();
create trigger "notify-signup"          after insert on auth.users
  for each row execute function private.tg_notify_signup();
create trigger "notify-review-assigned" after insert on public.review_assignments
  for each row execute function private.tg_notify_review();
create trigger "notify-review-comment"  after insert on public.review_comments
  for each row execute function private.tg_notify_review();
create trigger "notify-review-status"   after update on public.reviews
  for each row execute function private.tg_notify_review();

-- ---------------------------------------------------------------- the daily expiry sweep
-- The old command pulled its Bearer out of a trigger definition with a regexp. That only worked
-- while a credential sat in a trigger definition, which is the thing being removed here, so it
-- MUST be rewired in the same migration or the expiry mail stays dead.
select cron.unschedule('notify-expiry-daily')
 where exists (select 1 from cron.job where jobname = 'notify-expiry-daily');
select cron.schedule('notify-expiry-daily', '0 8 * * *',
  $cron$select private.notify_post('notify-expiry', 'SCHEDULE', '', '{}'::jsonb, '{}'::jsonb)$cron$);

select cron.unschedule('sweep-notify-health')
 where exists (select 1 from cron.job where jobname = 'sweep-notify-health');
select cron.schedule('sweep-notify-health', '23 * * * *',
  $cron$select private.sweep_notify_health()$cron$);

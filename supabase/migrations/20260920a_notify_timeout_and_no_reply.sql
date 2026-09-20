-- =====================================================================================
-- The outbox cried wolf on the expiry job. 20 Sep 2026.
--
-- WHAT THE WEEKEND SHOWED. private.notify_outbox recorded the 08:00 expiry send as 'refused' on
-- 18 and 19 Sep. notification_log shows an expiry email was SENT on both days. The function did
-- its job; the caller gave up waiting after 5000 ms, which is the timeout inherited from the old
-- Dashboard webhook literal ('5000'). A sign-in alert is one email and returns in well under a
-- second. The expiry job walks every licence and can take longer, especially on a cold start.
--
-- Two things wrong, both in the monitoring half of the 17 Sep fix, not the delivery half:
--   1. 5 s is the wrong budget for a batch job. It is now a parameter; the expiry cron passes 30 s.
--   2. The sweep labelled a null status as 'refused'. A timeout is not a refusal: nobody said no,
--      we just stopped listening. It is now 'no reply', with pg_net's own error text as the detail,
--      so the two cannot be confused. A monitor that reports failures that did not happen gets
--      ignored, and an ignored monitor is the state this whole thing was in for three days.
-- =====================================================================================

-- notify_post gains a timeout parameter. Same five leading args, so every existing caller is
-- unchanged; the trigger bodies resolve it by name at run time.
drop function if exists private.notify_post(text, text, text, jsonb, jsonb);

create or replace function private.notify_post(
  p_fn         text,
  p_type       text,
  p_table      text,
  p_record     jsonb,
  p_old        jsonb,
  p_timeout_ms integer default 5000
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
    timeout_milliseconds := greatest(1000, least(coalesce(p_timeout_ms, 5000), 120000)))
    into v_req;

  insert into private.notify_outbox (fn, request_id) values (p_fn, v_req);

exception when others then
  begin
    insert into private.notify_outbox (fn, outcome, detail, checked_at)
      values (p_fn, 'not sent', left(sqlerrm, 500), now());
  exception when others then
    null;
  end;
end;
$fn$;
revoke all on function private.notify_post(text, text, text, jsonb, jsonb, integer) from public, anon, authenticated;

-- The sweep distinguishes "they said no" from "we stopped listening".
create or replace function private.sweep_notify_health() returns integer
language plpgsql security definer set search_path = '' as $fn$
declare n integer := 0;
begin
  update private.notify_outbox o
     set outcome     = case when r.status_code between 200 and 299 then 'ok'
                            when r.status_code is null              then 'no reply'
                            else 'refused' end,
         http_status = r.status_code,
         detail      = case when r.status_code between 200 and 299 then null
                            when r.status_code is null then left(coalesce(r.error_msg, 'no status and no error text'), 300)
                            else left(coalesce(r.content, r.error_msg, ''), 300) end,
         checked_at  = now()
    from net._http_response r
   where o.request_id = r.id
     and o.outcome is null;
  get diagnostics n = row_count;

  update private.notify_outbox
     set outcome = 'no reply', detail = 'no response on record within the hour', checked_at = now()
   where outcome is null
     and queued_at < now() - interval '1 hour';

  return n;
end $fn$;
revoke all on function private.sweep_notify_health() from public, anon, authenticated;

-- The expiry cron gets the budget a batch job needs.
select cron.unschedule('notify-expiry-daily')
 where exists (select 1 from cron.job where jobname = 'notify-expiry-daily');
select cron.schedule('notify-expiry-daily', '0 8 * * *',
  $cron$select private.notify_post('notify-expiry', 'SCHEDULE', '', '{}'::jsonb, '{}'::jsonb, 30000)$cron$);

-- Correct the two weekend rows that said 'refused' when the email went out.
update private.notify_outbox
   set outcome = 'no reply',
       detail  = 'caller timed out at 5 s; notification_log shows the email was sent (corrected 20 Sep)'
 where fn = 'notify-expiry' and outcome = 'refused' and http_status is null
   and detail like 'Timeout of 5000 ms%';

-- =====================================================================================
-- Notification emails dead again, 6 to 9 Oct 2026. A different cause, the same silence.
--
-- WHAT THE OUTBOX SHOWED. From 6 Oct every row in private.notify_outbox is 'not sent' with
-- "duplicate key value violates unique constraint notify_outbox_request_id_key": five sign-in
-- alerts and four daily expiry checks. The last good sends were on 5 Oct (HTTP 200).
--
-- THE CAUSE. pg_net numbers its requests from a sequence on unlogged tables. A database restart
-- resets it, so the numbers start again at 1 (net.http_request_queue_id_seq was at 3 on 9 Oct).
-- The outbox declared request_id UNIQUE, so every new number collided with an old row. The
-- failed insert sat in the same block as net.http_post, and the exception handler rolled the
-- whole block back: the request was un-queued, and the email never left. The log refused the
-- note, and the note took the send down with it.
--
-- THE FIX, three parts:
--   1. request_id is not unique over time, so the outbox stops claiming it is.
--   2. The send and the note are separate steps. Once the request is queued, nothing that goes
--      wrong with the note can cancel it.
--   3. The sweep matches a reply by number AND time: only a reply recorded after the request was
--      queued counts, so a reused number cannot pick up an old reply.
-- =====================================================================================

alter table private.notify_outbox drop constraint if exists notify_outbox_request_id_key;
create index if not exists notify_outbox_request_id on private.notify_outbox (request_id)
  where outcome is null;

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

  if v_secret is null or v_secret = '' or v_base is null or v_base = '' then
    begin
      insert into private.notify_outbox (fn, outcome, detail, checked_at)
        values (p_fn, 'not sent', case when v_secret is null or v_secret = '' then 'no notify_hook_secret in vault'
                                       else 'no base_url in private.notify_config' end, now());
    exception when others then null;
    end;
    return;
  end if;

  -- step 1: the send. If this fails, the note says why.
  begin
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
  exception when others then
    begin
      insert into private.notify_outbox (fn, outcome, detail, checked_at)
        values (p_fn, 'not sent', left(sqlerrm, 500), now());
    exception when others then null;
    end;
    return;
  end;

  -- step 2: the note. Its own block, so a failure here rolls back the note only, never the send.
  begin
    insert into private.notify_outbox (fn, request_id) values (p_fn, v_req);
  exception when others then null;
  end;
end;
$fn$;
revoke all on function private.notify_post(text, text, text, jsonb, jsonb, integer) from public, anon, authenticated;

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
     and o.outcome is null
     and r.created >= o.queued_at;   -- a number pg_net reused after a restart cannot match an older reply
  get diagnostics n = row_count;

  update private.notify_outbox
     set outcome = 'no reply', detail = 'no response on record within the hour', checked_at = now()
   where outcome is null
     and queued_at < now() - interval '1 hour';

  return n;
end $fn$;
revoke all on function private.sweep_notify_health() from public, anon, authenticated;

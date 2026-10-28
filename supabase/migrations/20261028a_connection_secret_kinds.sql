-- 28 Oct 2026: Safety Lab Connections. The logins of the other connected tools (Polarion and Codebeamer now, with
-- DOORS Next, Cameo and GENESYS named so their connections need no further migration) are kept in the vault like the
-- Jama login: written only through save_secret() (pinned to auth.uid()), never readable by the page, read only by the
-- AI proxy's relay (/v1/ai/bridge?tool=), which puts the login on the request to the saved host.
-- Same function body as 20261003b_access_rules_hardening.sql (two-factor enforced), with the wider kind list.

alter table public.user_secrets drop constraint if exists user_secrets_kind_check;
alter table public.user_secrets add constraint user_secrets_kind_check
  check (kind in ('anthropic_key', 'voyage_key', 'jama_token', 'polarion_token', 'codebeamer_token', 'doors_token', 'cameo_token', 'genesys_token'));

create or replace function public.save_secret(p_kind text, p_secret text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  perform private.require_mfa();
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_kind not in ('anthropic_key','voyage_key','jama_token','polarion_token','codebeamer_token','doors_token','cameo_token','genesys_token') then raise exception 'unknown secret kind: %', p_kind; end if;
  if p_secret is null or length(p_secret) < 1 or length(p_secret) > 8192 then raise exception 'invalid secret length'; end if;
  insert into public.user_secrets(user_id, kind, secret, meta, updated_at)
    values (uid, p_kind, p_secret, coalesce(p_meta, '{}'::jsonb), now())
    on conflict (user_id, kind) do update set secret = excluded.secret, meta = excluded.meta, updated_at = now();
end $function$;

-- ============================================================================
-- user_secrets — per-user server-side secret vault (S8, 14 Sep 2026)
--
-- A user's own connection secrets (AI keys, Jama API token) live on the CUSTOMER'S OWN database,
-- not in the browser. The contract, enforced by construction:
--   * the client has NO direct privilege on the table (cannot select/insert/update/delete it)
--   * the client SAVES / DELETES only through SECURITY DEFINER functions that pin the row to
--     auth.uid(), and can LIST only kinds + non-secret meta (never a value) via my_secrets_status()
--   * the value is readable ONLY by the server (service_role: the AI proxy, the Jama bridge)
-- So no client, not even the owner, can ever read a secret back. Portable plain-Postgres DDL
-- (no Supabase-only extensions) so it applies identically hosted and customer-hosted. The value is
-- stored plaintext-in-column, protected by RLS-no-client-access + the database's encryption at rest;
-- pgcrypto/Vault column encryption is a later hardening, noted, not required.
-- ============================================================================

create table if not exists public.user_secrets (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  kind       text        not null check (kind in ('anthropic_key', 'voyage_key', 'jama_token')),
  secret     text        not null check (length(secret) between 1 and 8192),
  meta       jsonb       not null default '{}'::jsonb,   -- NON-secret hints only (jama user/baseUrl, key last-4)
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.user_secrets enable row level security;
-- No policies and no grants for anon/authenticated: the table is unreachable from any client.
-- service_role bypasses RLS and is the only direct reader (server side).
revoke all on public.user_secrets from anon, authenticated;
grant select, insert, update, delete on public.user_secrets to service_role;   -- the server (proxy, Jama bridge) reads/writes the value; service_role also bypasses RLS

-- ---- the ONLY client write paths: SECURITY DEFINER, each pinned to auth.uid() ----
create or replace function public.save_secret(p_kind text, p_secret text, p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_kind not in ('anthropic_key','voyage_key','jama_token') then raise exception 'unknown secret kind: %', p_kind; end if;
  if p_secret is null or length(p_secret) < 1 or length(p_secret) > 8192 then raise exception 'invalid secret length'; end if;
  insert into public.user_secrets(user_id, kind, secret, meta, updated_at)
    values (uid, p_kind, p_secret, coalesce(p_meta, '{}'::jsonb), now())
    on conflict (user_id, kind) do update set secret = excluded.secret, meta = excluded.meta, updated_at = now();
end $$;

create or replace function public.delete_secret(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  delete from public.user_secrets where user_id = uid and kind = p_kind;
end $$;

-- the client's ONLY read: which kinds are set + non-secret meta + when — never the secret value
create or replace function public.my_secrets_status()
returns table (kind text, meta jsonb, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select kind, meta, updated_at from public.user_secrets where user_id = auth.uid();
$$;

revoke all on function public.save_secret(text, text, jsonb)  from public, anon;
revoke all on function public.delete_secret(text)             from public, anon;
revoke all on function public.my_secrets_status()             from public, anon;
grant execute on function public.save_secret(text, text, jsonb) to authenticated;
grant execute on function public.delete_secret(text)            to authenticated;
grant execute on function public.my_secrets_status()            to authenticated;

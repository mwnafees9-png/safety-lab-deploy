-- 27 Nov 2026: the Safety Lab API and MCP server (docs/API_MCP_DESIGN_2026-11-27.md).
--
-- Waqas: "API and MCP yes". Two ways to sign in (an API client for a system, a personal API key for a person's
-- scripts); read the whole project; what a tool sends "arrives as lines an engineer accepts and signs"; "items another
-- tool owns cannot be changed".
--
-- THREE TABLES
--   api_clients      who may call the API. The secret is shown once, when it is made; only its SHA-256 is kept.
--                    No client of the database can read this table: the app works through the three functions below,
--                    the API service reads it with the service role.
--   api_collections  a tool's named lists of items in one project (functions, requirements, assumptions, and
--                    failure-conditions, which only receives what Safety Lab sends).
--   api_items        the items. A tool writes its own collections through the API service and nothing else: it
--                    never touches the project. The app reads them (project members) and stages every difference as
--                    a line on the Connections page; an engineer accepts or rejects and signs. The decision is written
--                    back here so the tool can see it.
-- Plain Postgres (core functions only: gen_random_uuid, sha256), so it applies the same on our cloud and on a
-- customer's own server. Kit copy: customer-install/db/30_api_clients_and_collections.sql (identical).

-- ---------------------------------------------------------------------------------------------- api_clients
create table if not exists public.api_clients (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  kind          text        not null check (kind in ('client', 'personal')),
  name          text        not null check (length(trim(name)) between 1 and 80),
  client_id     text        not null unique,
  secret_hash   text        not null check (length(secret_hash) = 64),
  can_send      boolean     not null default false,
  project_ids   uuid[],                                   -- null: every project of the workspace
  user_id       uuid        references auth.users(id) on delete cascade,   -- a personal key acts as this person
  created_by    uuid,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid,
  check (kind <> 'personal' or user_id is not null)
);
create index if not exists api_clients_workspace_idx on public.api_clients (workspace_id);
create index if not exists api_clients_hash_idx on public.api_clients (secret_hash);
alter table public.api_clients enable row level security;
revoke all on public.api_clients from public, anon, authenticated;
grant select, insert, update, delete on public.api_clients to service_role;

-- ---------------------------------------------------------------------------------------------- collections, items
create table if not exists public.api_collections (
  id          uuid        primary key default gen_random_uuid(),
  project_id  uuid        not null references public.projects(id) on delete cascade,
  client      uuid        not null references public.api_clients(id) on delete cascade,
  name        text        not null check (name ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  kind        text        not null check (kind in ('functions', 'requirements', 'assumptions', 'failure-conditions')),
  title       text        not null default '' check (length(title) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, client, name)
);
create index if not exists api_collections_project_idx on public.api_collections (project_id);

create table if not exists public.api_items (
  collection   uuid        not null references public.api_collections(id) on delete cascade,
  item_id      text        not null check (length(item_id) between 1 and 200),
  key          text        not null default '' check (length(key) <= 200),
  name         text        not null default '' check (length(name) <= 2000),
  body         text        not null default '' check (length(body) <= 100000),
  parent_id    text        check (parent_id is null or length(parent_id) between 1 and 200),
  sort         double precision not null default 0,
  origin       text        not null default 'tool' check (origin in ('tool', 'safety-lab')),
  changed_by   text        not null default 'tool' check (changed_by in ('tool', 'safety-lab')),
  rev          bigint      not null default 1,
  modified_at  timestamptz not null default now(),
  removed_at   timestamptz,
  status       text        not null default 'waiting' check (status in ('waiting', 'accepted', 'rejected')),
  decided_rev  bigint,
  decided_at   timestamptz,
  decided_by   text        check (decided_by is null or length(decided_by) <= 200),
  decided_why  text        check (decided_why is null or length(decided_why) <= 2000),
  primary key (collection, item_id)
);

alter table public.api_collections enable row level security;
alter table public.api_items enable row level security;
revoke all on public.api_collections from public, anon, authenticated;
revoke all on public.api_items from public, anon, authenticated;
grant select on public.api_collections to authenticated;
grant select on public.api_items to authenticated;
grant select, insert, update, delete on public.api_collections to service_role;
grant select, insert, update, delete on public.api_items to service_role;

-- a project's members read what tools sent to it; nobody writes these tables from the app except through the
-- functions below
drop policy if exists api_collections_member_read on public.api_collections;
create policy api_collections_member_read on public.api_collections for select to authenticated
  using (exists (select 1 from public.projects p where p.id = api_collections.project_id
                 and private.is_workspace_member(p.workspace_id) and p.deleted_at is null));
drop policy if exists api_items_member_read on public.api_items;
create policy api_items_member_read on public.api_items for select to authenticated
  using (exists (select 1 from public.api_collections c join public.projects p on p.id = c.project_id
                 where c.id = api_items.collection and private.is_workspace_member(p.workspace_id) and p.deleted_at is null));

-- ---------------------------------------------------------------------------------------------- making a key
-- Returns the secret ONCE. An API client is made by a workspace admin. A personal key is made by any member for
-- themselves and can send only if that person can edit the workspace.
create or replace function public.api_client_create(p_workspace uuid, p_kind text, p_name text, p_can_send boolean default false, p_projects uuid[] default null)
returns table (id uuid, client_id text, secret text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  v_secret text;
  v_cid text;
  v_id uuid;
  v_n int;
begin
  perform private.require_mfa();
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_kind not in ('client', 'personal') then raise exception 'unknown key kind: %', p_kind; end if;
  if p_name is null or length(trim(p_name)) < 1 or length(trim(p_name)) > 80 then raise exception 'give the key a name of 1 to 80 characters'; end if;
  if p_kind = 'client' and not private.can_admin_workspace(p_workspace) then
    raise exception 'only a workspace admin can make an API client' using errcode = '42501';
  end if;
  if p_kind = 'personal' and not private.is_workspace_member(p_workspace) then
    raise exception 'not a member of that workspace' using errcode = '42501';
  end if;
  if p_kind = 'personal' and coalesce(p_can_send, false) and not private.can_edit_workspace(p_workspace) then
    raise exception 'your role can view this workspace but not change it, so your key cannot send' using errcode = '42501';
  end if;
  if p_projects is not null and exists (
       select 1 from unnest(p_projects) as x(pid)
        where not exists (select 1 from public.projects p where p.id = x.pid and p.workspace_id = p_workspace and p.deleted_at is null)) then
    raise exception 'a chosen project is not in that workspace';
  end if;
  select count(*) into v_n from public.api_clients c where c.workspace_id = p_workspace and c.revoked_at is null;
  if v_n >= 50 then raise exception 'this workspace already has 50 keys in use; revoke one first'; end if;

  v_secret := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  if p_kind = 'client' then
    v_cid := 'slc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24);
    v_secret := 'sls_' || v_secret;
  else
    v_secret := 'slk_' || v_secret;
    v_cid := 'slk_' || substr(v_secret, 5, 8) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;
  insert into public.api_clients (workspace_id, kind, name, client_id, secret_hash, can_send, project_ids, user_id, created_by)
  values (p_workspace, p_kind, trim(p_name), v_cid, encode(sha256(convert_to(v_secret, 'UTF8')), 'hex'),
          coalesce(p_can_send, false), case when p_kind = 'client' then p_projects else null end,
          case when p_kind = 'personal' then uid else null end, uid)
  returning api_clients.id into v_id;
  insert into public.workspace_audit (workspace_id, user_id, event_type, target_id, details)
  values (p_workspace, uid, 'api_key.created', v_id,
          jsonb_build_object('source', 'app', 'kind', p_kind, 'name', trim(p_name), 'can_send', coalesce(p_can_send, false)));
  return query select v_id, v_cid, v_secret;
end $function$;

-- The keys of a workspace, never a secret or its hash. An admin sees every key; anyone else sees their own.
create or replace function public.api_client_list(p_workspace uuid)
returns table (id uuid, kind text, name text, client_id text, can_send boolean, project_ids uuid[], mine boolean,
               created_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select c.id, c.kind, c.name, c.client_id, c.can_send, c.project_ids, (c.user_id = auth.uid() or c.created_by = auth.uid()),
         c.created_at, c.last_used_at, c.revoked_at
    from public.api_clients c
   where c.workspace_id = p_workspace
     and private.is_workspace_member(p_workspace)
     and (private.can_admin_workspace(p_workspace) or c.user_id = auth.uid())
   order by c.revoked_at is not null, c.created_at desc;
$function$;

create or replace function public.api_client_revoke(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  c public.api_clients;
begin
  perform private.require_mfa();
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into c from public.api_clients x where x.id = p_id;
  if c.id is null then raise exception 'no such key'; end if;
  if not (private.can_admin_workspace(c.workspace_id) or (c.kind = 'personal' and c.user_id = uid)) then
    raise exception 'only a workspace admin, or the person a personal key belongs to, can revoke it' using errcode = '42501';
  end if;
  if c.revoked_at is not null then return; end if;
  update public.api_clients set revoked_at = now(), revoked_by = uid where id = p_id;
  insert into public.workspace_audit (workspace_id, user_id, event_type, target_id, details)
  values (c.workspace_id, uid, 'api_key.revoked', p_id, jsonb_build_object('source', 'app', 'kind', c.kind, 'name', c.name));
end $function$;

-- ---------------------------------------------------------------------------------------------- the app's side
-- What tools have sent to one project: each API client with a collection in it, and its collections with counts.
create or replace function public.api_sources(p_project uuid)
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(s.o order by s.name), '[]'::jsonb)
    from (
      select c.name,
             jsonb_build_object('client', c.id, 'name', c.name, 'kind', c.kind, 'can_send', c.can_send, 'revoked', c.revoked_at is not null,
               'collections', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'kind', k.kind, 'title', k.title, 'updated_at', k.updated_at,
                                   'items', (select count(*) from public.api_items i where i.collection = k.id and i.removed_at is null and i.origin = 'tool')) order by k.name), '[]'::jsonb)
                                 from public.api_collections k where k.client = c.id and k.project_id = p_project)) as o
        from public.api_clients c
        join public.projects p on p.id = p_project and p.workspace_id = c.workspace_id and p.deleted_at is null
       where private.is_workspace_member(p.workspace_id)
         and (c.project_ids is null or p_project = any (c.project_ids) or exists (select 1 from public.api_collections k where k.client = c.id and k.project_id = p_project))
         and (c.revoked_at is null or exists (select 1 from public.api_collections k where k.client = c.id and k.project_id = p_project))
    ) s;
$function$;

-- Every item of one collection, as the tool has it now (removed ones included, marked).
create or replace function public.api_collection_items(p_collection uuid)
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.item_id, 'key', i.key, 'name', i.name, 'text', i.body, 'parentId', i.parent_id, 'sort', i.sort,
           'origin', i.origin, 'changedBy', i.changed_by, 'rev', i.rev, 'modified', i.modified_at, 'removed', i.removed_at is not null, 'status', i.status)
           order by i.sort, i.item_id), '[]'::jsonb)
    from public.api_items i
    join public.api_collections c on c.id = i.collection
    join public.projects p on p.id = c.project_id and p.deleted_at is null
   where i.collection = p_collection and private.is_workspace_member(p.workspace_id);
$function$;

-- An engineer's decision on lines from a tool, written back for the tool to read. The decision itself (the signed
-- line in the project's History) lives in the project; this is the tool's copy of the outcome.
create or replace function public.api_items_decide(p_collection uuid, p_ids text[], p_status text, p_by text, p_why text default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ws uuid;
  n integer;
begin
  perform private.require_mfa();
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_status not in ('accepted', 'rejected', 'waiting') then raise exception 'unknown decision: %', p_status; end if;
  if p_status <> 'waiting' and (p_by is null or length(trim(p_by)) = 0) then raise exception 'a decision is signed: say who decided'; end if;
  select p.workspace_id into v_ws from public.api_collections c join public.projects p on p.id = c.project_id where c.id = p_collection and p.deleted_at is null;
  if v_ws is null or not private.can_edit_workspace(v_ws) then
    raise exception 'your role on this project can view changes but not sign them' using errcode = '42501';
  end if;
  update public.api_items i
     set status = p_status,
         decided_rev = case when p_status = 'waiting' then null else i.rev end,
         decided_at  = case when p_status = 'waiting' then null else now() end,
         decided_by  = case when p_status = 'waiting' then null else left(trim(p_by), 200) end,
         decided_why = case when p_status = 'waiting' then null else left(coalesce(p_why, ''), 2000) end
   where i.collection = p_collection and i.item_id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end $function$;

-- What Safety Lab sends to a tool: an item made in Safety Lab (p_item_id null: a new one) or Safety Lab's version of
-- an item it owns. Nothing is overwritten: an existing item is changed only if it is still at the revision the app
-- last read (p_expect_rev); otherwise the answer is 'held' and nothing changes.
create or replace function public.api_item_send(p_collection uuid, p_item_id text, p_key text, p_name text, p_body text, p_parent text default null, p_expect_rev bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ws uuid;
  v_id text := p_item_id;
  cur public.api_items;
begin
  perform private.require_mfa();
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select p.workspace_id into v_ws from public.api_collections c join public.projects p on p.id = c.project_id where c.id = p_collection and p.deleted_at is null;
  if v_ws is null or not private.can_edit_workspace(v_ws) then
    raise exception 'your role on this project cannot send' using errcode = '42501';
  end if;
  if v_id is null or length(trim(v_id)) = 0 then
    v_id := 'sl-' || replace(gen_random_uuid()::text, '-', '');
    insert into public.api_items (collection, item_id, key, name, body, parent_id, origin, changed_by, status, sort)
    values (p_collection, v_id, left(coalesce(p_key, ''), 200), left(coalesce(p_name, ''), 2000), left(coalesce(p_body, ''), 100000), p_parent, 'safety-lab', 'safety-lab', 'accepted',
            coalesce((select max(i.sort) from public.api_items i where i.collection = p_collection), 0) + 1)
    returning * into cur;
    update public.api_collections set updated_at = now() where id = p_collection;
    return jsonb_build_object('result', 'created', 'id', cur.item_id, 'key', cur.key, 'rev', cur.rev, 'modified', cur.modified_at);
  end if;
  select * into cur from public.api_items i where i.collection = p_collection and i.item_id = v_id for update;
  if cur.item_id is null or cur.removed_at is not null then return jsonb_build_object('result', 'gone', 'id', v_id); end if;
  if p_expect_rev is null or cur.rev <> p_expect_rev then
    return jsonb_build_object('result', 'held', 'id', v_id, 'rev', cur.rev, 'modified', cur.modified_at);
  end if;
  update public.api_items i
     set name = left(coalesce(p_name, ''), 2000), body = left(coalesce(p_body, ''), 100000),
         key = case when coalesce(p_key, '') = '' then i.key else left(p_key, 200) end,
         rev = i.rev + 1, modified_at = now(), changed_by = 'safety-lab'
   where i.collection = p_collection and i.item_id = v_id
  returning * into cur;
  update public.api_collections set updated_at = now() where id = p_collection;
  return jsonb_build_object('result', 'updated', 'id', cur.item_id, 'key', cur.key, 'rev', cur.rev, 'modified', cur.modified_at);
end $function$;

-- A collection Safety Lab makes for a tool, so there is somewhere to send to before the tool has made one.
create or replace function public.api_collection_make(p_project uuid, p_client uuid, p_name text, p_kind text, p_title text default '')
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ws uuid;
  v_id uuid;
begin
  perform private.require_mfa();
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select p.workspace_id into v_ws from public.projects p where p.id = p_project and p.deleted_at is null;
  if v_ws is null or not private.can_edit_workspace(v_ws) then raise exception 'your role on this project cannot change its connections' using errcode = '42501'; end if;
  if not exists (select 1 from public.api_clients c where c.id = p_client and c.workspace_id = v_ws and c.revoked_at is null
                   and (c.project_ids is null or p_project = any (c.project_ids))) then
    raise exception 'that API client cannot reach this project';
  end if;
  insert into public.api_collections (project_id, client, name, kind, title)
  values (p_project, p_client, p_name, p_kind, left(coalesce(p_title, ''), 200))
  on conflict (project_id, client, name) do update set title = excluded.title, updated_at = now()
  returning id into v_id;
  return v_id;
end $function$;

revoke all on function public.api_client_create(uuid, text, text, boolean, uuid[]) from public, anon;
revoke all on function public.api_client_list(uuid) from public, anon;
revoke all on function public.api_client_revoke(uuid) from public, anon;
revoke all on function public.api_sources(uuid) from public, anon;
revoke all on function public.api_collection_items(uuid) from public, anon;
revoke all on function public.api_items_decide(uuid, text[], text, text, text) from public, anon;
revoke all on function public.api_item_send(uuid, text, text, text, text, text, bigint) from public, anon;
revoke all on function public.api_collection_make(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.api_client_create(uuid, text, text, boolean, uuid[]) to authenticated;
grant execute on function public.api_client_list(uuid) to authenticated;
grant execute on function public.api_client_revoke(uuid) to authenticated;
grant execute on function public.api_sources(uuid) to authenticated;
grant execute on function public.api_collection_items(uuid) to authenticated;
grant execute on function public.api_items_decide(uuid, text[], text, text, text) to authenticated;
grant execute on function public.api_item_send(uuid, text, text, text, text, text, bigint) to authenticated;
grant execute on function public.api_collection_make(uuid, uuid, text, text, text) to authenticated;

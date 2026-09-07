-- Server-authoritative field-level edit locks for live co-editing (COL-2).
-- One writer per (project, resource_key). Identity is the authenticated user, not a client value.
create table if not exists public.edit_locks (
  project_id   uuid        not null references public.projects(id) on delete cascade,
  resource_key text        not null,
  held_by      uuid        not null references public.users(id),
  held_at      timestamptz not null default now(),
  expires_at   timestamptz not null,
  primary key (project_id, resource_key)
);
alter table public.edit_locks enable row level security;

drop policy if exists edit_locks_member_read on public.edit_locks;
create policy edit_locks_member_read on public.edit_locks for select
  using (private.is_workspace_member((select p.workspace_id from public.projects p where p.id = project_id)));

revoke insert, update, delete on public.edit_locks from anon, authenticated;

create or replace function public.acquire_edit_lock(p_project uuid, p_resource text, p_ttl_seconds int default 120)
returns table(ok boolean, held_by uuid, expires_at timestamptz)
language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare v_uid uuid := auth.uid(); v_ws uuid; v_ttl int := greatest(5, least(600, coalesce(p_ttl_seconds,120)));
begin
  if v_uid is null then return query select false, null::uuid, null::timestamptz; return; end if;
  select p.workspace_id into v_ws from public.projects p where p.id = p_project;
  if v_ws is null or not private.can_edit_workspace(v_ws) then
    return query select false, null::uuid, null::timestamptz; return;
  end if;
  insert into public.edit_locks(project_id, resource_key, held_by, held_at, expires_at)
    values (p_project, p_resource, v_uid, now(), now() + make_interval(secs => v_ttl))
  on conflict (project_id, resource_key) do update
    set held_by = v_uid, held_at = now(), expires_at = now() + make_interval(secs => v_ttl)
    where public.edit_locks.held_by = v_uid or public.edit_locks.expires_at < now();
  return query
    select el.held_by = v_uid, el.held_by, el.expires_at
    from public.edit_locks el where el.project_id = p_project and el.resource_key = p_resource;
end $fn$;

create or replace function public.release_edit_lock(p_project uuid, p_resource text)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null then return false; end if;
  delete from public.edit_locks where project_id=p_project and resource_key=p_resource and held_by=v_uid;
  get diagnostics n = row_count;
  return n > 0;
end $fn$;

revoke all on function public.acquire_edit_lock(uuid,text,int) from public;
revoke all on function public.release_edit_lock(uuid,text) from public;
grant execute on function public.acquire_edit_lock(uuid,text,int) to authenticated;
grant execute on function public.release_edit_lock(uuid,text) to authenticated;

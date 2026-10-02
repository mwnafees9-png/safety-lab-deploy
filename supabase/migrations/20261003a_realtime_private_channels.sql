-- ============================================================================
-- 20261003a_realtime_private_channels.sql — who may join and send on the live channels
--
-- THE PROBLEM (found 2 Oct 2026, security review). Every live channel the app opens
-- (co-editing, edit locks, project presence, workspace presence) was a PUBLIC Realtime
-- channel. A public channel checks nothing: anyone holding the publishable key, which ships
-- in the page, and the two ids in the channel name could join. On the co-editing channel a
-- joiner is answered with the whole document ("ysync1"), and whatever it broadcasts is
-- applied by every open copy and then saved under the editor's own login. A removed
-- contractor who kept the ids, or a viewer, could read every live edit and inject changes.
--
-- THE FIX. The app now opens these channels as PRIVATE (config.private = true), and Realtime
-- then authorizes every join and every message against row-level security on
-- realtime.messages: SELECT decides who may receive, INSERT decides who may send. This file
-- writes those two policies. Rules, by channel name:
--
--   slab-crdt:<workspace>:<project>      receive: workspace member   send: editor or above
--   slab-locks:<workspace>:<project>     receive: workspace member   send: editor or above
--   slab-presence:<workspace>:<project>  receive: workspace member   send: workspace member
--   slab-presence:<workspace>            receive: workspace member   send: workspace member
--
-- For the two project channels the project must exist, belong to that workspace and not be
-- archived. Anything else (an unknown prefix, a malformed id) is refused on a private
-- channel. Public channels are not affected by these policies at all, which is what makes
-- this file safe to apply BEFORE the app update: nothing that runs today changes.
--
-- A viewer still receives live edits (they can read the project anyway) but can no longer
-- broadcast on the co-editing or lock channels. The viewer's own copy still loads from the
-- saved state (project_crdt), so their view stays live.
--
-- ROLLOUT (no step breaks the one before it):
--   1. apply this migration (inert until a client opens a private channel);
--   2. ship the web app that opens the four channels as private;
--   3. later, in the Supabase dashboard, Realtime settings: turn OFF "Allow public access",
--      after the one remaining public channel (the cross-tool labs thread) has moved.
--
-- Customer kit: the same file is 19_realtime_private_channels.sql. On a plain Postgres with
-- no Realtime schema it does nothing.
-- ============================================================================

-- The decision, in one place. SECURITY DEFINER so it can read membership and projects
-- regardless of the caller's own table rights; it only ever answers yes or no.
create or replace function private.realtime_topic_allowed(p_topic text, p_extension text, p_sending boolean)
returns boolean
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  parts  text[];
  kind   text;
  ws     uuid;
  proj   uuid;
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if auth.uid() is null or p_topic is null then return false; end if;
  parts := string_to_array(p_topic, ':');
  kind  := parts[1];
  if kind not in ('slab-crdt', 'slab-locks', 'slab-presence') then return false; end if;
  if array_length(parts, 1) not in (2, 3) then return false; end if;
  if parts[2] !~ uuid_re then return false; end if;
  ws := parts[2]::uuid;

  if array_length(parts, 1) = 3 then
    if parts[3] !~ uuid_re then return false; end if;
    proj := parts[3]::uuid;
    if not exists (select 1 from public.projects p
                   where p.id = proj and p.workspace_id = ws and p.deleted_at is null) then
      return false;
    end if;
  elsif kind <> 'slab-presence' then
    return false;                         -- only presence has a workspace-wide channel
  end if;

  if not coalesce(private.is_workspace_member(ws), false) then return false; end if;

  if p_sending and kind in ('slab-crdt', 'slab-locks') then
    return coalesce(private.can_edit_workspace(ws), false);
  end if;
  return true;
end
$function$;

revoke all on function private.realtime_topic_allowed(text, text, boolean) from public, anon;
grant execute on function private.realtime_topic_allowed(text, text, boolean) to authenticated, service_role;

do $rt$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not present (plain Postgres): channel policies skipped';
    return;
  end if;
  execute 'drop policy if exists slab_channels_receive on realtime.messages';
  execute 'drop policy if exists slab_channels_send on realtime.messages';
  execute $p$create policy slab_channels_receive on realtime.messages
             for select to authenticated
             using (private.realtime_topic_allowed(realtime.topic(), extension, false))$p$;
  execute $p$create policy slab_channels_send on realtime.messages
             for insert to authenticated
             with check (private.realtime_topic_allowed(realtime.topic(), extension, true))$p$;
end
$rt$;

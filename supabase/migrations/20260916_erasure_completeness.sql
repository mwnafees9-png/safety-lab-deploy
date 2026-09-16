-- Erasure completeness (16 Sep 2026)
--
-- WHY. The Radia mutual NDA, Section 7, asks us to destroy their Confidential Information on
-- written request and hand over a signed certificate within five days. An audit of what
-- erase_project actually did found three problems:
--
--   1. IT MISSED THINGS. erase_project deleted three tables. Five more went with them by
--      cascade, which is fine. But `feedback` is wired ON DELETE SET NULL, so a feedback row
--      SURVIVED with its free-text message intact and only its project link nulled. The AI
--      answer cache survived completely: it holds model output derived from the customer's own
--      documents and carried no workspace or project column at all, so it could not even be
--      targeted. notification_log survived the same way.
--
--   2. THE CERTIFICATE UNDERSTATED THE TRUTH. The manifest counted two tables while the erase
--      emptied eight. A receipt that undercounts is still a wrong receipt.
--
--   3. THE CERTIFICATE CLAIMED MORE THAN WE CAN DELIVER. Deleting rows does not remove them
--      from database backups, and it does not reach the model provider. Anthropic holds API
--      inputs and outputs for 30 days by default; zero-retention agreements exist but are not
--      available for the models Anthropic designates as Covered Models. Section 7 already
--      permits retention under standard backup policies, so the honest fix is to SAY the
--      windows on the certificate rather than to pretend they are not there.
--
-- WHAT THIS DOES. Gives the cache and the notification log a project and workspace, so erasure
-- can reach them; deletes everything a project touches; counts all of it; and stamps every
-- certificate with the retention windows that are still running when it is issued.
--
-- Not in this migration, deliberately: self-service erasure (still service_role only) and
-- removal of the auth login record (an admin step the function already flags).

begin;

-- ---- 0. the append-only escape hatch, defined BEFORE the functions that use it -------------
-- change_journal and problem_report_events have BEFORE DELETE triggers that raise. Deleting a
-- project cascades into them, the trigger fires, and the whole erase aborts having deleted
-- nothing. Both triggers already honour a session setting; nothing ever set it. Transaction-local
-- (is_local = true) so it cannot outlive the erase that opened it.
create or replace function private.allow_journal_maintenance() returns void
language sql
as $function$
  select set_config('app.allow_journal_maintenance','on', true),
         set_config('app.allow_problem_maintenance','on', true);
$function$;

revoke execute on function private.allow_journal_maintenance() from public;

-- ---- 1. give the cache and the notification log something to be erased BY -------------------
-- Arrays, not single columns. ai_org_cache is keyed (user_id, h): an identical request hash
-- reached from two projects lands on ONE row, so a single project_id would record only whoever
-- wrote last and erasing the other project would silently miss it. Containment is exact.
alter table public.ai_org_cache
  add column if not exists project_ids   uuid[] not null default '{}',
  add column if not exists workspace_ids uuid[] not null default '{}';

create index if not exists ai_org_cache_project_ids_idx   on public.ai_org_cache using gin (project_ids);
create index if not exists ai_org_cache_workspace_ids_idx on public.ai_org_cache using gin (workspace_ids);

alter table public.notification_log
  add column if not exists project_id   uuid,
  add column if not exists workspace_id uuid;

create index if not exists notification_log_project_idx   on public.notification_log (project_id);
create index if not exists notification_log_workspace_idx on public.notification_log (workspace_id);

-- Rows written before today carry no stamp and cannot be targeted. Say so out loud rather than
-- letting a future certificate quietly exclude them.
comment on column public.notification_log.project_id is
  'Stamped from 16 Sep 2026. Rows older than that are NULL and are not reachable by erase_project; they are covered only by an account-scope erase (target_email) or a manual scrub.';

-- ---- 2. the cache write goes through an RPC so the arrays accumulate honestly ---------------
-- The client used to upsert the table directly, which cannot append to an array without a
-- read-modify-write race. One function, server side, does it correctly.
create or replace function public.ai_cache_put(
  p_h text, p_feature text, p_body jsonb, p_project uuid default null, p_workspace uuid default null
) returns void
language plpgsql
security invoker            -- RLS still applies: a user can only touch their own rows
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.ai_org_cache (user_id, h, feature, body, at, project_ids, workspace_ids)
  values (auth.uid(), p_h, coalesce(p_feature,''), p_body, now(),
          case when p_project   is null then '{}'::uuid[] else array[p_project]   end,
          case when p_workspace is null then '{}'::uuid[] else array[p_workspace] end)
  on conflict (user_id, h) do update set
    feature = excluded.feature,
    body    = excluded.body,
    at      = excluded.at,
    project_ids = case
      when p_project is null or public.ai_org_cache.project_ids @> array[p_project]
      then public.ai_org_cache.project_ids
      else public.ai_org_cache.project_ids || p_project end,
    workspace_ids = case
      when p_workspace is null or public.ai_org_cache.workspace_ids @> array[p_workspace]
      then public.ai_org_cache.workspace_ids
      else public.ai_org_cache.workspace_ids || p_workspace end;
end $function$;

revoke execute on function public.ai_cache_put(text, text, jsonb, uuid, uuid) from public;
grant  execute on function public.ai_cache_put(text, text, jsonb, uuid, uuid) to authenticated, service_role;

-- ---- 3. the retention windows, in ONE place -------------------------------------------------
-- These are the periods that are still running when a certificate is issued. They are facts
-- about our suppliers, not about our code, so they live somewhere a human can correct them
-- without touching the erase logic. CHECK backup_days AGAINST THE ACTUAL SUPABASE PLAN.
create or replace function private.retention_policy() returns jsonb
language sql immutable
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'database_backups', jsonb_build_object(
        'holder', 'Supabase',
        'days', 7,
        'note', 'Deleted rows persist in automated backups until the backup window rolls off. Set days to the actual retention of the current Supabase plan.'),
    'model_provider', jsonb_build_object(
        'holder', 'Anthropic',
        'days', 30,
        'note', 'Anthropic deletes API inputs and outputs within 30 days by default. Zero-retention agreements are available but NOT for models Anthropic designates Covered Models. Flagged content may be held up to 2 years. Does not apply to a customer-hosted deployment, where requests never reach Licensor.')
  );
$function$;

grant execute on function private.retention_policy() to service_role;

alter table public.destruction_certificates
  add column if not exists retention  jsonb,
  add column if not exists complete_at timestamptz;

comment on column public.destruction_certificates.retention is
  'The supplier retention windows still running when this certificate was issued. A certificate that omits these is not true on its issue date.';
comment on column public.destruction_certificates.complete_at is
  'The date after which every window above has expired, i.e. when destruction is genuinely complete.';

commit;

begin;

-- ---- 4. erase_project: empty everything the project touches, and count all of it ------------
create or replace function public.erase_project(p_project_id uuid, p_confirm boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'   -- digest() lives in extensions
as $function$
declare
  v_ws uuid; v_name text; v_manifest jsonb; v_hash text; v_cert uuid;
  v_docs int; v_yjs int; v_base int; v_crdt int; v_vers int;
  v_rev int; v_rasg int; v_rcom int; v_sign int; v_fb int; v_cache int; v_notif int;
  v_chg int; v_lock int; v_prob int;
  v_ret jsonb; v_complete timestamptz;
begin
  select workspace_id, name into v_ws, v_name from public.projects where id = p_project_id;
  if v_ws is null then raise exception 'project not found'; end if;
  if not private.can_admin_workspace(v_ws) then raise exception 'not authorized'; end if;

  -- Count BEFORE anything is removed, including the tables that go by cascade. The old manifest
  -- named two of these; the erase emptied eight. Undercounting is not a safe direction to err in
  -- when the number is going onto a signed certificate.
  select count(*) into v_docs from public.project_documents          where project_id = p_project_id;
  select count(*) into v_yjs  from public.yjs_documents              where project_id = p_project_id;
  select count(*) into v_base from public.project_baselines          where project_id = p_project_id;
  select count(*) into v_crdt from public.project_crdt               where project_id = p_project_id;
  select count(*) into v_vers from public.project_document_versions  where project_id = p_project_id;
  select count(*) into v_rev  from public.reviews                    where project_id = p_project_id;
  select count(*) into v_rasg from public.review_assignments a join public.reviews r on r.id = a.review_id where r.project_id = p_project_id;
  select count(*) into v_rcom from public.review_comments    c join public.reviews r on r.id = c.review_id where r.project_id = p_project_id;
  select count(*) into v_sign from public.signoffs                   where project_id = p_project_id;
  select count(*) into v_fb   from public.feedback                   where project_id = p_project_id;
  select count(*) into v_cache from public.ai_org_cache              where project_ids @> array[p_project_id];
  select count(*) into v_notif from public.notification_log          where project_id = p_project_id;
  -- change_journal, edit_locks and problem_report_events cascade from projects but postdate the
  -- 6 Sep schema capture, so they were invisible to the audit that produced this migration. They
  -- were being deleted correctly and counted nowhere. Checked against the LIVE schema, not the
  -- captured baseline, which is the only reason they are here.
  select count(*) into v_chg  from public.change_journal             where project_id = p_project_id;
  select count(*) into v_lock from public.edit_locks                 where project_id = p_project_id;
  select count(*) into v_prob from public.problem_report_events      where project_id = p_project_id;

  v_manifest := jsonb_build_object(
    'scope','project','project_id',p_project_id,'project_name',v_name,'workspace_id',v_ws,'at',now(),
    'deleted', jsonb_build_object(
      'project_documents',v_docs,'yjs_documents',v_yjs,'project_baselines',v_base,
      'project_crdt',v_crdt,'project_document_versions',v_vers,'reviews',v_rev,
      'review_assignments',v_rasg,'review_comments',v_rcom,'signoffs',v_sign,
      'feedback',v_fb,'ai_org_cache',v_cache,'notification_log',v_notif,
      'change_journal',v_chg,'edit_locks',v_lock,'problem_report_events',v_prob));

  if not p_confirm then return jsonb_build_object('dry_run',true,'manifest',v_manifest); end if;

  perform private.allow_journal_maintenance();   -- or the cascade into the journals aborts everything

  -- feedback is ON DELETE SET NULL, so it must go BEFORE the project row or it survives with
  -- its message text and only its project link cleared. That was the actual bug.
  delete from public.feedback         where project_id = p_project_id;
  delete from public.notification_log where project_id = p_project_id;
  -- A cache row reached from more than one project loses only this project's claim on it; it is
  -- deleted outright once no project is left holding it.
  update public.ai_org_cache
     set project_ids = array_remove(project_ids, p_project_id),
         workspace_ids = case when (select count(*) from public.projects
                                     where workspace_id = v_ws and id <> p_project_id) = 0
                              then array_remove(workspace_ids, v_ws) else workspace_ids end
   where project_ids @> array[p_project_id];
  delete from public.ai_org_cache where project_ids = '{}' and workspace_ids = '{}';

  delete from public.yjs_documents    where project_id = p_project_id;
  delete from public.project_documents where project_id = p_project_id;
  delete from public.projects         where id         = p_project_id;   -- cascades the rest

  v_ret := private.retention_policy();
  v_complete := now() + (greatest((v_ret->'database_backups'->>'days')::int,
                                  (v_ret->'model_provider'->>'days')::int) || ' days')::interval;
  v_hash := encode(digest(v_manifest::text,'sha256'),'hex');
  insert into public.destruction_certificates
    (user_id,scope,target_id,target_name,deleted_counts,manifest_sha256,issued_by_email,retention,complete_at)
  values (auth.uid(),'project',p_project_id,v_name, v_manifest->'deleted', v_hash,
          auth.jwt()->>'email', v_ret, v_complete)
  returning id into v_cert;

  return jsonb_build_object('deleted',true,'certificate_id',v_cert,'manifest_sha256',v_hash,
                            'manifest',v_manifest,'retention',v_ret,'complete_at',v_complete);
end $function$;

revoke execute on function public.erase_project(uuid, boolean) from anon, authenticated, public;
grant  execute on function public.erase_project(uuid, boolean) to service_role;

-- ---- 5. erase_my_account: same completeness ------------------------------------------------
create or replace function private.erase_my_account(p_confirm boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'   -- digest() lives in extensions
as $function$
declare
  v_uid uuid := auth.uid(); v_email text := auth.jwt()->>'email';
  v_owned uuid[]; v_projects uuid[];
  v_ws int; v_proj int; v_docs int; v_yjs int; v_base int; v_vers int; v_crdt int;
  v_rev int; v_sign int; v_fb int; v_cache int; v_notif int; v_lic int; v_mem int;
  v_chg int; v_prob int; v_waud int; v_sec int;
  v_manifest jsonb; v_hash text; v_cert uuid; v_ret jsonb; v_complete timestamptz;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select coalesce(array_agg(id),'{}') into v_owned    from public.workspaces where owner_id = v_uid;
  select coalesce(array_agg(id),'{}') into v_projects from public.projects   where workspace_id = any(v_owned);
  v_ws   := coalesce(array_length(v_owned,1),0);
  v_proj := coalesce(array_length(v_projects,1),0);

  select count(*) into v_docs from public.project_documents         where project_id = any(v_projects);
  select count(*) into v_yjs  from public.yjs_documents             where project_id = any(v_projects);
  select count(*) into v_base from public.project_baselines         where project_id = any(v_projects);
  select count(*) into v_vers from public.project_document_versions where project_id = any(v_projects);
  select count(*) into v_crdt from public.project_crdt              where project_id = any(v_projects);
  select count(*) into v_rev  from public.reviews                   where project_id = any(v_projects);
  select count(*) into v_sign from public.signoffs                  where project_id = any(v_projects);
  -- feedback is ON DELETE SET NULL on BOTH project_id and workspace_id, so a row left by
  -- another member of a workspace this user owns is reachable only by the workspace match.
  select count(*) into v_fb   from public.feedback                  where user_id = v_uid or project_id = any(v_projects) or workspace_id = any(v_owned);
  select count(*) into v_cache from public.ai_org_cache             where user_id = v_uid;
  select count(*) into v_notif from public.notification_log         where target_email = v_email or workspace_id = any(v_owned);
  select count(*) into v_lic  from public.license_tokens            where user_id = v_uid;
  select count(*) into v_mem  from public.workspace_members         where user_id = v_uid or workspace_id = any(v_owned);
  select count(*) into v_chg  from public.change_journal             where project_id = any(v_projects);
  select count(*) into v_prob from public.problem_report_events      where project_id = any(v_projects);
  select count(*) into v_waud from public.workspace_audit            where workspace_id = any(v_owned);
  select count(*) into v_sec  from public.user_secrets               where user_id = v_uid;
  -- expiry_watch is a VIEW over users and license_tokens, not a table. It cannot be deleted from
  -- and it empties itself once those rows go, so it is neither deleted nor counted: a manifest
  -- line claiming a view was destroyed would be one more false statement on a signed certificate.

  v_manifest := jsonb_build_object('scope','account','user',v_uid,'at',now(),
    'deleted', jsonb_build_object(
      'owned_workspaces',v_ws,'projects',v_proj,'project_documents',v_docs,'yjs_documents',v_yjs,
      'project_baselines',v_base,'project_document_versions',v_vers,'project_crdt',v_crdt,
      'reviews',v_rev,'signoffs',v_sign,'feedback',v_fb,'ai_org_cache',v_cache,
      'notification_log',v_notif,'license_tokens',v_lic,'workspace_members',v_mem,
      'change_journal',v_chg,'problem_report_events',v_prob,'workspace_audit',v_waud,
      'user_secrets',v_sec));

  if not p_confirm then return jsonb_build_object('dry_run',true,'manifest',v_manifest); end if;

  perform private.allow_journal_maintenance();   -- or the cascade into the journals aborts everything

  delete from public.feedback         where user_id = v_uid or project_id = any(v_projects) or workspace_id = any(v_owned);
  delete from public.notification_log where target_email = v_email or workspace_id = any(v_owned);
  delete from public.ai_org_cache     where user_id = v_uid;
  delete from public.yjs_documents    where project_id = any(v_projects);
  delete from public.project_documents where project_id = any(v_projects);
  delete from public.projects         where workspace_id = any(v_owned);
  delete from public.workspace_members where workspace_id = any(v_owned);
  delete from public.workspaces       where id = any(v_owned);
  delete from public.workspace_members where user_id = v_uid;
  delete from public.license_tokens   where user_id = v_uid;
  -- user_secrets holds this user's stored credentials; expiry_watch their trial state. Neither
  -- is Customer Data, but both are theirs and neither survives an account erasure.
  delete from public.user_secrets     where user_id = v_uid;

  v_hash := encode(digest(coalesce(v_email,'')||v_uid::text||now()::text,'sha256'),'hex');
  update public.users set email = 'redacted+'||left(v_hash,16)||'@deleted.invalid' where id = v_uid;

  v_ret := private.retention_policy();
  v_complete := now() + (greatest((v_ret->'database_backups'->>'days')::int,
                                  (v_ret->'model_provider'->>'days')::int) || ' days')::interval;
  insert into public.destruction_certificates
    (user_id,scope,target_id,target_name,deleted_counts,manifest_sha256,issued_by_email,retention,complete_at)
  values (v_uid,'account',v_uid,'account', v_manifest->'deleted', v_hash, v_email, v_ret, v_complete)
  returning id into v_cert;

  return jsonb_build_object('deleted',true,'certificate_id',v_cert,'manifest_sha256',v_hash,
    'manifest',v_manifest,'retention',v_ret,'complete_at',v_complete,
    'note','Removing the login record from auth.users remains a final admin step.');
end $function$;

commit;

begin;

-- ---- 6. THE TWO REASONS erase_project HAS NEVER RUN ----------------------------------------
-- Found by seeding a project with a row in every table that touches it and actually calling the
-- function, which had apparently never been done. It failed twice for reasons unrelated to the
-- gaps above, and production agrees: destruction_certificates holds ZERO rows against 591
-- projects, so no erasure has ever completed there either.
--
--   a) THE APPEND-ONLY JOURNALS REFUSE THE CASCADE. change_journal and problem_report_events
--      have BEFORE DELETE triggers that raise. Deleting the project row cascades into them, the
--      trigger fires, the whole function aborts and NOTHING is deleted. Both triggers already
--      carry a maintenance escape hatch keyed on a session setting; the erase functions simply
--      never opened it. Opened transaction-locally below, so it cannot outlive the erase.
--
--   b) digest() IS NOT ON THE SEARCH PATH. The manifest hash calls digest(), which pgcrypto
--      installs into the `extensions` schema, while both functions pinned search_path to public
--      and pg_temp. Every call raised "function digest(text, unknown) does not exist" at the
--      hashing line, for every project, with or without journal rows.
--
-- Either one alone made the Section 7 destruction promise unperformable.
-- The hatch itself is opened inside both function bodies above; it is defined in section 0.

alter function public.erase_project(uuid, boolean) set search_path to 'public', 'extensions', 'pg_temp';
alter function private.erase_my_account(boolean)   set search_path to 'public', 'extensions', 'pg_temp';

commit;

-- ---- PROVEN ON THE THROWAWAY PROJECT (yiisexbngnjakkqkmctw), 16 Sep 2026 -------------------
-- Seeded one project with a row in all 15 tables that reference it, including a feedback row
-- whose message was a marker string. Dry run counted 15 tables x 1 row. Confirmed erase returned
-- a certificate carrying both retention windows and a complete_at of +30 days. Eighteen
-- follow-up counts, including a LIKE search for the feedback marker text, all returned zero.
-- PRODUCTION IS NOT TOUCHED BY THIS FILE. Waqas applies it.

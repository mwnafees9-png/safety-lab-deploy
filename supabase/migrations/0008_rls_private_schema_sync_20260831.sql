-- =============================================================================
-- Safety Lab Aero — H-8 SYNC NOTE, 31 Aug 2026.
-- RECONCILIATION ONLY. Codifies what production ALREADY IS. Do not apply to
-- production: production is the correct side of this drift. This file exists so
-- the migration tree can rebuild production, which today it cannot.
--
-- Censused live against fhrqkhdrwbfnizkepkch on 31 Aug 2026 via pg_policies and
-- pg_get_functiondef, the same way the 20 Aug guard SYNC NOTE was written.
--
-- WHY THE `0008_` PREFIX AND NOT A DATE. Migrations apply in filename order, and
-- 20260820b_project_recovery_rpc.sql / 20260821_baseline_restore_rpc.sql /
-- 20260831_invitation_accept_rpc.sql all CALL private.* — so this file has to
-- run before them, not after. Dated first, caught by the H-8 suite's ordering
-- check on its first run: `20260831_...` sorts after all three and the rebuild
-- would still have failed. The date is kept here in the header instead.
--
-- ---------------------------------------------------------------------------
-- WHAT THE CENSUS FOUND
--
-- 1. THE RLS HELPERS LIVE IN `private`, AND NO MIGRATION ON DISK PUTS THEM
--    THERE. Production has exactly one copy of each of the seven helpers
--    (is_workspace_member, workspace_role, is_workspace_owner,
--    can_edit_workspace, can_admin_workspace, can_review_workspace,
--    is_safety_lab_admin), all in schema `private`, all SECURITY DEFINER with
--    search_path pinned to 'public'. There is NO public.is_workspace_member in
--    production at all. 0001 creates them in `public`; 0003 adds
--    can_review_workspace in `public`; nothing on disk ever creates the
--    `private` schema or moves them. The move happened directly against the
--    database and was never written down.
--
-- 2. ALL 59 LIVE POLICIES CALL THE HELPERS SCHEMA-QUALIFIED
--    (`private.can_edit_workspace(...)`). All 18 helper-calling policies on
--    disk call them UNQUALIFIED. Not one `private.` reference appears in any
--    policy on disk.
--
-- 3. THEREFORE 0001'S HEADER IS NOW FALSE, AND DANGEROUSLY SO. It says the file
--    is "the version-controlled source of truth for the access model that is
--    ALREADY LIVE" and that "re-applying it is idempotent and non-destructive".
--    Re-applying it today would CREATE a second set of helpers in `public` —
--    without the 0002/0005 anon-execute revokes — and then repoint all 18
--    policies at the unqualified names, which resolve to those new public
--    copies. That is a silent authorization downgrade performed by a file whose
--    own comment invites you to re-run it. 0001's header has been corrected in
--    place in the same commit as this file.
--
-- 4. THE THREE NEWEST RPCs ALREADY DEPEND ON `private`.
--    20260820b_project_recovery_rpc.sql, 20260821_baseline_restore_rpc.sql and
--    20260831_invitation_accept_rpc.sql all call private.can_admin_workspace /
--    private.workspace_role. On a fresh database built from disk they would
--    fail outright, because nothing creates that schema. The tree is not
--    reconstructible today. This file is what makes it reconstructible.
--
-- 5. STILL NOT ON DISK, AND NOT CLOSED HERE (named so it is not rediscovered):
--    private.audit_immutable(), private.erase_my_account(boolean) and
--    private.verify_signoff_chain() also exist only in production. They are not
--    RLS helpers, so no policy depends on them and the tree's ACCESS MODEL is
--    complete without them — but the tree is still not a full rebuild until
--    they are codified too. Filed as H-8b.
--
-- 6. NOT DRIFT, CHECKED AND CLEARED:
--    · 0007_config_management.sql is unapplied and its three tables do not
--      exist in production — but the file says "REVIEW before applying" and no
--      client code references those tables. Deliberate, not drift.
--    · public.pending_comps has RLS enabled and zero policies, i.e. it is
--      service-role only. No client code touches it. Deliberate, not drift.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

-- ---- The seven RLS helpers, verbatim from live pg_get_functiondef ----------
-- Each is SECURITY DEFINER so a policy can read workspace_members without
-- recursing into that table's own RLS. search_path pinned (#262).

create or replace function private.workspace_role(p_workspace uuid)
  returns text language sql stable security definer set search_path to 'public'
as $$
    select role from public.workspace_members
    where workspace_id = p_workspace and user_id = auth.uid()
    limit 1;
$$;

create or replace function private.is_workspace_member(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$
    select exists (
        select 1 from public.workspace_members
        where workspace_id = p_workspace
          and user_id = auth.uid()
    );
$$;

create or replace function private.is_workspace_owner(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select private.workspace_role(p_workspace) = 'owner'; $$;

create or replace function private.can_edit_workspace(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select private.workspace_role(p_workspace) in ('owner','admin','editor'); $$;

create or replace function private.can_admin_workspace(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select private.workspace_role(p_workspace) in ('owner','admin'); $$;

create or replace function private.can_review_workspace(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select private.workspace_role(p_workspace) in ('owner','admin','editor','reviewer'); $$;

create or replace function private.is_safety_lab_admin()
  returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (auth.jwt() ->> 'email') in (
      'mwnafees9@gmail.com',
      'waqas.nafees@safetylabaero.com'
    ),
    false
  );
$$;

-- 0002 §B2 / 0005 §A grant posture, carried forward: the policies run these as
-- `authenticated`, so that role must keep EXECUTE; anon/PUBLIC must not, or the
-- helpers become callable through /rest/v1/rpc.
do $$
declare f text;
begin
  foreach f in array array[
    'private.workspace_role(uuid)', 'private.is_workspace_member(uuid)',
    'private.is_workspace_owner(uuid)', 'private.can_edit_workspace(uuid)',
    'private.can_admin_workspace(uuid)', 'private.can_review_workspace(uuid)',
    'private.is_safety_lab_admin()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant  execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---- Retire the public copies IF a rebuild created them --------------------
-- Guarded, not unconditional: on production these do not exist and this is a
-- no-op. On a tree rebuilt from 0001 they DO exist, and leaving them behind is
-- the whole hazard in finding (3) — an unqualified call in any future policy
-- would silently bind to the un-revoked copy.
drop function if exists public.is_workspace_member(uuid);
drop function if exists public.workspace_role(uuid);
drop function if exists public.is_workspace_owner(uuid);
drop function if exists public.can_edit_workspace(uuid);
drop function if exists public.can_admin_workspace(uuid);
drop function if exists public.can_review_workspace(uuid);
drop function if exists public.is_safety_lab_admin();

-- ---- Policies, repointed at private.* to match live -------------------------
-- Every policy below is BYTE-EQUIVALENT to what pg_policies reports today; the
-- only change against the disk copies is the schema qualification.

drop policy if exists workspaces_member_read on public.workspaces;
create policy workspaces_member_read on public.workspaces for select to public using (private.is_workspace_member(id));
drop policy if exists workspaces_owner_update on public.workspaces;
create policy workspaces_owner_update on public.workspaces for update to public using (private.is_workspace_owner(id));
drop policy if exists workspaces_owner_delete on public.workspaces;
create policy workspaces_owner_delete on public.workspaces for delete to public using (private.is_workspace_owner(id));

drop policy if exists ws_members_member_read on public.workspace_members;
create policy ws_members_member_read on public.workspace_members for select to public using (private.is_workspace_member(workspace_id));
drop policy if exists ws_members_admin_insert on public.workspace_members;
create policy ws_members_admin_insert on public.workspace_members for insert to public with check (private.can_admin_workspace(workspace_id));
drop policy if exists ws_members_admin_update on public.workspace_members;
create policy ws_members_admin_update on public.workspace_members for update to public using (private.can_admin_workspace(workspace_id));
drop policy if exists ws_members_admin_delete on public.workspace_members;
create policy ws_members_admin_delete on public.workspace_members for delete to public using (private.can_admin_workspace(workspace_id));

drop policy if exists projects_member_read on public.projects;
create policy projects_member_read on public.projects for select to public using (private.is_workspace_member(workspace_id) and deleted_at is null);
drop policy if exists projects_editor_insert on public.projects;
create policy projects_editor_insert on public.projects for insert to public with check (private.can_edit_workspace(workspace_id));
drop policy if exists projects_editor_update on public.projects;
create policy projects_editor_update on public.projects for update to public using (private.can_edit_workspace(workspace_id));
drop policy if exists projects_admin_delete on public.projects;
create policy projects_admin_delete on public.projects for delete to public using (private.can_admin_workspace(workspace_id));

drop policy if exists invitations_admin_read on public.invitations;
create policy invitations_admin_read on public.invitations for select to public using (private.can_admin_workspace(workspace_id));
drop policy if exists invitations_admin_insert on public.invitations;
create policy invitations_admin_insert on public.invitations for insert to public with check (private.can_admin_workspace(workspace_id));
drop policy if exists invitations_admin_update on public.invitations;
create policy invitations_admin_update on public.invitations for update to public using (private.can_admin_workspace(workspace_id));
drop policy if exists invitations_admin_delete on public.invitations;
create policy invitations_admin_delete on public.invitations for delete to public using (private.can_admin_workspace(workspace_id));

drop policy if exists ws_audit_member_read on public.workspace_audit;
create policy ws_audit_member_read on public.workspace_audit for select to public using (private.is_workspace_member(workspace_id));

drop policy if exists feedback_select_admin on public.feedback;
create policy feedback_select_admin on public.feedback for select to authenticated using (private.is_safety_lab_admin());
drop policy if exists notification_log_select_admin on public.notification_log;
create policy notification_log_select_admin on public.notification_log for select to authenticated using (private.is_safety_lab_admin());

-- project_documents / yjs_documents / project_crdt inherit through projects.
drop policy if exists project_docs_member_read on public.project_documents;
create policy project_docs_member_read on public.project_documents for select to public
  using (exists (select 1 from public.projects p where p.id = project_documents.project_id
                 and private.is_workspace_member(p.workspace_id) and p.deleted_at is null));
drop policy if exists project_docs_editor_write on public.project_documents;
create policy project_docs_editor_write on public.project_documents for all to public
  using      (exists (select 1 from public.projects p where p.id = project_documents.project_id and private.can_edit_workspace(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_documents.project_id and private.can_edit_workspace(p.workspace_id)));

drop policy if exists yjs_docs_member_read on public.yjs_documents;
create policy yjs_docs_member_read on public.yjs_documents for select to public
  using (exists (select 1 from public.projects p where p.id = yjs_documents.project_id
                 and private.is_workspace_member(p.workspace_id) and p.deleted_at is null));
drop policy if exists yjs_docs_editor_write on public.yjs_documents;
create policy yjs_docs_editor_write on public.yjs_documents for all to public
  using      (exists (select 1 from public.projects p where p.id = yjs_documents.project_id and private.can_edit_workspace(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = yjs_documents.project_id and private.can_edit_workspace(p.workspace_id)));

-- project_crdt exists in production with these two policies and appears in NO
-- migration on disk. Codified here for the first time.
drop policy if exists project_crdt_member_read on public.project_crdt;
create policy project_crdt_member_read on public.project_crdt for select to public
  using (exists (select 1 from public.projects p where p.id = project_crdt.project_id
                 and private.is_workspace_member(p.workspace_id) and p.deleted_at is null));
drop policy if exists project_crdt_editor_write on public.project_crdt;
create policy project_crdt_editor_write on public.project_crdt for all to public
  using      (exists (select 1 from public.projects p where p.id = project_crdt.project_id and private.can_edit_workspace(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_crdt.project_id and private.can_edit_workspace(p.workspace_id)));

-- Reviews / baselines / signoffs / document versions (0003, 0004) all call the
-- helpers through a projects join; production has every one of them qualified.
-- They are re-emitted here for the same reason as the block above.
drop policy if exists baselines_member_read on public.project_baselines;
create policy baselines_member_read on public.project_baselines for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_baselines.project_id
                 and private.is_workspace_member(p.workspace_id) and p.deleted_at is null));
drop policy if exists baselines_editor_insert on public.project_baselines;
create policy baselines_editor_insert on public.project_baselines for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_baselines.project_id and private.can_edit_workspace(p.workspace_id)));
drop policy if exists baselines_editor_update on public.project_baselines;
create policy baselines_editor_update on public.project_baselines for update to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_baselines.project_id and private.can_edit_workspace(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_baselines.project_id and private.can_edit_workspace(p.workspace_id)));
drop policy if exists baselines_admin_delete on public.project_baselines;
create policy baselines_admin_delete on public.project_baselines for delete to authenticated
  using (status <> 'released' and exists (select 1 from public.projects p where p.id = project_baselines.project_id and private.can_admin_workspace(p.workspace_id)));

drop policy if exists pdv_member_read on public.project_document_versions;
create policy pdv_member_read on public.project_document_versions for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_document_versions.project_id
                 and private.is_workspace_member(p.workspace_id) and p.deleted_at is null));
drop policy if exists pdv_editor_insert on public.project_document_versions;
create policy pdv_editor_insert on public.project_document_versions for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_document_versions.project_id and private.can_edit_workspace(p.workspace_id)));
drop policy if exists pdv_admin_delete on public.project_document_versions;
create policy pdv_admin_delete on public.project_document_versions for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = project_document_versions.project_id and private.can_admin_workspace(p.workspace_id)));

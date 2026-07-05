-- =============================================================================
-- Safety Lab Aero — Row-Level Security BASELINE (codified from production)
-- Project: fhrqkhdrwbfnizkepch (Safety-Lab, us-east-2)  ·  #262 [Data-Sec]
--
-- This file is the version-controlled source of truth for the access model that
-- is ALREADY LIVE in production. It was exported from the running database on
-- 2026-06-21 and verified by the Supabase security advisor (no "RLS disabled"
-- findings). Re-applying it is idempotent and non-destructive.
--
-- Model in one line: a row is visible/writable only to members of the workspace
-- that owns it, graded by role (owner > admin > editor > reviewer > viewer).
-- The safety-analysis blob (project_documents / yjs_documents) inherits this via
-- a join to projects. User / usage / license rows are self-only. Admin views go
-- through is_safety_lab_admin().
-- =============================================================================

-- ---- Membership helper functions (SECURITY DEFINER so RLS can check membership
-- ---- without recursive RLS on workspace_members). search_path pinned (#262). ----
create or replace function public.is_workspace_member(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.workspace_members
       where workspace_id = p_workspace and user_id = auth.uid()); $$;

create or replace function public.workspace_role(p_workspace uuid)
  returns text language sql stable security definer set search_path to 'public'
as $$ select role from public.workspace_members
       where workspace_id = p_workspace and user_id = auth.uid() limit 1; $$;

create or replace function public.is_workspace_owner(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select public.workspace_role(p_workspace) = 'owner'; $$;

create or replace function public.can_edit_workspace(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select public.workspace_role(p_workspace) in ('owner','admin','editor'); $$;

create or replace function public.can_admin_workspace(p_workspace uuid)
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select public.workspace_role(p_workspace) in ('owner','admin'); $$;

create or replace function public.is_safety_lab_admin()
  returns boolean language sql stable security definer set search_path to 'public'
as $$ select coalesce((auth.jwt() ->> 'email') in
       ('mwnafees9@gmail.com','waqas.nafees@safetylabaero.com'), false); $$;

-- ---- Enable RLS on every public table that holds customer / tenant data ----
alter table public.users             enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects          enable row level security;
alter table public.project_documents enable row level security;
alter table public.yjs_documents     enable row level security;
alter table public.invitations       enable row level security;
alter table public.workspace_audit   enable row level security;
alter table public.ai_usage          enable row level security;
alter table public.audit_log         enable row level security;
alter table public.license_tokens    enable row level security;
alter table public.feedback          enable row level security;
alter table public.notification_log  enable row level security;

-- ---- Policies (drop-then-create so this file is re-appliable) ----
-- users / usage / license / audit : self-only ------------------------------------
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users for select to public using (auth.uid() = id);
drop policy if exists ai_usage_self_read on public.ai_usage;
create policy ai_usage_self_read on public.ai_usage for select to public using (auth.uid() = user_id);
drop policy if exists audit_self_read on public.audit_log;
create policy audit_self_read on public.audit_log for select to public using (auth.uid() = user_id);
drop policy if exists license_tokens_self_select on public.license_tokens;
create policy license_tokens_self_select on public.license_tokens for select to public using (auth.uid() = user_id);

-- workspaces : member-read, self-insert, owner-update/delete ---------------------
drop policy if exists workspaces_member_read on public.workspaces;
create policy workspaces_member_read on public.workspaces for select to public using (is_workspace_member(id));
drop policy if exists workspaces_self_insert on public.workspaces;
create policy workspaces_self_insert on public.workspaces for insert to public with check (auth.uid() = owner_id);
drop policy if exists workspaces_owner_update on public.workspaces;
create policy workspaces_owner_update on public.workspaces for update to public using (is_workspace_owner(id));
drop policy if exists workspaces_owner_delete on public.workspaces;
create policy workspaces_owner_delete on public.workspaces for delete to public using (is_workspace_owner(id));

-- workspace_members : member-read, self-join, admin-manage -----------------------
drop policy if exists ws_members_member_read on public.workspace_members;
create policy ws_members_member_read on public.workspace_members for select to public using (is_workspace_member(workspace_id));
drop policy if exists ws_members_self_join on public.workspace_members;
create policy ws_members_self_join on public.workspace_members for insert to public with check (auth.uid() = user_id);
drop policy if exists ws_members_admin_insert on public.workspace_members;
create policy ws_members_admin_insert on public.workspace_members for insert to public with check (can_admin_workspace(workspace_id));
drop policy if exists ws_members_admin_update on public.workspace_members;
create policy ws_members_admin_update on public.workspace_members for update to public using (can_admin_workspace(workspace_id));
drop policy if exists ws_members_admin_delete on public.workspace_members;
create policy ws_members_admin_delete on public.workspace_members for delete to public using (can_admin_workspace(workspace_id));

-- projects : member-read (not soft-deleted), editor-write, admin-delete ----------
drop policy if exists projects_member_read on public.projects;
create policy projects_member_read on public.projects for select to public using (is_workspace_member(workspace_id) and deleted_at is null);
drop policy if exists projects_editor_insert on public.projects;
create policy projects_editor_insert on public.projects for insert to public with check (can_edit_workspace(workspace_id));
drop policy if exists projects_editor_update on public.projects;
create policy projects_editor_update on public.projects for update to public using (can_edit_workspace(workspace_id));
drop policy if exists projects_admin_delete on public.projects;
create policy projects_admin_delete on public.projects for delete to public using (can_admin_workspace(workspace_id));

-- project_documents (the safety-analysis blob) : inherits project membership -----
drop policy if exists project_docs_member_read on public.project_documents;
create policy project_docs_member_read on public.project_documents for select to public
  using (exists (select 1 from public.projects p where p.id = project_documents.project_id
                 and is_workspace_member(p.workspace_id) and p.deleted_at is null));
drop policy if exists project_docs_editor_write on public.project_documents;
create policy project_docs_editor_write on public.project_documents for all to public
  using      (exists (select 1 from public.projects p where p.id = project_documents.project_id and can_edit_workspace(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_documents.project_id and can_edit_workspace(p.workspace_id)));

-- yjs_documents (realtime co-edit state) : same inheritance ----------------------
drop policy if exists yjs_docs_member_read on public.yjs_documents;
create policy yjs_docs_member_read on public.yjs_documents for select to public
  using (exists (select 1 from public.projects p where p.id = yjs_documents.project_id
                 and is_workspace_member(p.workspace_id) and p.deleted_at is null));
drop policy if exists yjs_docs_editor_write on public.yjs_documents;
create policy yjs_docs_editor_write on public.yjs_documents for all to public
  using      (exists (select 1 from public.projects p where p.id = yjs_documents.project_id and can_edit_workspace(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = yjs_documents.project_id and can_edit_workspace(p.workspace_id)));

-- invitations / workspace_audit : admin / member scoped --------------------------
drop policy if exists invitations_admin_read   on public.invitations;
create policy invitations_admin_read   on public.invitations for select to public using (can_admin_workspace(workspace_id));
drop policy if exists invitations_admin_insert on public.invitations;
create policy invitations_admin_insert on public.invitations for insert to public with check (can_admin_workspace(workspace_id));
drop policy if exists invitations_admin_update on public.invitations;
create policy invitations_admin_update on public.invitations for update to public using (can_admin_workspace(workspace_id));
drop policy if exists invitations_admin_delete on public.invitations;
create policy invitations_admin_delete on public.invitations for delete to public using (can_admin_workspace(workspace_id));
drop policy if exists ws_audit_member_read on public.workspace_audit;
create policy ws_audit_member_read on public.workspace_audit for select to public using (is_workspace_member(workspace_id));

-- feedback / notification_log : own-insert + admin-read --------------------------
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback for insert to authenticated with check (user_id = auth.uid());
drop policy if exists feedback_select_admin on public.feedback;
create policy feedback_select_admin on public.feedback for select to authenticated using (is_safety_lab_admin());
drop policy if exists notification_log_select_admin on public.notification_log;
create policy notification_log_select_admin on public.notification_log for select to authenticated using (is_safety_lab_admin());

-- An admin may add members but never with role 'owner'.
-- Only workspace creation (ws_members_self_join) and transfer_workspace_ownership set 'owner'.
alter policy ws_members_admin_insert on public.workspace_members
  with check (private.can_admin_workspace(workspace_id) and role <> 'owner');

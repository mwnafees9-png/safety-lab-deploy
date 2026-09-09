-- ===== GRANT LOCKDOWN (customer install) =====
-- 9 Sep 2026 — reproduces prod's hardened privilege state that the 6-Sep catalog capture
-- did NOT preserve. Two lossy spots the capture missed, both found by applying the baseline
-- to a clean Supabase and running the security advisor:
--   (1) CREATE FUNCTION grants EXECUTE to PUBLIC by default, and Supabase default privileges
--       grant EXECUTE to anon/authenticated — so every function (including SECURITY DEFINER
--       trigger/internal functions) is exposed as a PostgREST RPC. Prod revokes that and
--       re-grants only the genuine client RPCs. The capture recorded the positive grants but
--       not the revokes, so the raw baseline OVER-EXPOSES internal functions.
--   (2) public.expiry_watch is a reporting view over auth.users; prod keeps it service_role-only.
-- This block restores both. Apply it LAST, after 70_func_grants / 80_table_grants.

-- (2) view over auth.users: service_role only, as on prod.
revoke all on public.expiry_watch from anon, authenticated;

-- (1) strip blanket function access, then re-grant EXACTLY prod's client-callable set.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.accept_invitation(text) to anon, authenticated;
grant execute on function public.acquire_edit_lock(uuid, text, integer) to anon, authenticated;
grant execute on function public.archive_project(uuid) to authenticated;
grant execute on function public.archived_projects(uuid) to authenticated;
grant execute on function public.erase_my_account(boolean) to anon, authenticated;
grant execute on function public.pending_invitations(uuid) to anon, authenticated;
grant execute on function public.release_edit_lock(uuid, text) to anon, authenticated;
grant execute on function public.restore_project(uuid) to authenticated;
grant execute on function public.set_updated_at() to anon, authenticated;
grant execute on function public.sl_doc_items(jsonb) to anon, authenticated;
grant execute on function public.sl_recovery_points(uuid) to anon, authenticated;
grant execute on function public.sl_restore_project_baseline(uuid, uuid) to authenticated;
grant execute on function public.sl_restore_project_version(uuid, integer) to authenticated;
grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated;
grant execute on function public.verify_signoff_chain() to anon, authenticated;

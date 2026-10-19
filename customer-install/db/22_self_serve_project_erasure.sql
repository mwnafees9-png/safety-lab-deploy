-- ============================================================================
-- 22 — self-serve project erasure (SEC-4, 18 Oct 2026). Twin of
-- supabase/migrations/20261018a_self_serve_project_erasure.sql; see it for the reasoning.
-- An owner or admin of a workspace can permanently erase one of its projects and receives a
-- certificate of destruction. public.erase_project checks the role itself (can_admin_workspace).
-- ============================================================================

revoke execute on function public.erase_project(uuid, boolean) from anon, public;
grant  execute on function public.erase_project(uuid, boolean) to authenticated, service_role;

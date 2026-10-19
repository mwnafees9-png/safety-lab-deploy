-- ============================================================================
-- 24 — USAGE on the private schema for the signed-in roles, as production has it (18 Oct 2026). Twin of
-- supabase/migrations/20261018c_private_schema_usage_capture.sql; see it for the reasoning. Without it,
-- account erasure fails on a customer install with "permission denied for schema private".
-- ============================================================================
grant usage on schema private to authenticated, anon, service_role;

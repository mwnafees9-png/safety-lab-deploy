-- Harden three security-advisor findings (all reversible, no data touched).
-- Applied to prod fhrqkhdrwbfnizkepkch 7 Sep 2026.

-- (1) Two TRIGGER-only functions were also callable via the REST API. Triggers fire
-- regardless of EXECUTE grants, so removing API access changes nothing at runtime.
revoke all on function public.apply_pending_comp() from anon, authenticated, public;
revoke all on function public.sl_guard_project_document() from anon, authenticated, public;

-- (2) Pin search_path on a pure jsonb helper (no schema refs -> empty is strictest/safest).
alter function public.sl_doc_items(jsonb) set search_path = '';

-- (3) public.pending_comps is RLS-locked (RLS on, no policy) and touched only via the
-- SECURITY DEFINER apply_pending_comp trigger. Strip the wide anon/authenticated table
-- grants so the lock is explicit at the grant level too (RLS already denied them).
revoke all on table public.pending_comps from anon, authenticated;

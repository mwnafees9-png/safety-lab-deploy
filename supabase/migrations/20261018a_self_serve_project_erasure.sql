-- ============================================================================
-- 18 Oct 2026 — SEC-4: an owner or admin can erase a project themselves, as the paper promises.
-- STATUS: NOT YET APPLIED IN PRODUCTION (waits for Waqas's go). Customer kit: 22_self_serve_project_erasure.sql.
--
-- THE PAPER (SL-WP-0003 v3.0, section 18): "self-serve permanent erasure, of an individual project or of
-- an entire account, that purges the underlying content ... and issues a certificate of destruction".
-- THE CODE before this file: account erasure was self-serve (erase_my_account); project erasure was
-- callable by the service role only, so a customer had to ask us. Ruled 28 Sep 2026: the code is fixed to
-- match the paper unless that makes the tool worse.
--
-- WHY THE 5 SEP REVOKE IS SAFE TO UNDO. 20260905 section 7 took erase_project away from `authenticated`
-- because the repo granted it while production did not (drift), at a time when the role helpers could
-- return NULL and a NULL gate let a stranger through (20260831c). That root cause is fixed:
-- private.can_admin_workspace is coalesce(... in ('owner','admin'), false), never NULL (checked on
-- production 18 Oct 2026). erase_project checks it itself, before the dry run and before any delete, so
-- the role is enforced in the database, not by the button. A member, viewer or stranger gets
-- 'not authorized'; anon cannot call it at all.
--
-- AFTER APPLYING, PROBE (rolled back; the dry run writes nothing):
--   as a signed-in user who is not an owner or admin of the project's workspace:
--     select public.erase_project('<project id>', false);  -> ERROR: not authorized
--   as an owner or admin of it:
--     select public.erase_project('<project id>', false);  -> {"dry_run": true, "manifest": {...}}
--   as anon: permission denied (42501).
-- ============================================================================

revoke execute on function public.erase_project(uuid, boolean) from anon, public;
grant  execute on function public.erase_project(uuid, boolean) to authenticated, service_role;

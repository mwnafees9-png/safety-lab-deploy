-- =====================================================================================
-- TRUNCATE is not covered by row-level security. Take it off the API roles.  17 Sep 2026.
--
-- WHAT WAS FOUND. anon and authenticated held TRUNCATE on 19 public tables, including every
-- one that holds customer work:
--
--   projects · project_documents · project_document_versions · project_crdt · yjs_documents
--   workspaces · workspace_members · users · license_tokens · reviews · review_assignments
--   review_comments · invitations · notification_log · feedback · edit_locks · ai_usage
--   ai_org_cache · approved_tenants
--
-- RLS is enabled on all of them, which is why this is easy to look at and call safe. It is not.
-- Postgres row-level security does not apply to TRUNCATE at all: a policy can forbid deleting a
-- single row and do nothing about emptying the table. The 5 Sep audit found the same privilege on
-- the ledgers and the 16 Sep fix (20260916c) revoked update/delete/truncate on exactly five of
-- them -- audit_log, workspace_audit, signoffs, project_baselines, destruction_certificates --
-- and stopped there. The tables holding the actual customer data were never covered.
--
-- HOW BAD, HONESTLY. Not exploitable through the public API today. PostgREST exposes SELECT,
-- INSERT, UPDATE, DELETE and RPC; there is no REST verb that issues a TRUNCATE, and neither role
-- has CREATE on the schema, so neither can define a function to do it. The one SECURITY DEFINER
-- function reachable by authenticated that runs dynamic SQL (private.erase_my_account) passes its
-- only user value as a bound parameter and is not injectable -- checked.
--
-- So the thing standing between a published anon key and an empty projects table is that PostgREST
-- happens not to offer the verb. That is a control nobody chose, nobody wrote down, and nobody can
-- test. The grant serves no purpose -- nothing in the product truncates anything -- so it goes.
--
-- WHY IT CAME BACK IN THE FIRST PLACE, and the part that matters more than the revoke: Supabase's
-- default privileges grant ALL on new tables in public to anon and authenticated. Revoking today
-- fixes today; the next CREATE TABLE re-introduces it. The default is changed below, so a table
-- added next month does not quietly restore this.
--
-- Not touched: select/insert/update/delete. Those ARE governed by RLS and the app depends on them.
-- =====================================================================================

do $$
declare t record; n int := 0;
begin
  for t in
    select c.relname
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t.relname);
    n := n + 1;
  end loop;
  raise notice 'revoked truncate/references/trigger on % tables', n;
end $$;

-- and for every table created from now on
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- =============================================================================
-- Safety Lab Aero — Security & performance hardening (advisor remediation)
-- Project: fhrqkhdrwbfnizkepch  ·  [Data-Sec #262/#267 + linter 0001/0028/0029]
--
-- Idempotent. Completes the 0002 §B (function lockdown) and §C (audit hash chain)
-- items that were vetted-but-not-applied, extends them to the new functions, and
-- adds covering indexes for every foreign key the performance advisor flagged.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---- A. SECURITY DEFINER execution lockdown (linter 0028 / 0029) -------------
-- RLS-helper fns MUST stay executable by `authenticated` (the policies call them);
-- we only drop the `anon`/PUBLIC exposure that made them callable via /rest/v1/rpc.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.is_workspace_member(uuid)','public.is_workspace_owner(uuid)',
    'public.can_edit_workspace(uuid)','public.can_admin_workspace(uuid)',
    'public.can_review_workspace(uuid)','public.workspace_role(uuid)',
    'public.is_safety_lab_admin()'
  ] loop
    execute format('revoke execute on function %s from anon, public;', fn);
    execute format('grant  execute on function %s to authenticated, service_role;', fn);
  end loop;
end $$;

-- Trigger functions are invoked by the trigger mechanism, never via the API → no role needs EXECUTE.
revoke execute on function public.signoffs_chain() from anon, authenticated, public;
revoke execute on function public.set_baseline_version_no() from anon, authenticated, public;
revoke execute on function public.forbid_baseline_snapshot_mutation() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- Backend-only AI usage incrementer.
revoke execute on function public.increment_ai_usage(uuid, text, numeric) from anon, authenticated, public;
grant  execute on function public.increment_ai_usage(uuid, text, numeric) to service_role;

-- Destructive erase RPCs: signed-in users only (the functions self-check auth.uid()).
revoke execute on function public.erase_my_account(boolean) from anon, public;
revoke execute on function public.erase_project(uuid, boolean) from anon, public;
grant  execute on function public.erase_my_account(boolean) to authenticated;
grant  execute on function public.erase_project(uuid, boolean) to authenticated;

-- ---- B. Covering indexes for flagged foreign keys (linter 0001) -------------
create index if not exists idx_project_baselines_created_by on public.project_baselines (created_by);
create index if not exists idx_pdv_saved_by                 on public.project_document_versions (saved_by);
create index if not exists idx_review_comments_author       on public.review_comments (author);
create index if not exists idx_reviews_baseline             on public.reviews (baseline_id);
create index if not exists idx_reviews_requested_by         on public.reviews (requested_by);
create index if not exists idx_signoffs_baseline            on public.signoffs (baseline_id);
create index if not exists idx_signoffs_signer              on public.signoffs (signer_user_id);
create index if not exists idx_feedback_project             on public.feedback (project_id);
create index if not exists idx_feedback_workspace           on public.feedback (workspace_id);
create index if not exists idx_invitations_invited_by       on public.invitations (invited_by);
create index if not exists idx_project_documents_updated_by on public.project_documents (updated_by);
create index if not exists idx_projects_created_by          on public.projects (created_by);
create index if not exists idx_workspace_audit_user         on public.workspace_audit (user_id);

-- ---- C. Tamper-evident AI audit log (0002 §C / #267) ------------------------
alter table public.audit_log add column if not exists prev_hash text;
alter table public.audit_log add column if not exists row_hash  text;

create or replace function public.audit_log_chain()
  returns trigger language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare last_hash text;
begin
  select row_hash into last_hash from public.audit_log order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  new.row_hash  := encode(digest(
      coalesce(new.prev_hash,'') || coalesce(new.user_id::text,'') || coalesce(new.feature,'')
      || coalesce(new.model,'') || coalesce(new.tokens_in::text,'') || coalesce(new.tokens_out::text,'')
      || coalesce(new.ts::text,''), 'sha256'), 'hex');
  return new;
end $$;
revoke execute on function public.audit_log_chain() from anon, authenticated, public;

drop trigger if exists trg_audit_log_chain on public.audit_log;
create trigger trg_audit_log_chain before insert on public.audit_log
  for each row execute function public.audit_log_chain();

revoke update, delete on public.audit_log from anon, authenticated;   -- append-only ledger

-- =============================================================================
-- Not in this file (tracked separately):
--   * Leaked-password protection — enable in Auth → Policies (one toggle, UI only).
--   * RLS init-plan optimization (wrap auth.uid() in (select ...)) — perf only,
--     touches ~18 policies; do as a careful dedicated pass.
-- =============================================================================

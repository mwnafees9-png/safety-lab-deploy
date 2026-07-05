-- =============================================================================
-- Safety Lab Aero — Data-Sec hardening  ·  #262 / #267 [Data-Sec]
--
-- SECTION A is ALREADY APPLIED to production (migration
-- datasec_pin_function_search_path, 2026-06-21) — kept here for the record.
--
-- SECTIONS B and C are VETTED but NOT yet applied. Apply them in the Supabase
-- SQL editor, then re-run the security advisor and spot-check the live app
-- (open a project, save it, invite a member). Rollback for B is trivial
-- (re-GRANT). Do NOT run them blind against production from a script.
-- =============================================================================

-- ---- SECTION A — APPLIED: pin search_path on the two flagged functions -------
-- alter function public.increment_ai_usage(uuid, text, numeric) set search_path = public, pg_temp;
-- alter function public.set_updated_at() set search_path = public, pg_temp;

-- ---- SECTION B — remove RPC exposure of SECURITY DEFINER functions -----------
-- Pattern: revoke the blanket PUBLIC grant (which is what makes them callable by
-- the anon role over /rest/v1/rpc), then re-grant ONLY to the roles that actually
-- need them. The RLS-helper functions MUST stay executable by `authenticated`
-- because the RLS policies call them — revoking that would lock every signed-in
-- user out. service_role bypasses RLS and is re-granted for safety.

-- B1. Trigger fn + backend-only usage incrementer — no client needs these.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.increment_ai_usage(uuid, text, numeric) from public;
grant  execute on function public.increment_ai_usage(uuid, text, numeric) to service_role;

-- B2. RLS-helper fns — drop the anon exposure, keep authenticated (RLS) + service_role.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.is_workspace_member(uuid)',
    'public.is_workspace_owner(uuid)',
    'public.can_edit_workspace(uuid)',
    'public.can_admin_workspace(uuid)',
    'public.workspace_role(uuid)',
    'public.is_safety_lab_admin()'
  ] loop
    execute format('revoke execute on function %s from public;', fn);
    execute format('grant  execute on function %s to authenticated, service_role;', fn);
  end loop;
end $$;

-- After B, the `anon_security_definer_function_executable` lints clear. The
-- `authenticated_*` lints remain BY DESIGN (RLS needs them). To clear those too,
-- move the helpers into a non-exposed `private` schema and repoint the policies
-- (bigger change — schedule separately).

-- ---- SECTION C — tamper-evident AI audit log (#267) --------------------------
-- The audit_log table already records per-call {user, feature, model, tokens,
-- itar, latency, ok}. Make it append-only + hash-chained so any deletion or edit
-- of a past row is detectable. Apply during a quiet window (table is small).

alter table public.audit_log
  add column if not exists prev_hash text,
  add column if not exists row_hash  text;

create or replace function public.audit_log_chain()
  returns trigger language plpgsql security definer set search_path = public, pg_temp
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

drop trigger if exists trg_audit_log_chain on public.audit_log;
create trigger trg_audit_log_chain before insert on public.audit_log
  for each row execute function public.audit_log_chain();

-- Block UPDATE/DELETE for everyone except service_role (append-only ledger):
revoke update, delete on public.audit_log from anon, authenticated;
-- (requires the pgcrypto extension for digest(); enable once: create extension if not exists pgcrypto;)

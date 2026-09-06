-- =============================================================================
-- Safety Lab Aero — SCHEMA BASELINE  (0000)
-- Captured from production fhrqkhdrwbfnizkepkch (Safety-Lab, us-east-2) on 2026-09-06.
--
-- WHAT THIS IS: the complete current-state schema, reconstructed read-only from the
-- live catalog, so a customer database can be BUILT FROM FILES. It supersedes the
-- create-from-nothing gap where 18 of 24 tables had no CREATE TABLE in the repo.
--
-- ASSUMES a Supabase-managed base: the auth schema + auth.uid()/auth.jwt(), the
-- roles anon/authenticated/service_role, the extensions schema with pgcrypto, and
-- supabase_functions.http_request. A fresh Supabase project provides all of these.
--
-- SECRET REDACTED: the three notify-review triggers carried a service_role JWT in
-- plaintext in production. It is replaced with <SERVICE_ROLE_JWT> here and must be
-- set per install (and, per the 6 Sep ruling, pointed at the customer's own
-- endpoint, not Safety Lab's).
--
-- NOT YET APPLIED ANYWHERE. Proven only on a local Postgres with stubbed Supabase
-- built-ins. Do not apply to production (production already has this schema).
-- =============================================================================

SET check_function_bodies = false;
CREATE SCHEMA IF NOT EXISTS private;



-- ================= 10_tables.sql =================
-- ===== SEQUENCES (owned by bigint id columns that use nextval) =====
CREATE SEQUENCE IF NOT EXISTS public.audit_log_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.workspace_audit_id_seq;

-- ===== TABLES =====
CREATE TABLE public.ai_org_cache (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  h text NOT NULL,
  feature text NOT NULL DEFAULT ''::text,
  body jsonb NOT NULL,
  at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_usage (
  user_id uuid NOT NULL,
  month text NOT NULL,
  tokens_used numeric NOT NULL DEFAULT 0,
  allowance numeric NOT NULL,
  tier text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.approved_tenants (
  tenant_id uuid NOT NULL,
  org_name text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  notes text,
  added_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_log (
  id bigint NOT NULL DEFAULT nextval('audit_log_id_seq'::regclass),
  ts timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  feature text,
  model text,
  tokens_in integer,
  tokens_out integer,
  weighted_cost numeric,
  itar boolean DEFAULT false,
  latency_ms integer,
  ok boolean,
  error text,
  prev_hash text,
  row_hash text
);
CREATE TABLE public.destruction_certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  scope text NOT NULL,
  target_id uuid,
  target_name text,
  deleted_counts jsonb,
  manifest_sha256 text,
  issued_by_email text,
  issued_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  workspace_id uuid,
  project_id uuid,
  category text NOT NULL DEFAULT 'general'::text,
  rating smallint,
  message text NOT NULL,
  source_url text,
  user_agent text,
  build_id text,
  context_json jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  token text NOT NULL,
  invited_by uuid,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '14 days'::interval),
  accepted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.license_tokens (
  token text NOT NULL,
  user_id uuid NOT NULL,
  plan text NOT NULL,
  monthly_allowance bigint NOT NULL DEFAULT '1000000000000'::bigint,
  tokens_used_this_month bigint NOT NULL DEFAULT 0,
  reset_month text NOT NULL DEFAULT to_char(now(), 'YYYY-MM'::text),
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  itar_required boolean NOT NULL DEFAULT false,
  rate_limit_rpm integer
);
CREATE TABLE public.notification_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  target_email text NOT NULL,
  subject text,
  resend_id text,
  status text NOT NULL,
  error text,
  payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.pending_comps (
  email text NOT NULL,
  tier text NOT NULL DEFAULT 'pro-plus'::text,
  plan text NOT NULL DEFAULT 'pro-plus'::text,
  comp_months integer NOT NULL DEFAULT 2,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  applied_at timestamp with time zone
);
CREATE TABLE public.project_baselines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  version_no integer NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'draft'::text,
  data jsonb NOT NULL,
  sha256 text NOT NULL,
  note text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.project_crdt (
  project_id uuid NOT NULL,
  state text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.project_document_versions (
  id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  project_id uuid NOT NULL,
  version integer NOT NULL,
  data jsonb NOT NULL,
  saved_by uuid,
  saved_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.project_documents (
  project_id uuid NOT NULL,
  data jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  cert_basis text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
CREATE TABLE public.review_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  decision text NOT NULL DEFAULT 'pending'::text,
  decided_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.review_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL,
  target_internal_id text,
  body text NOT NULL,
  author uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone
);
CREATE TABLE public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  baseline_id uuid,
  scope text NOT NULL DEFAULT 'project'::text,
  target_ref text,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  requested_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  decided_at timestamp with time zone
);
CREATE TABLE public.signoffs (
  id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  ts timestamp with time zone NOT NULL DEFAULT now(),
  review_id uuid,
  project_id uuid NOT NULL,
  baseline_id uuid,
  baseline_sha256 text NOT NULL,
  signer_user_id uuid,
  signer_email text,
  role_at_signing text NOT NULL,
  decision text NOT NULL,
  meaning text,
  auth_assurance text,
  ip text,
  user_agent text,
  prev_hash text,
  row_hash text
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  tier text NOT NULL DEFAULT 'community'::text,
  stripe_customer_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  trial_ends_at timestamp with time zone
);
CREATE TABLE public.workspace_audit (
  id bigint NOT NULL DEFAULT nextval('workspace_audit_id_seq'::regclass),
  workspace_id uuid NOT NULL,
  user_id uuid,
  event_type text NOT NULL,
  target_id uuid,
  details jsonb,
  ts timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  joined_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.workspaces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text,
  owner_id uuid NOT NULL,
  is_personal boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.yjs_documents (
  project_id uuid NOT NULL,
  state bytea,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;
ALTER SEQUENCE public.workspace_audit_id_seq OWNED BY public.workspace_audit.id;


-- ================= 90_view.sql =================
-- ===== VIEWS =====
CREATE OR REPLACE VIEW public.expiry_watch AS  WITH rows AS (
         SELECT 'trial'::text AS scope, pu.id AS user_id, pu.email,
            COALESCE(pu.tier, 'unknown'::text) AS plan, pu.trial_ends_at AS expires_at
           FROM users pu JOIN auth.users au ON au.id = pu.id
          WHERE pu.trial_ends_at IS NOT NULL
        UNION ALL
         SELECT 'licence'::text AS text, lt.user_id, pu.email,
            COALESCE(lt.plan, 'unknown'::text) AS "coalesce", lt.expires_at
           FROM license_tokens lt JOIN users pu ON pu.id = lt.user_id
             JOIN auth.users au ON au.id = lt.user_id
          WHERE lt.expires_at IS NOT NULL
        )
 SELECT scope, user_id, email, plan, expires_at,
    (expires_at AT TIME ZONE 'UTC'::text)::date AS expires_on,
    (expires_at AT TIME ZONE 'UTC'::text)::date - (now() AT TIME ZONE 'UTC'::text)::date AS days_left,
        CASE (expires_at AT TIME ZONE 'UTC'::text)::date - (now() AT TIME ZONE 'UTC'::text)::date
            WHEN 3 THEN 'T-3'::text WHEN 1 THEN 'T-1'::text ELSE NULL::text END AS stage,
    (((((scope || ':'::text) || user_id::text) || ':'::text) || (expires_at AT TIME ZONE 'UTC'::text)::date::text) || ':'::text) || COALESCE(
        CASE (expires_at AT TIME ZONE 'UTC'::text)::date - (now() AT TIME ZONE 'UTC'::text)::date
            WHEN 3 THEN 'T-3'::text WHEN 1 THEN 'T-1'::text ELSE 'none'::text END, 'none'::text) AS dedupe_key
   FROM rows
  WHERE email IS NOT NULL AND email !~~ '%@safetylabaero.com'::text;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.expiry_watch TO service_role;


-- ================= 20_constraints_indexes.sql =================
-- PK/UNIQUE
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE public.users ADD CONSTRAINT users_stripe_customer_id_key UNIQUE (stripe_customer_id);
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (user_id, month);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id);
ALTER TABLE public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_pkey PRIMARY KEY (project_id);
ALTER TABLE public.yjs_documents ADD CONSTRAINT yjs_documents_pkey PRIMARY KEY (project_id);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_token_key UNIQUE (token);
ALTER TABLE public.workspace_audit ADD CONSTRAINT workspace_audit_pkey PRIMARY KEY (id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_log ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);
ALTER TABLE public.license_tokens ADD CONSTRAINT license_tokens_pkey PRIMARY KEY (token);
ALTER TABLE public.destruction_certificates ADD CONSTRAINT destruction_certificates_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_comps ADD CONSTRAINT pending_comps_pkey PRIMARY KEY (email);
ALTER TABLE public.project_baselines ADD CONSTRAINT project_baselines_pkey PRIMARY KEY (id);
ALTER TABLE public.project_baselines ADD CONSTRAINT project_baselines_project_id_version_no_key UNIQUE (project_id, version_no);
ALTER TABLE public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.review_assignments ADD CONSTRAINT review_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.review_assignments ADD CONSTRAINT review_assignments_review_id_user_id_role_key UNIQUE (review_id, user_id, role);
ALTER TABLE public.review_comments ADD CONSTRAINT review_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.signoffs ADD CONSTRAINT signoffs_pkey PRIMARY KEY (id);
ALTER TABLE public.project_document_versions ADD CONSTRAINT project_document_versions_pkey PRIMARY KEY (id);
ALTER TABLE public.project_document_versions ADD CONSTRAINT project_document_versions_project_id_version_key UNIQUE (project_id, version);
ALTER TABLE public.project_crdt ADD CONSTRAINT project_crdt_pkey PRIMARY KEY (project_id);
ALTER TABLE public.approved_tenants ADD CONSTRAINT approved_tenants_pkey PRIMARY KEY (tenant_id);
ALTER TABLE public.ai_org_cache ADD CONSTRAINT ai_org_cache_pkey PRIMARY KEY (user_id, h);

-- CHECK
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'reviewer'::text, 'viewer'::text])));
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'editor'::text, 'reviewer'::text, 'viewer'::text])));
ALTER TABLE public.users ADD CONSTRAINT users_tier_check CHECK ((tier = ANY (ARRAY['edu'::text, 'pro'::text, 'pro-plus'::text, 'enterprise'::text])));
ALTER TABLE public.license_tokens ADD CONSTRAINT license_tokens_plan_check CHECK ((plan = ANY (ARRAY['pro-plus'::text, 'enterprise'::text])));
ALTER TABLE public.destruction_certificates ADD CONSTRAINT destruction_certificates_scope_check CHECK ((scope = ANY (ARRAY['project'::text, 'account'::text])));
ALTER TABLE public.project_baselines ADD CONSTRAINT project_baselines_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_review'::text, 'approved'::text, 'released'::text, 'superseded'::text])));
ALTER TABLE public.reviews ADD CONSTRAINT reviews_scope_check CHECK ((scope = ANY (ARRAY['project'::text, 'system'::text, 'fta_page'::text, 'analysis'::text])));
ALTER TABLE public.reviews ADD CONSTRAINT reviews_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_review'::text, 'changes_requested'::text, 'approved'::text, 'released'::text, 'rejected'::text, 'withdrawn'::text])));
ALTER TABLE public.review_assignments ADD CONSTRAINT review_assignments_role_check CHECK ((role = ANY (ARRAY['reviewer'::text, 'approver'::text])));
ALTER TABLE public.review_assignments ADD CONSTRAINT review_assignments_decision_check CHECK ((decision = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.signoffs ADD CONSTRAINT signoffs_role_at_signing_check CHECK ((role_at_signing = ANY (ARRAY['reviewer'::text, 'approver'::text])));
ALTER TABLE public.signoffs ADD CONSTRAINT signoffs_decision_check CHECK ((decision = ANY (ARRAY['approve'::text, 'reject'::text])));
ALTER TABLE public.signoffs ADD CONSTRAINT signoffs_auth_assurance_check CHECK ((auth_assurance = ANY (ARRAY['password_reauth'::text, 'mfa'::text, 'session'::text])));
ALTER TABLE public.approved_tenants ADD CONSTRAINT approved_tenants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])));

-- FK
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD CONSTRAINT projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.yjs_documents ADD CONSTRAINT yjs_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_audit ADD CONSTRAINT workspace_audit_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_audit ADD CONSTRAINT workspace_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.license_tokens ADD CONSTRAINT license_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.project_baselines ADD CONSTRAINT project_baselines_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.project_baselines ADD CONSTRAINT project_baselines_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.reviews ADD CONSTRAINT reviews_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_baseline_id_fkey FOREIGN KEY (baseline_id) REFERENCES project_baselines(id) ON DELETE SET NULL;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users(id);
ALTER TABLE public.review_assignments ADD CONSTRAINT review_assignments_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE public.review_assignments ADD CONSTRAINT review_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public.review_comments ADD CONSTRAINT review_comments_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE public.review_comments ADD CONSTRAINT review_comments_author_fkey FOREIGN KEY (author) REFERENCES users(id);
ALTER TABLE public.signoffs ADD CONSTRAINT signoffs_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE SET NULL;
ALTER TABLE public.signoffs ADD CONSTRAINT signoffs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.signoffs ADD CONSTRAINT signoffs_baseline_id_fkey FOREIGN KEY (baseline_id) REFERENCES project_baselines(id) ON DELETE SET NULL;
ALTER TABLE public.signoffs ADD CONSTRAINT signoffs_signer_user_id_fkey FOREIGN KEY (signer_user_id) REFERENCES users(id);
ALTER TABLE public.project_document_versions ADD CONSTRAINT project_document_versions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.project_document_versions ADD CONSTRAINT project_document_versions_saved_by_fkey FOREIGN KEY (saved_by) REFERENCES users(id);
ALTER TABLE public.project_crdt ADD CONSTRAINT project_crdt_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.ai_org_cache ADD CONSTRAINT ai_org_cache_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- INDEXES
CREATE INDEX ai_usage_month_idx ON public.ai_usage USING btree (month);
CREATE INDEX users_stripe_idx ON public.users USING btree (stripe_customer_id);
CREATE INDEX audit_log_user_ts_idx ON public.audit_log USING btree (user_id, ts DESC);
CREATE INDEX audit_log_itar_idx ON public.audit_log USING btree (itar) WHERE (itar = true);
CREATE INDEX ws_audit_ws_ts_idx ON public.workspace_audit USING btree (workspace_id, ts DESC);
CREATE INDEX idx_workspace_audit_user ON public.workspace_audit USING btree (user_id);
CREATE INDEX invitations_token_idx ON public.invitations USING btree (token) WHERE (accepted_at IS NULL);
CREATE INDEX invitations_ws_idx ON public.invitations USING btree (workspace_id);
CREATE INDEX idx_invitations_invited_by ON public.invitations USING btree (invited_by);
CREATE INDEX workspaces_owner_idx ON public.workspaces USING btree (owner_id);
CREATE INDEX ws_members_user_idx ON public.workspace_members USING btree (user_id);
CREATE INDEX projects_workspace_idx ON public.projects USING btree (workspace_id) WHERE (deleted_at IS NULL);
CREATE INDEX projects_updated_idx ON public.projects USING btree (updated_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_projects_created_by ON public.projects USING btree (created_by);
CREATE INDEX project_documents_updated_idx ON public.project_documents USING btree (updated_at DESC);
CREATE INDEX idx_project_documents_updated_by ON public.project_documents USING btree (updated_by);
CREATE INDEX feedback_created_at_idx ON public.feedback USING btree (created_at DESC);
CREATE INDEX feedback_user_id_idx ON public.feedback USING btree (user_id);
CREATE INDEX idx_feedback_project ON public.feedback USING btree (project_id);
CREATE INDEX idx_feedback_workspace ON public.feedback USING btree (workspace_id);
CREATE INDEX notification_log_kind_created_at_idx ON public.notification_log USING btree (kind, created_at DESC);
CREATE INDEX idx_project_baselines_project ON public.project_baselines USING btree (project_id, version_no DESC);
CREATE INDEX idx_project_baselines_created_by ON public.project_baselines USING btree (created_by);
CREATE INDEX idx_reviews_project ON public.reviews USING btree (project_id, status);
CREATE INDEX idx_reviews_baseline ON public.reviews USING btree (baseline_id);
CREATE INDEX idx_reviews_requested_by ON public.reviews USING btree (requested_by);
CREATE INDEX idx_review_assignments_review ON public.review_assignments USING btree (review_id);
CREATE INDEX idx_review_assignments_user ON public.review_assignments USING btree (user_id);
CREATE INDEX idx_review_comments_review ON public.review_comments USING btree (review_id, created_at);
CREATE INDEX idx_review_comments_author ON public.review_comments USING btree (author);
CREATE INDEX idx_signoffs_project ON public.signoffs USING btree (project_id, ts DESC);
CREATE INDEX idx_signoffs_review ON public.signoffs USING btree (review_id);
CREATE INDEX idx_signoffs_baseline ON public.signoffs USING btree (baseline_id);
CREATE INDEX idx_signoffs_signer ON public.signoffs USING btree (signer_user_id);
CREATE INDEX idx_pdv_project ON public.project_document_versions USING btree (project_id, version DESC);
CREATE INDEX idx_pdv_saved_by ON public.project_document_versions USING btree (saved_by);
CREATE UNIQUE INDEX license_tokens_user_id_idx ON public.license_tokens USING btree (user_id);
CREATE INDEX license_tokens_expires_at_idx ON public.license_tokens USING btree (expires_at);


-- ================= 30_functions.sql =================
-- ===== FUNCTIONS (public + private) =====
CREATE OR REPLACE FUNCTION private.audit_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Deliberate maintenance: SET LOCAL app.allow_audit_maintenance = 'on' in a
  -- transaction to permit a one-off correction (leaves its own audit trail elsewhere).
  if coalesce(current_setting('app.allow_audit_maintenance', true), 'off') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'audit records are append-only: % on % is not permitted', tg_op, tg_table_name
    using errcode = 'insufficient_privilege';
end $function$
;

CREATE OR REPLACE FUNCTION private.can_admin_workspace(p_workspace uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce(private.workspace_role(p_workspace) in ('owner','admin'), false); $function$
;

CREATE OR REPLACE FUNCTION private.can_edit_workspace(p_workspace uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce(private.workspace_role(p_workspace) in ('owner','admin','editor'), false); $function$
;

CREATE OR REPLACE FUNCTION private.can_review_workspace(p_workspace uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce(private.workspace_role(p_workspace) in ('owner','admin','editor','reviewer'), false); $function$
;

CREATE OR REPLACE FUNCTION private.erase_my_account(p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_email text := auth.jwt()->>'email';
        v_owned uuid[]; v_ws int; v_proj int; v_docs int; v_manifest jsonb; v_hash text; v_cert uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select array_agg(id) into v_owned from public.workspaces where owner_id = v_uid;
  v_owned := coalesce(v_owned, '{}');
  v_ws   := coalesce(array_length(v_owned,1),0);
  select count(*) into v_proj from public.projects where workspace_id = any(v_owned);
  select count(*) into v_docs from public.project_documents d join public.projects p on p.id=d.project_id where p.workspace_id = any(v_owned);
  v_manifest := jsonb_build_object('scope','account','user',v_uid,'owned_workspaces',v_ws,'projects',v_proj,'project_documents',v_docs,'at',now());
  if not p_confirm then return jsonb_build_object('dry_run',true,'manifest',v_manifest); end if;
  -- 1) purge content in owned workspaces
  delete from public.yjs_documents    where project_id in (select id from public.projects where workspace_id = any(v_owned));
  delete from public.project_documents where project_id in (select id from public.projects where workspace_id = any(v_owned));
  delete from public.projects          where workspace_id = any(v_owned);
  delete from public.workspace_members where workspace_id = any(v_owned);
  delete from public.workspaces        where id = any(v_owned);
  -- 2) drop the user's memberships elsewhere + their own license/feedback rows
  delete from public.workspace_members where user_id = v_uid;
  delete from public.license_tokens    where user_id = v_uid;
  delete from public.feedback          where user_id = v_uid;
  -- 3) PII redaction: anonymize the user row (keep id so the audit ledger stays intact, PII-free)
  v_hash := encode(digest(coalesce(v_email,'')||v_uid::text||now()::text,'sha256'),'hex');
  update public.users set email = 'redacted+'||left(v_hash,16)||'@deleted.invalid' where id = v_uid;
  insert into public.destruction_certificates(user_id,scope,target_id,target_name,deleted_counts,manifest_sha256,issued_by_email)
  values (v_uid,'account',v_uid,'account',
          jsonb_build_object('owned_workspaces',v_ws,'projects',v_proj,'project_documents',v_docs), v_hash, v_email)
  returning id into v_cert;
  return jsonb_build_object('deleted',true,'certificate_id',v_cert,'manifest_sha256',v_hash,'manifest',v_manifest,
           'note','Login record removal from auth is a final admin/edge-function step.');
end $function$
;

CREATE OR REPLACE FUNCTION private.guard_project_archive()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.deleted_at is not distinct from OLD.deleted_at then return NEW; end if;
  if auth.uid() is null then return NEW; end if;   -- service-role / backend, already trusted
  if coalesce(private.can_admin_workspace(NEW.workspace_id), false) is not true then
    raise exception using errcode = 'P0001',
      message = 'Only a workspace owner or admin can archive or restore a project.',
      hint = 'Ask an admin of this workspace, or open Workspace settings to see who they are.';
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION private.is_safety_lab_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (auth.jwt() ->> 'email') in (
      'mwnafees9@gmail.com',
      'waqas.nafees@safetylabaero.com'
    ),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION private.is_workspace_member(p_workspace uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select exists (
        select 1 from public.workspace_members
        where workspace_id = p_workspace
          and user_id = auth.uid()
    );
$function$
;

CREATE OR REPLACE FUNCTION private.is_workspace_owner(p_workspace uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce(private.workspace_role(p_workspace) = 'owner', false); $function$
;

CREATE OR REPLACE FUNCTION private.owns_workspace(p_workspace uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select w.owner_id = auth.uid() from public.workspaces w where w.id = p_workspace),
    false);
$function$
;

CREATE OR REPLACE FUNCTION private.verify_signoff_chain()
 RETURNS TABLE(ok boolean, first_bad_id bigint, checked bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  r record; expected_prev text := ''; computed text; bad bigint := null; cnt bigint := 0;
begin
  for r in select * from public.signoffs order by id asc loop
    cnt := cnt + 1;
    if coalesce(r.prev_hash, '') is distinct from expected_prev then
      bad := r.id; exit;
    end if;
    computed := encode(digest(
        coalesce(r.prev_hash,'') || coalesce(r.project_id::text,'') || coalesce(r.baseline_sha256,'')
        || coalesce(r.signer_user_id::text,'') || coalesce(r.signer_email,'') || coalesce(r.role_at_signing,'')
        || coalesce(r.decision,'') || coalesce(r.meaning,'') || coalesce(r.ts::text,''), 'sha256'), 'hex');
    if computed is distinct from r.row_hash then
      bad := r.id; exit;
    end if;
    expected_prev := r.row_hash;
  end loop;
  return query select (bad is null), bad, cnt;
end $function$
;

CREATE OR REPLACE FUNCTION private.workspace_role(p_workspace uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select role from public.workspace_members
    where workspace_id = p_workspace and user_id = auth.uid()
    limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
 RETURNS TABLE(status text, workspace_id uuid, workspace_name text, role text, invited_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''));
  v_inv   public.invitations%rowtype;
  v_ws    public.workspaces%rowtype;
  v_existing text;
begin
  if v_uid is null then
    raise exception 'accept_invitation requires an authenticated session';
  end if;

  select i.* into v_inv from public.invitations i where i.token = p_token;
  if not found then
    return query select 'invalid'::text, null::uuid, null::text, null::text, null::text; return;
  end if;

  select w.* into v_ws from public.workspaces w where w.id = v_inv.workspace_id;

  if lower(v_inv.email) <> v_email then
    return query select 'wrong_account'::text, v_inv.workspace_id, v_ws.name, v_inv.role, v_inv.email; return;
  end if;
  if v_inv.accepted_at is not null then
    return query select 'already_used'::text, v_inv.workspace_id, v_ws.name, v_inv.role, v_inv.email; return;
  end if;
  if v_inv.expires_at <= now() then
    return query select 'expired'::text, v_inv.workspace_id, v_ws.name, v_inv.role, v_inv.email; return;
  end if;
  if v_inv.role not in ('admin','editor','reviewer','viewer') then
    return query select 'invalid_role'::text, v_inv.workspace_id, v_ws.name, v_inv.role, v_inv.email; return;
  end if;

  -- TABLE-QUALIFIED (wm.role): the bug this migration exists to fix.
  select wm.role into v_existing
    from public.workspace_members wm
   where wm.workspace_id = v_inv.workspace_id and wm.user_id = v_uid;

  if v_existing is not null then
    update public.invitations i set accepted_at = now() where i.id = v_inv.id;
    return query select 'already_member'::text, v_inv.workspace_id, v_ws.name, v_existing, v_inv.email; return;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, v_uid, v_inv.role);

  update public.invitations i set accepted_at = now() where i.id = v_inv.id;

  return query select 'joined'::text, v_inv.workspace_id, v_ws.name, v_inv.role, v_inv.email;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ai_org_cache_trim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.ai_org_cache
  where user_id = new.user_id
    and h in (
      select h from public.ai_org_cache
      where user_id = new.user_id
      order by at desc
      offset 200
    );
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.apply_pending_comp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pc record;
begin
  select * into pc from public.pending_comps
   where lower(email) = lower(new.email) and applied_at is null;
  if not found then
    return new;
  end if;

  update public.users
     set tier = pc.tier, trial_ends_at = null, updated_at = now()
   where id = new.id;

  insert into public.license_tokens (token, user_id, plan, expires_at, rate_limit_rpm)
  values (encode(extensions.gen_random_bytes(32), 'hex'), new.id, pc.plan,
          now() + make_interval(months => pc.comp_months), null)
  on conflict (token) do nothing;

  update public.pending_comps set applied_at = now()
   where lower(email) = lower(pc.email);

  return new;
exception when others then
  -- comp application must never abort the signup transaction
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.archive_project(p_project uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ws uuid; v_name text; v_already timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select p.workspace_id, p.name, p.deleted_at into v_ws, v_name, v_already
    from public.projects p where p.id = p_project;
  if v_ws is null then raise exception 'project not found'; end if;
  if coalesce(private.can_admin_workspace(v_ws), false) is not true then
    raise exception 'only a workspace owner or admin can archive a project' using errcode = '42501';
  end if;
  if v_already is not null then
    return jsonb_build_object('ok', true, 'already_archived', true, 'name', v_name);
  end if;
  update public.projects p set deleted_at = now() where p.id = p_project;
  return jsonb_build_object('ok', true, 'archived', true, 'name', v_name, 'workspace_id', v_ws);
end $function$
;

CREATE OR REPLACE FUNCTION public.archived_projects(p_workspace uuid)
 RETURNS TABLE(id uuid, name text, cert_basis text, updated_at timestamp with time zone, deleted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(private.can_admin_workspace(p_workspace), false) is not true then
    raise exception 'only a workspace owner or admin can see archived projects' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.cert_basis, p.updated_at, p.deleted_at
      from public.projects p
     where p.workspace_id = p_workspace
       and p.deleted_at is not null
     order by p.deleted_at desc;
end $function$
;

CREATE OR REPLACE FUNCTION public.audit_log_chain()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare last_hash text;
begin
  select row_hash into last_hash from public.audit_log order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  new.row_hash  := encode(digest(
      coalesce(new.prev_hash,'') || coalesce(new.user_id::text,'') || coalesce(new.feature,'')
      || coalesce(new.model,'') || coalesce(new.tokens_in::text,'') || coalesce(new.tokens_out::text,'')
      || coalesce(new.ts::text,''), 'sha256'), 'hex');
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.consume_tokens(p_token text, p_amount bigint)
 RETURNS TABLE(remaining bigint, plan text, expired boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_row license_tokens%rowtype; v_current_month text := to_char(now(),'YYYY-MM');
begin
  p_amount := greatest(0, coalesce(p_amount, 0));   -- SEC-4: never negative
  select * into v_row from license_tokens where token = p_token for update;
  if not found then raise exception 'invalid token' using errcode = 'P0002'; end if;
  if v_row.expires_at is not null and v_row.expires_at < now() then
    return query select (v_row.monthly_allowance - v_row.tokens_used_this_month)::bigint, v_row.plan, true; return;
  end if;
  if v_row.reset_month <> v_current_month then
    update license_tokens set tokens_used_this_month = p_amount, reset_month = v_current_month, updated_at = now()
      where token = p_token returning * into v_row;
  else
    update license_tokens set tokens_used_this_month = tokens_used_this_month + p_amount, updated_at = now()
      where token = p_token returning * into v_row;
  end if;
  return query select (v_row.monthly_allowance - v_row.tokens_used_this_month)::bigint, v_row.plan, false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.erase_my_account(p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$select private.erase_my_account(p_confirm)$function$
;

CREATE OR REPLACE FUNCTION public.erase_project(p_project_id uuid, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_ws uuid; v_name text; v_docs int; v_yjs int; v_manifest jsonb; v_hash text; v_cert uuid;
begin
  select workspace_id, name into v_ws, v_name from public.projects where id = p_project_id;
  if v_ws is null then raise exception 'project not found'; end if;
  if not private.can_admin_workspace(v_ws) then raise exception 'not authorized'; end if;
  select count(*) into v_docs from public.project_documents where project_id = p_project_id;
  select count(*) into v_yjs  from public.yjs_documents    where project_id = p_project_id;
  v_manifest := jsonb_build_object('scope','project','project_id',p_project_id,'project_name',v_name,
                  'project_documents',v_docs,'yjs_documents',v_yjs,'at',now());
  if not p_confirm then return jsonb_build_object('dry_run',true,'manifest',v_manifest); end if;
  delete from public.yjs_documents    where project_id = p_project_id;
  delete from public.project_documents where project_id = p_project_id;
  delete from public.projects         where id         = p_project_id;
  v_hash := encode(digest(v_manifest::text,'sha256'),'hex');
  insert into public.destruction_certificates(user_id,scope,target_id,target_name,deleted_counts,manifest_sha256,issued_by_email)
  values (auth.uid(),'project',p_project_id,v_name,
          jsonb_build_object('project_documents',v_docs,'yjs_documents',v_yjs), v_hash, auth.jwt()->>'email')
  returning id into v_cert;
  return jsonb_build_object('deleted',true,'certificate_id',v_cert,'manifest_sha256',v_hash,'manifest',v_manifest);
end $function$
;

CREATE OR REPLACE FUNCTION public.forbid_baseline_snapshot_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.data is distinct from old.data
     or new.sha256 is distinct from old.sha256
     or new.version_no is distinct from old.version_no
     or new.project_id is distinct from old.project_id then
    raise exception 'project_baselines: snapshot (data/sha256/version_no/project_id) is immutable once created';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    new_workspace_id uuid;
    user_tier  text        := 'edu';
    user_trial timestamptz := now() + interval '10 days';
begin
    if new.email ilike '%@electra.aero' then
        user_tier := 'pro-plus';
        user_trial := null;
    elsif new.email ~* '(\.edu$|\.edu\.|\.ac\.)' then
        user_tier := 'edu';
        user_trial := null;
    end if;

    insert into public.users (id, email, tier, trial_ends_at)
    values (new.id, new.email, user_tier, user_trial)
    on conflict (id) do nothing;

    insert into public.workspaces (name, owner_id, is_personal)
    values ('Personal', new.id, true)
    returning id into new_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (new_workspace_id, new.id, 'owner');

    return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id uuid, p_month text, p_delta numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
    insert into public.ai_usage (user_id, month, tokens_used, allowance, tier)
    values (
        p_user_id,
        p_month,
        p_delta,
        coalesce((select allowance from public.ai_usage where user_id = p_user_id and month = p_month), 0),
        coalesce((select tier from public.users where id = p_user_id), 'community')
    )
    on conflict (user_id, month) do update
    set tokens_used = public.ai_usage.tokens_used + p_delta,
        updated_at  = now();
end $function$
;

CREATE OR REPLACE FUNCTION public.is_tenant_approved(p_tid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.approved_tenants
    where tenant_id = p_tid and status = 'active'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ms_sso_before_user_created(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  u          jsonb := coalesce(event->'user', '{}'::jsonb);
  provider   text;
  ident      jsonb;
  idata      jsonb := '{}'::jsonb;
  iss        text;
  tid_text   text;
  tid        uuid;
begin
  -- Resolve the provider from app_metadata or the first identity.
  provider := coalesce(
    u#>>'{app_metadata,provider}',
    (u#>'{identities,0}')->>'provider'
  );

  -- Only Microsoft/Entra sign-ins are gated. Everything else is allowed.
  if provider is distinct from 'azure' then
    return '{}'::jsonb;   -- allow (no change)
  end if;

  ident := u#>'{identities,0}';
  if ident is not null then idata := coalesce(ident->'identity_data', '{}'::jsonb); end if;

  -- Entra puts the tenant id in a few possible places depending on token/version.
  tid_text := coalesce(
    idata->>'tid',
    u#>>'{user_metadata,tid}',
    -- Fall back to parsing it out of the issuer URL:
    --   https://login.microsoftonline.com/<tenant-guid>/v2.0
    (regexp_match(coalesce(idata->>'iss', u#>>'{user_metadata,iss}', ''),
                  'login\.microsoftonline\.com/([0-9a-fA-F-]{36})'))[1]
  );

  begin
    tid := tid_text::uuid;
  exception when others then
    tid := null;
  end;

  if tid is not null and public.is_tenant_approved(tid) then
    return '{}'::jsonb;   -- approved tenant → allow
  end if;

  -- Unapproved (or unresolved) tenant → reject the sign-in.
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Your Microsoft organization is not yet approved for Safety Lab Aero. Contact sales@safetylabaero.com to enable SSO for your tenant.'
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pending_invitations(p_workspace uuid)
 RETURNS TABLE(id uuid, email text, role text, created_at timestamp with time zone, expires_at timestamp with time zone, expired boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.id, i.email, i.role, i.created_at, i.expires_at, (i.expires_at <= now()) as expired
    from public.invitations i
   where i.workspace_id = p_workspace
     and i.accepted_at is null
     and private.can_admin_workspace(p_workspace)
   order by i.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_project(p_project uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ws uuid; v_name text; v_deleted timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select p.workspace_id, p.name, p.deleted_at into v_ws, v_name, v_deleted
    from public.projects p where p.id = p_project;
  if v_ws is null then raise exception 'project not found'; end if;
  if coalesce(private.can_admin_workspace(v_ws), false) is not true then
    raise exception 'only a workspace owner or admin can restore a project' using errcode = '42501';
  end if;
  if v_deleted is null then
    return jsonb_build_object('ok', true, 'already_active', true, 'name', v_name);
  end if;
  update public.projects p set deleted_at = null where p.id = p_project;
  return jsonb_build_object('ok', true, 'restored', true, 'name', v_name, 'workspace_id', v_ws);
end $function$
;

CREATE OR REPLACE FUNCTION public.review_status_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  rid uuid;
  cur_status text;
  n_reviewers int; n_rev_ok int; n_approvers int; n_app_ok int; n_rejected int;
  next_status text;
begin
  rid := coalesce(new.review_id, old.review_id);
  select status into cur_status from public.reviews where id = rid;
  if cur_status is null then return coalesce(new, old); end if;
  if cur_status not in ('in_review','changes_requested','approved') then
    return coalesce(new, old);
  end if;
  select
    count(*) filter (where role = 'reviewer'),
    count(*) filter (where role = 'reviewer' and decision = 'approved'),
    count(*) filter (where role = 'approver'),
    count(*) filter (where role = 'approver' and decision = 'approved'),
    count(*) filter (where decision = 'rejected')
    into n_reviewers, n_rev_ok, n_approvers, n_app_ok, n_rejected
  from public.review_assignments where review_id = rid;

  if n_rejected > 0 then
    next_status := 'changes_requested';
  elsif (n_reviewers + n_approvers) > 0 and n_rev_ok = n_reviewers and n_app_ok = n_approvers then
    next_status := 'approved';
  else
    next_status := 'in_review';
  end if;

  if next_status is distinct from cur_status then
    update public.reviews
       set status = next_status,
           decided_at = case when next_status = 'approved' then now() else null end
     where id = rid;
  end if;
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.set_baseline_version_no()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.version_no is null then
    select coalesce(max(version_no), 0) + 1 into new.version_no
      from public.project_baselines where project_id = new.project_id;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;

CREATE OR REPLACE FUNCTION public.signoffs_chain()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare last_hash text;
begin
  select row_hash into last_hash from public.signoffs order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  new.row_hash  := encode(digest(
      coalesce(new.prev_hash,'') || coalesce(new.project_id::text,'') || coalesce(new.baseline_sha256,'')
      || coalesce(new.signer_user_id::text,'') || coalesce(new.signer_email,'') || coalesce(new.role_at_signing,'')
      || coalesce(new.decision,'') || coalesce(new.meaning,'') || coalesce(new.ts::text,''), 'sha256'), 'hex');
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.sl_doc_items(d jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
AS $function$
declare
  k text;
  n integer := 0;
begin
  if d is null or jsonb_typeof(d) <> 'object' then
    return 0;
  end if;
  foreach k in array array[
      'acFunctionsData','acFcimData','acFhaData','acReqData','acAssumptionsData',
      'systemsData','ftaPages','fmeaData','itemsData',
      'praData','zsaData','cmaData','routingData','resourcesData'
  ] loop
    if jsonb_typeof(d->k) = 'array' then
      n := n + jsonb_array_length(d->k);
    end if;
  end loop;
  if n = 1
     and jsonb_typeof(d->'ftaPages') = 'array'
     and jsonb_array_length(d->'ftaPages') = 1
     and coalesce(d->'ftaPages'->0->>'root','null') in ('null','')
  then
    n := 0;
  end if;
  return n;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sl_guard_project_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  old_items integer;
  new_items integer;
  last_archive timestamptz;
begin
  if TG_OP = 'INSERT' then
    return NEW;
  end if;

  old_items := public.sl_doc_items(OLD.data);
  new_items := public.sl_doc_items(NEW.data);

  select max(saved_at) into last_archive
    from project_document_versions where project_id = OLD.project_id;

  if old_items > 0
     and (new_items < old_items or last_archive is null or last_archive < now() - interval '10 minutes')
  then
    insert into project_document_versions (project_id, version, data, saved_by, saved_at)
    values (OLD.project_id, OLD.version, OLD.data, OLD.updated_by, coalesce(OLD.updated_at, now()))
    on conflict (project_id, version) do nothing;

    if (select count(*) from project_document_versions where project_id = OLD.project_id) > 80 then
      delete from project_document_versions v
      where v.project_id = OLD.project_id
        and v.id not in (
          select id from (
            (select id from project_document_versions
              where project_id = OLD.project_id order by saved_at desc limit 50)
            union
            (select id from project_document_versions
              where project_id = OLD.project_id order by public.sl_doc_items(data) desc limit 10)
          ) keepers
        );
    end if;
  end if;

  if old_items >= 10
     and new_items < (old_items * 0.2)
     and coalesce((NEW.data->>'_slIntentionalClear')::boolean, false) is not true
     and coalesce(current_setting('sl.restore', true), '') <> 'on'
  then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Refused: this save would cut project content from %s items to %s. Nothing was written - the saved project still holds all %s.',
        old_items, new_items, old_items),
      hint = 'Earlier snapshots are listed by sl_recovery_points(). If this really is intentional, save again with _slIntentionalClear set on the payload.';
  end if;

  -- [H-2] 31 Aug 2026 — THE ONLY CHANGE IN THIS FILE.
  -- A stale tab that never loaded the document's version token writes version 1
  -- over version N. Rewrite rather than refuse: the engineer's content is kept,
  -- the counter stays monotonic, and the stale client discovers the conflict on
  -- its NEXT save, where the fixed client banks first and says so plainly.
  -- Nulls are left alone deliberately — a missing version is a different defect
  -- and inventing a number for it would hide it.
  if TG_OP = 'UPDATE'
     and NEW.version is not null and OLD.version is not null
     and NEW.version <= OLD.version
     and coalesce(current_setting('sl.restore', true), '') <> 'on'
  then
    NEW.version := OLD.version + 1;
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sl_recovery_points(p_project uuid)
 RETURNS TABLE(kind text, version integer, saved_at timestamp with time zone, items integer, bytes integer, saved_by uuid, is_restorable boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select 'live'::text, d.version, d.updated_at,
         public.sl_doc_items(d.data), length(d.data::text), d.updated_by, false
    from public.project_documents d
   where d.project_id = p_project
  union all
  select 'archive'::text, v.version, v.saved_at,
         public.sl_doc_items(v.data), length(v.data::text), v.saved_by, true
    from public.project_document_versions v
   where v.project_id = p_project
   order by 3 desc;
$function$
;

CREATE OR REPLACE FUNCTION public.sl_restore_project_baseline(p_project uuid, p_baseline uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace uuid; v_cur_data jsonb; v_cur_version integer;
  v_cur_by uuid; v_cur_at timestamptz; v_new_data jsonb; v_label text; v_rev_no integer;
  v_new_version integer; v_archived_as integer; v_max_ver integer;
begin
  select p.workspace_id into v_workspace
    from public.projects p where p.id = p_project and p.deleted_at is null;
  if v_workspace is null then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_workspace(v_workspace) then
    raise exception 'Not permitted to restore this project' using errcode = '42501';
  end if;

  -- The baseline must belong to THIS project — p_baseline alone is not trusted.
  select b.data, b.label, b.version_no into v_new_data, v_label, v_rev_no
    from public.project_baselines b
   where b.id = p_baseline and b.project_id = p_project;
  if v_new_data is null then
    raise exception 'No such revision for this project' using errcode = 'P0002';
  end if;

  select d.data, d.version, d.updated_by, d.updated_at
    into v_cur_data, v_cur_version, v_cur_by, v_cur_at
    from public.project_documents d where d.project_id = p_project for update;
  if v_cur_data is null then
    raise exception 'Project has no live document' using errcode = 'P0002';
  end if;

  select coalesce(max(v.version), 0) into v_max_ver
    from public.project_document_versions v where v.project_id = p_project;

  -- Bank the pre-restore state so the restore itself is reversible. Same
  -- collision handling as sl_restore_project_version: recognise a byte-identical
  -- row already banked, otherwise allocate max+1 — never silently drop the copy.
  begin
    insert into public.project_document_versions (project_id, version, data, saved_by, saved_at)
    values (p_project, v_cur_version, v_cur_data, v_cur_by, coalesce(v_cur_at, now()))
    returning version into v_archived_as;
  exception when unique_violation then
    if exists (select 1 from public.project_document_versions
                where project_id = p_project and version = v_cur_version and data = v_cur_data) then
      v_archived_as := v_cur_version;
    else
      v_max_ver := v_max_ver + 1;
      insert into public.project_document_versions (project_id, version, data, saved_by, saved_at)
      values (p_project, v_max_ver, v_cur_data, v_cur_by, coalesce(v_cur_at, now()))
      returning version into v_archived_as;
    end if;
  end;

  v_new_version := greatest(v_cur_version, v_max_ver, v_archived_as) + 1;

  -- Open the guard for exactly one statement, then shut it.
  perform set_config('sl.restore', 'on', true);
  update public.project_documents d
     set data = v_new_data,
         version = v_new_version,
         updated_by = coalesce(auth.uid(), v_cur_by),
         updated_at = now()
   where d.project_id = p_project;
  perform set_config('sl.restore', 'off', true);

  return jsonb_build_object(
    'ok', true, 'project_id', p_project, 'restored_from_baseline', p_baseline,
    'revision_no', v_rev_no, 'revision_label', v_label,
    'new_version', v_new_version, 'undo_version', v_archived_as,
    'items_before', public.sl_doc_items(v_cur_data),
    'items_after', public.sl_doc_items(v_new_data)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sl_restore_project_version(p_project uuid, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace uuid; v_cur_data jsonb; v_cur_version integer;
  v_cur_by uuid; v_cur_at timestamptz; v_new_data jsonb;
  v_new_version integer; v_archived_as integer; v_max_ver integer;
begin
  select p.workspace_id into v_workspace
    from public.projects p where p.id = p_project and p.deleted_at is null;
  if v_workspace is null then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_workspace(v_workspace) then
    raise exception 'Not permitted to restore this project' using errcode = '42501';
  end if;

  select v.data into v_new_data from public.project_document_versions v
   where v.project_id = p_project and v.version = p_version;
  if v_new_data is null then
    raise exception 'No archived version % for this project', p_version using errcode = 'P0002';
  end if;

  select d.data, d.version, d.updated_by, d.updated_at
    into v_cur_data, v_cur_version, v_cur_by, v_cur_at
    from public.project_documents d where d.project_id = p_project for update;
  if v_cur_data is null then
    raise exception 'Project has no live document' using errcode = 'P0002';
  end if;

  select coalesce(max(v.version), 0) into v_max_ver
    from public.project_document_versions v where v.project_id = p_project;

  begin
    insert into public.project_document_versions (project_id, version, data, saved_by, saved_at)
    values (p_project, v_cur_version, v_cur_data, v_cur_by, coalesce(v_cur_at, now()))
    returning version into v_archived_as;
  exception when unique_violation then
    if exists (select 1 from public.project_document_versions
                where project_id = p_project and version = v_cur_version and data = v_cur_data) then
      v_archived_as := v_cur_version;
    else
      v_max_ver := v_max_ver + 1;
      insert into public.project_document_versions (project_id, version, data, saved_by, saved_at)
      values (p_project, v_max_ver, v_cur_data, v_cur_by, coalesce(v_cur_at, now()))
      returning version into v_archived_as;
    end if;
  end;

  v_new_version := greatest(v_cur_version, v_max_ver, v_archived_as) + 1;

  -- Open the guard for exactly one statement, then shut it. is_local scopes to
  -- the TRANSACTION, so without the reset below every later statement in the
  -- caller's transaction would run unguarded.
  perform set_config('sl.restore', 'on', true);
  update public.project_documents d
     set data = v_new_data,
         version = v_new_version,
         updated_by = coalesce(auth.uid(), v_cur_by),
         updated_at = now()
   where d.project_id = p_project;
  perform set_config('sl.restore', 'off', true);

  return jsonb_build_object(
    'ok', true, 'project_id', p_project, 'restored_from', p_version,
    'new_version', v_new_version, 'undo_version', v_archived_as,
    'items_before', public.sl_doc_items(v_cur_data),
    'items_after', public.sl_doc_items(v_new_data)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_workspace_ownership(p_workspace uuid, p_new_owner uuid)
 RETURNS TABLE(status text, workspace_id uuid, new_owner uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return query select 'not_signed_in'::text, p_workspace, p_new_owner; return;
  end if;

  if not exists (select 1 from public.workspaces w
                  where w.id = p_workspace and w.owner_id = v_uid) then
    return query select 'not_owner'::text, p_workspace, p_new_owner; return;
  end if;

  if p_new_owner = v_uid then
    return query select 'already_owner'::text, p_workspace, p_new_owner; return;
  end if;

  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_workspace and m.user_id = p_new_owner) then
    return query select 'not_a_member'::text, p_workspace, p_new_owner; return;
  end if;

  update public.workspaces as w
     set owner_id = p_new_owner
   where w.id = p_workspace;

  update public.workspace_members as m
     set role = 'admin'
   where m.workspace_id = p_workspace and m.user_id = v_uid;

  update public.workspace_members as m
     set role = 'owner'
   where m.workspace_id = p_workspace and m.user_id = p_new_owner;

  return query select 'ok'::text, p_workspace, p_new_owner;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_signoff_chain()
 RETURNS TABLE(ok boolean, first_bad_id bigint, checked bigint)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$select * from private.verify_signoff_chain()$function$
;


-- ================= 40_triggers.sql =================
-- ===== TRIGGERS (service_role JWT redacted; set per install) =====
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ai_usage_updated BEFORE UPDATE ON public.ai_usage FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_project_docs_updated BEFORE UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER license_tokens_updated_at BEFORE UPDATE ON public.license_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_baseline_version_no BEFORE INSERT ON public.project_baselines FOR EACH ROW EXECUTE FUNCTION set_baseline_version_no();
CREATE TRIGGER trg_baseline_immutable BEFORE UPDATE ON public.project_baselines FOR EACH ROW EXECUTE FUNCTION forbid_baseline_snapshot_mutation();
CREATE TRIGGER trg_signoffs_chain BEFORE INSERT ON public.signoffs FOR EACH ROW EXECUTE FUNCTION signoffs_chain();
CREATE TRIGGER trg_audit_log_chain BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_chain();
CREATE TRIGGER trg_review_rollup AFTER INSERT OR DELETE OR UPDATE ON public.review_assignments FOR EACH ROW EXECUTE FUNCTION review_status_rollup();
CREATE TRIGGER "notify-review-assigned" AFTER INSERT ON public.review_assignments FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://fhrqkhdrwbfnizkepkch.supabase.co/functions/v1/notify-review', 'POST', '{"Content-type":"application/json","Authorization":"Bearer <SERVICE_ROLE_JWT>"}', '{}', '5000');
CREATE TRIGGER "notify-review-status" AFTER UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://fhrqkhdrwbfnizkepkch.supabase.co/functions/v1/notify-review', 'POST', '{"Content-type":"application/json","Authorization":"Bearer <SERVICE_ROLE_JWT>"}', '{}', '5000');
CREATE TRIGGER "notify-review-comment" AFTER INSERT ON public.review_comments FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://fhrqkhdrwbfnizkepkch.supabase.co/functions/v1/notify-review', 'POST', '{"Content-type":"application/json","Authorization":"Bearer <SERVICE_ROLE_JWT>"}', '{}', '5000');
CREATE TRIGGER trg_ai_org_cache_trim AFTER INSERT ON public.ai_org_cache FOR EACH ROW EXECUTE FUNCTION ai_org_cache_trim();
CREATE TRIGGER audit_log_immutable BEFORE DELETE OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION private.audit_immutable();
CREATE TRIGGER workspace_audit_immutable BEFORE DELETE OR UPDATE ON public.workspace_audit FOR EACH ROW EXECUTE FUNCTION private.audit_immutable();
CREATE TRIGGER on_user_created_apply_comp AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION apply_pending_comp();
CREATE TRIGGER sl_guard_project_document_trg BEFORE UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION sl_guard_project_document();
CREATE TRIGGER sl_guard_project_archive BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION private.guard_project_archive();


-- ================= 50_rls.sql =================
-- ===== ROW LEVEL SECURITY =====
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yjs_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destruction_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_comps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_crdt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approved_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_org_cache ENABLE ROW LEVEL SECURITY;


-- ================= 60_policies.sql =================
-- ===== RLS POLICIES (59) =====
CREATE POLICY ai_cache_delete_own ON public.ai_org_cache AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY ai_cache_insert_own ON public.ai_org_cache AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY ai_cache_select_own ON public.ai_org_cache AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY ai_cache_update_own ON public.ai_org_cache AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY ai_usage_self_read ON public.ai_usage AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY approved_tenants_admin_all ON public.approved_tenants AS PERMISSIVE FOR ALL TO authenticated USING (private.is_safety_lab_admin()) WITH CHECK (private.is_safety_lab_admin());
CREATE POLICY audit_self_read ON public.audit_log AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY dc_self_read ON public.destruction_certificates AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY feedback_insert_own ON public.feedback AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY feedback_select_admin ON public.feedback AS PERMISSIVE FOR SELECT TO authenticated USING (private.is_safety_lab_admin());
CREATE POLICY invitations_admin_delete ON public.invitations AS PERMISSIVE FOR DELETE TO public USING (private.can_admin_workspace(workspace_id));
CREATE POLICY invitations_admin_insert ON public.invitations AS PERMISSIVE FOR INSERT TO public WITH CHECK (private.can_admin_workspace(workspace_id));
CREATE POLICY invitations_admin_read ON public.invitations AS PERMISSIVE FOR SELECT TO public USING (private.can_admin_workspace(workspace_id));
CREATE POLICY invitations_admin_update ON public.invitations AS PERMISSIVE FOR UPDATE TO public USING (private.can_admin_workspace(workspace_id));
CREATE POLICY license_tokens_self_select ON public.license_tokens AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY notification_log_select_admin ON public.notification_log AS PERMISSIVE FOR SELECT TO authenticated USING (private.is_safety_lab_admin());
CREATE POLICY baselines_admin_delete ON public.project_baselines AS PERMISSIVE FOR DELETE TO authenticated USING (((status <> 'released'::text) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_baselines.project_id) AND private.can_admin_workspace(p.workspace_id))))));
CREATE POLICY baselines_editor_insert ON public.project_baselines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_baselines.project_id) AND private.can_edit_workspace(p.workspace_id)))));
CREATE POLICY baselines_editor_update ON public.project_baselines AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_baselines.project_id) AND private.can_edit_workspace(p.workspace_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_baselines.project_id) AND private.can_edit_workspace(p.workspace_id)))));
CREATE POLICY baselines_member_read ON public.project_baselines AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_baselines.project_id) AND private.is_workspace_member(p.workspace_id) AND (p.deleted_at IS NULL)))));
CREATE POLICY project_crdt_editor_write ON public.project_crdt AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_crdt.project_id) AND private.can_edit_workspace(p.workspace_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_crdt.project_id) AND private.can_edit_workspace(p.workspace_id)))));
CREATE POLICY project_crdt_member_read ON public.project_crdt AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_crdt.project_id) AND private.is_workspace_member(p.workspace_id) AND (p.deleted_at IS NULL)))));
CREATE POLICY pdv_admin_delete ON public.project_document_versions AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_document_versions.project_id) AND private.can_admin_workspace(p.workspace_id)))));
CREATE POLICY pdv_editor_insert ON public.project_document_versions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_document_versions.project_id) AND private.can_edit_workspace(p.workspace_id)))));
CREATE POLICY pdv_member_read ON public.project_document_versions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_document_versions.project_id) AND private.is_workspace_member(p.workspace_id) AND (p.deleted_at IS NULL)))));
CREATE POLICY project_docs_editor_write ON public.project_documents AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_documents.project_id) AND private.can_edit_workspace(p.workspace_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_documents.project_id) AND private.can_edit_workspace(p.workspace_id)))));
CREATE POLICY project_docs_member_read ON public.project_documents AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_documents.project_id) AND private.is_workspace_member(p.workspace_id) AND (p.deleted_at IS NULL)))));
CREATE POLICY projects_admin_delete ON public.projects AS PERMISSIVE FOR DELETE TO public USING (private.can_admin_workspace(workspace_id));
CREATE POLICY projects_editor_insert ON public.projects AS PERMISSIVE FOR INSERT TO public WITH CHECK (private.can_edit_workspace(workspace_id));
CREATE POLICY projects_editor_update ON public.projects AS PERMISSIVE FOR UPDATE TO public USING (private.can_edit_workspace(workspace_id));
CREATE POLICY projects_member_read ON public.projects AS PERMISSIVE FOR SELECT TO public USING ((private.is_workspace_member(workspace_id) AND (deleted_at IS NULL)));
CREATE POLICY rasg_editor_delete ON public.review_assignments AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (reviews r
     JOIN projects p ON ((p.id = r.project_id)))
  WHERE ((r.id = review_assignments.review_id) AND private.can_edit_workspace(p.workspace_id)))));
CREATE POLICY rasg_editor_insert ON public.review_assignments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (reviews r
     JOIN projects p ON ((p.id = r.project_id)))
  WHERE ((r.id = review_assignments.review_id) AND private.can_edit_workspace(p.workspace_id)))));
CREATE POLICY rasg_member_read ON public.review_assignments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (reviews r
     JOIN projects p ON ((p.id = r.project_id)))
  WHERE ((r.id = review_assignments.review_id) AND private.is_workspace_member(p.workspace_id) AND (p.deleted_at IS NULL)))));
CREATE POLICY rasg_update ON public.review_assignments AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (reviews r
     JOIN projects p ON ((p.id = r.project_id)))
  WHERE ((r.id = review_assignments.review_id) AND private.can_edit_workspace(p.workspace_id)))))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (reviews r
     JOIN projects p ON ((p.id = r.project_id)))
  WHERE ((r.id = review_assignments.review_id) AND private.can_edit_workspace(p.workspace_id))))));
CREATE POLICY rcom_author_delete ON public.review_comments AS PERMISSIVE FOR DELETE TO authenticated USING (((author = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (reviews r
     JOIN projects p ON ((p.id = r.project_id)))
  WHERE ((r.id = review_comments.review_id) AND private.can_admin_workspace(p.workspace_id))))));
CREATE POLICY rcom_author_update ON public.review_comments AS PERMISSIVE FOR UPDATE TO authenticated USING (((author = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (reviews r
     JOIN projects p ON ((p.id = r.project_id)))
  WHERE ((r.id = review_comments.review_id) AND private.can_admin_workspace(p.workspace_id))))));
CREATE POLICY rcom_member_read ON public.review_comments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (reviews r
     JOIN projects p ON ((p.id = r.project_id)))
  WHERE ((r.id = review_comments.review_id) AND private.is_workspace_member(p.workspace_id) AND (p.deleted_at IS NULL)))));
CREATE POLICY rcom_reviewer_insert ON public.review_comments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((author = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (reviews r
     JOIN projects p ON ((p.id = r.project_id)))
  WHERE ((r.id = review_comments.review_id) AND private.can_review_workspace(p.workspace_id))))));
CREATE POLICY reviews_admin_delete ON public.reviews AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = reviews.project_id) AND private.can_admin_workspace(p.workspace_id)))));
CREATE POLICY reviews_editor_insert ON public.reviews AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((requested_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = reviews.project_id) AND private.can_edit_workspace(p.workspace_id))))));
CREATE POLICY reviews_editor_update ON public.reviews AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = reviews.project_id) AND private.can_edit_workspace(p.workspace_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = reviews.project_id) AND private.can_edit_workspace(p.workspace_id)))));
CREATE POLICY reviews_member_read ON public.reviews AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = reviews.project_id) AND private.is_workspace_member(p.workspace_id) AND (p.deleted_at IS NULL)))));
CREATE POLICY signoffs_member_read ON public.signoffs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = signoffs.project_id) AND private.is_workspace_member(p.workspace_id) AND (p.deleted_at IS NULL)))));
CREATE POLICY signoffs_self_insert ON public.signoffs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((signer_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = signoffs.project_id) AND private.can_review_workspace(p.workspace_id))))));
CREATE POLICY users_self_read ON public.users AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY ws_audit_member_read ON public.workspace_audit AS PERMISSIVE FOR SELECT TO public USING (private.is_workspace_member(workspace_id));
CREATE POLICY ws_members_admin_delete ON public.workspace_members AS PERMISSIVE FOR DELETE TO public USING ((private.can_admin_workspace(workspace_id) AND (role <> 'owner'::text)));
CREATE POLICY ws_members_admin_insert ON public.workspace_members AS PERMISSIVE FOR INSERT TO public WITH CHECK (private.can_admin_workspace(workspace_id));
CREATE POLICY ws_members_admin_update ON public.workspace_members AS PERMISSIVE FOR UPDATE TO public USING ((private.can_admin_workspace(workspace_id) AND (role <> 'owner'::text))) WITH CHECK ((private.can_admin_workspace(workspace_id) AND (role <> 'owner'::text)));
CREATE POLICY ws_members_member_read ON public.workspace_members AS PERMISSIVE FOR SELECT TO public USING (private.is_workspace_member(workspace_id));
CREATE POLICY ws_members_self_join ON public.workspace_members AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() = user_id) AND private.owns_workspace(workspace_id) AND (role = 'owner'::text)));
CREATE POLICY workspaces_member_read ON public.workspaces AS PERMISSIVE FOR SELECT TO public USING (private.is_workspace_member(id));
CREATE POLICY workspaces_owner_delete ON public.workspaces AS PERMISSIVE FOR DELETE TO public USING (private.is_workspace_owner(id));
CREATE POLICY workspaces_owner_read ON public.workspaces AS PERMISSIVE FOR SELECT TO public USING ((owner_id = auth.uid()));
CREATE POLICY workspaces_owner_update ON public.workspaces AS PERMISSIVE FOR UPDATE TO public USING (private.is_workspace_owner(id));
CREATE POLICY workspaces_self_insert ON public.workspaces AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY yjs_docs_editor_write ON public.yjs_documents AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = yjs_documents.project_id) AND private.can_edit_workspace(p.workspace_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = yjs_documents.project_id) AND private.can_edit_workspace(p.workspace_id)))));
CREATE POLICY yjs_docs_member_read ON public.yjs_documents AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = yjs_documents.project_id) AND private.is_workspace_member(p.workspace_id) AND (p.deleted_at IS NULL)))));


-- ================= 70_func_grants.sql =================
-- ===== FUNCTION GRANTS =====
GRANT EXECUTE ON FUNCTION public.sl_recovery_points(p_project uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sl_recovery_points(p_project uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.sl_recovery_points(p_project uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sl_restore_project_version(p_project uuid, p_version integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sl_restore_project_version(p_project uuid, p_version integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pending_invitations(p_workspace uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pending_invitations(p_workspace uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.pending_invitations(p_workspace uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.signoffs_chain() TO service_role;
GRANT EXECUTE ON FUNCTION private.guard_project_archive() TO authenticated;
GRANT EXECUTE ON FUNCTION private.guard_project_archive() TO anon;
GRANT EXECUTE ON FUNCTION private.guard_project_archive() TO service_role;
GRANT EXECUTE ON FUNCTION public.erase_project(p_project_id uuid, p_confirm boolean) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_workspace_member(p_workspace uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_workspace_member(p_workspace uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sl_restore_project_baseline(p_project uuid, p_baseline uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sl_restore_project_baseline(p_project uuid, p_baseline uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_workspace_owner(p_workspace uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_workspace_owner(p_workspace uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_signoff_chain() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_signoff_chain() TO anon;
GRANT EXECUTE ON FUNCTION public.verify_signoff_chain() TO service_role;
GRANT EXECUTE ON FUNCTION public.erase_my_account(p_confirm boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erase_my_account(p_confirm boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.erase_my_account(p_confirm boolean) TO service_role;
GRANT EXECUTE ON FUNCTION private.audit_immutable() TO authenticated;
GRANT EXECUTE ON FUNCTION private.audit_immutable() TO anon;
GRANT EXECUTE ON FUNCTION private.audit_immutable() TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_project(p_project uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_project(p_project uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_tokens(p_token text, p_amount bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.archived_projects(p_workspace uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archived_projects(p_workspace uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_project(p_project uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_project(p_project uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.owns_workspace(p_workspace uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_workspace(p_workspace uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(p_user_id uuid, p_month text, p_delta numeric) TO service_role;
GRANT EXECUTE ON FUNCTION private.workspace_role(p_workspace uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.workspace_role(p_workspace uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.is_safety_lab_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_safety_lab_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_baseline_version_no() TO service_role;
GRANT EXECUTE ON FUNCTION public.forbid_baseline_snapshot_mutation() TO service_role;
GRANT EXECUTE ON FUNCTION public.sl_doc_items(d jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sl_doc_items(d jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.sl_doc_items(d jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION private.can_edit_workspace(p_workspace uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_edit_workspace(p_workspace uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.can_admin_workspace(p_workspace uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_admin_workspace(p_workspace uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.can_review_workspace(p_workspace uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_review_workspace(p_workspace uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_log_chain() TO service_role;
GRANT EXECUTE ON FUNCTION public.review_status_rollup() TO service_role;
GRANT EXECUTE ON FUNCTION private.erase_my_account(p_confirm boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.erase_my_account(p_confirm boolean) TO service_role;
GRANT EXECUTE ON FUNCTION private.verify_signoff_chain() TO authenticated;
GRANT EXECUTE ON FUNCTION private.verify_signoff_chain() TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_workspace_ownership(p_workspace uuid, p_new_owner uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_workspace_ownership(p_workspace uuid, p_new_owner uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sl_guard_project_document() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sl_guard_project_document() TO anon;
GRANT EXECUTE ON FUNCTION public.sl_guard_project_document() TO service_role;
GRANT EXECUTE ON FUNCTION public.ms_sso_before_user_created(event jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_approved(p_tid uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_org_cache_trim() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_pending_comp() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pending_comp() TO anon;
GRANT EXECUTE ON FUNCTION public.apply_pending_comp() TO service_role;


-- ================= 80_table_grants.sql =================
-- ===== TABLE GRANTS (exact per production) =====
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_org_cache TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_org_cache TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_org_cache TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_usage TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_usage TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_usage TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.approved_tenants TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.approved_tenants TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.approved_tenants TO service_role;
GRANT INSERT, REFERENCES, SELECT, TRIGGER ON public.audit_log TO anon;
GRANT INSERT, REFERENCES, SELECT, TRIGGER ON public.audit_log TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_log TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.destruction_certificates TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.destruction_certificates TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.destruction_certificates TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feedback TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feedback TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feedback TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.invitations TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.invitations TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.invitations TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.license_tokens TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.license_tokens TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.license_tokens TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notification_log TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notification_log TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notification_log TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pending_comps TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pending_comps TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pending_comps TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.project_baselines TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.project_baselines TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.project_baselines TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.project_crdt TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.project_crdt TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.project_crdt TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.project_document_versions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.project_document_versions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.project_document_versions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.project_documents TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.project_documents TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.project_documents TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.projects TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.projects TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.projects TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.review_assignments TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.review_assignments TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.review_assignments TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.review_comments TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.review_comments TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.review_comments TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reviews TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reviews TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reviews TO service_role;
GRANT INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.signoffs TO anon;
GRANT INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.signoffs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.signoffs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.users TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.users TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.users TO service_role;
GRANT INSERT, REFERENCES, SELECT, TRIGGER ON public.workspace_audit TO anon;
GRANT INSERT, REFERENCES, SELECT, TRIGGER ON public.workspace_audit TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.workspace_audit TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.workspace_members TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.workspace_members TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.workspace_members TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.workspaces TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.workspaces TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.workspaces TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.yjs_documents TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.yjs_documents TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.yjs_documents TO service_role;

-- LOCAL-PROOF ONLY: stub the Supabase-managed base the baseline assumes.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb, '{}'::jsonb) $$;
CREATE SCHEMA IF NOT EXISTS supabase_functions;
CREATE OR REPLACE FUNCTION supabase_functions.http_request() RETURNS trigger LANGUAGE plpgsql AS $$ begin return coalesce(new, old); end $$;
-- digest()/gen_random_bytes() are used unqualified with search_path incl. extensions; expose in public for the proof:
CREATE OR REPLACE FUNCTION public.digest(text, text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ select extensions.digest($1,$2) $$;
CREATE OR REPLACE FUNCTION public.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql VOLATILE AS $$ select extensions.gen_random_bytes($1) $$;

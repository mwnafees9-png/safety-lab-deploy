-- ============================================================================
-- 20260928a_chain_serialization.sql — the hash chains fork under concurrency
--
-- FOUND 28 Sep 2026 on PRODUCTION, by reading the database rather than the
-- register. private.run_chain_verification() recorded chain 'audit_log',
-- ok = false, first_bad_id = 15 at 03:17 UTC. Every run from 22 to 27 Sep had
-- passed, each one checking FOUR rows. The first night of real AI traffic broke it.
--
-- WHAT HAPPENED. audit_log rows 14 and 15 both carry prev_hash = the hash of
-- row 13. Two AI calls committed inside the same 200 ms during the Q12-Q14 eval,
-- both ran the trigger's tail read before either had committed, and both chained
-- onto the same row. Row 16 then chained onto 15, so 14 is orphaned. Row 15 is
-- timestamped 00:00:44.036 and row 14 is 00:00:44.227 — the row written FIRST
-- got the LATER id.
--
-- TWO DEFECTS, AND BOTH HAVE TO GO, which is why the obvious one-line fix is not
-- enough:
--
--   (1) THE TAIL READ IS UNLOCKED.
--         select row_hash into last_hash from <t> order by id desc limit 1;
--       Under READ COMMITTED two concurrent inserts both see the same last row.
--
--   (2) THE ID IS TAKEN BEFORE THE LOCK, FROM THE COLUMN DEFAULT.
--       Even with (1) fixed, transaction A can draw id 14 from the sequence,
--       transaction B draw 15, B acquire the lock first and chain correctly, and
--       A then chain onto B while carrying the LOWER id. Every verifier walks
--       `order by id asc`, so the chain would be cryptographically sound and
--       still fail its own check. The id must be drawn inside the lock.
--
--   And a third, for honesty rather than integrity: ts defaulted to now(), which
--   is transaction-start time, so an audit ledger could show a row with a lower
--   timestamp after a higher one. Taken inside the lock with clock_timestamp(),
--   id order, timestamp order and chain order are the same order.
--
-- PROVEN BEFORE AND AFTER on the throwaway project, using two and then three
-- pg_cron workers as genuinely separate backends (a single session cannot race
-- itself, and dblink would have needed credentials):
--
--   BEFORE   1,800 rows, 2 writers → 4 forked prev_hashes, 8 rows in forks,
--                                    33 rows whose id order contradicted their ts
--   AFTER    3,780 rows, 3 writers → 0 forks, 0 broken links walking id asc,
--                                    0 ts-order violations, 0 hashes that failed
--                                    to recompute
--
--   Tamper evidence re-proved on the fixed chain, so the fix did not simply make
--   the verifier blind: payload edited → caught; prev_hash repointed → caught;
--   row deleted from the middle → caught.
--
-- ALL FOUR LEDGERS carry the identical unlocked read-then-write. audit_log is the
-- only one that has forked, because it is the only one that has seen concurrent
-- writes. signoffs (0 rows), problem_report_events (0 rows) and change_journal
-- (301 rows, chained per project so a single editor never raced itself) were
-- waiting their turn.
--
-- THIS MIGRATION DOES NOT REPAIR THE EXISTING BREAK. It cannot: UPDATE and DELETE
-- are revoked on these tables by 20260917b and that revoke is correct. The break
-- at audit_log id 15 is permanent and needs a ruling — see OPEN_ITEMS SEC-0.
-- Until that lands, the daily verification will keep reporting ok = false for
-- audit_log, which is the honest state of affairs and should stay visible.
-- ============================================================================

-- ---------------------------------------------------------------- audit_log
create or replace function public.audit_log_chain()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare last_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('public.audit_log'));
  new.id  := nextval('public.audit_log_id_seq');
  new.ts  := clock_timestamp();
  select row_hash into last_hash from public.audit_log order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  new.row_hash  := encode(digest(
      coalesce(new.prev_hash,'') || coalesce(new.user_id::text,'') || coalesce(new.feature,'')
      || coalesce(new.model,'') || coalesce(new.tokens_in::text,'') || coalesce(new.tokens_out::text,'')
      || coalesce(new.ts::text,''), 'sha256'), 'hex');
  return new;
end $function$;

-- ----------------------------------------------------------------- signoffs
create or replace function public.signoffs_chain()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare last_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('public.signoffs'));
  new.id := nextval('public.signoffs_id_seq');
  new.ts := clock_timestamp();
  select row_hash into last_hash from public.signoffs order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  new.row_hash  := encode(digest(
      coalesce(new.prev_hash,'') || coalesce(new.project_id::text,'') || coalesce(new.baseline_sha256,'')
      || coalesce(new.signer_user_id::text,'') || coalesce(new.signer_email,'') || coalesce(new.role_at_signing,'')
      || coalesce(new.decision,'') || coalesce(new.meaning,'') || coalesce(new.ts::text,''), 'sha256'), 'hex');
  return new;
end $function$;

-- ------------------------------------------------------------ change_journal
-- Chained PER PROJECT, so the lock is per project too: a two-key advisory lock
-- keyed on the table and the project id. Locking the whole table here would
-- serialise every editor in every workspace behind one another.
create or replace function public.change_journal_chain()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare last_hash text; claims jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('public.change_journal'), hashtext(coalesce(new.project_id::text,'')));
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  new.actor       := coalesce(auth.uid(), new.actor);
  new.actor_email := coalesce(claims->>'email', new.actor_email);
  new.id          := nextval('public.change_journal_id_seq');
  new.ts          := clock_timestamp();
  select row_hash into last_hash from public.change_journal where project_id = new.project_id order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  new.row_hash  := encode(digest(
      coalesce(new.prev_hash,'') || coalesce(new.project_id::text,'') || coalesce(new.actor::text,'')
      || coalesce(new.actor_email,'')
      || coalesce(new.action,'') || coalesce(new.entity_kind,'') || coalesce(new.entity_id,'')
      || coalesce(new.summary::text,'') || coalesce(new.ts::text,''), 'sha256'), 'hex');
  return new;
end $function$;

-- ------------------------------------------------- problem_report_events
create or replace function public.problem_report_events_chain()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare last_hash text; claims jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('public.problem_report_events'), hashtext(coalesce(new.project_id::text,'')));
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  new.actor       := coalesce(auth.uid(), new.actor);
  new.actor_email := coalesce(claims->>'email', new.actor_email);
  new.id          := nextval('public.problem_report_events_id_seq');
  new.ts          := clock_timestamp();
  select row_hash into last_hash from public.problem_report_events where project_id = new.project_id order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, '');
  new.row_hash  := encode(digest(
      coalesce(new.prev_hash,'') || coalesce(new.project_id::text,'') || coalesce(new.report_id,'')
      || coalesce(new.event,'') || coalesce(new.actor::text,'') || coalesce(new.actor_email,'')
      || coalesce(new.payload::text,'')
      || coalesce(new.ts::text,''), 'sha256'), 'hex');
  return new;
end $function$;

-- ------------------------------------------------------------------ notes
-- The id reassignment leaves gaps in each sequence (the column default draws one
-- value, the trigger draws the next). Gaps are harmless: nothing reads these ids
-- as a count, and the chain is what establishes completeness.

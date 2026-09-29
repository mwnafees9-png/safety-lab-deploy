-- ============================================================================
-- 20260929b_register_28sep_concurrency_forks.sql
--
-- PRODUCTION DATA, not schema. This registers the eleven forks the 28 Sep 2026
-- Q12-Q14 eval put into audit_log, so the verifier reports the ledger honestly:
-- ok = true, segments = 12, acknowledged = 11, rather than stopping at id 15 and
-- reporting one break where there were eleven. Mechanism and fix: 20260928a.
-- Machinery and its mutation proof: 20260929a.
--
-- Nothing is registered on trust. Each row has to pass three checks, written
-- into the WHERE clause below rather than asserted in a comment:
--   1. it recomputes its own row_hash from its own payload,
--   2. its prev_hash matches the row_hash of a real earlier row, so it is a fork
--      off the genuine chain and not an invented link,
--   3. it falls inside the window of the fault, before the fix went on.
-- Any row that fails one of those is left unregistered, and an unregistered
-- break still fails the chain. Run it twice and it registers the same eleven.
--
-- A customer install has no forks to register and should not run this file.
-- ============================================================================

delete from public.chain_breaks where chain = 'audit_log' and scope = '';

insert into public.chain_breaks (chain, scope, break_at_id, break_prev_hash, prior_id, prior_row_hash, reason, acknowledged_by)
with w as (
  select id, ts, prev_hash, row_hash,
         lag(id)       over (order by id) as prior_id,
         lag(row_hash) over (order by id) as prior_row_hash
  from public.audit_log
)
select 'audit_log', '', w.id, w.prev_hash, w.prior_id, w.prior_row_hash,
       'Concurrency fork during the Q12-Q14 AI eval on 28 Sep 2026, one of eleven between 00:00:44 and 00:47:13 UTC. The chain trigger read the tail without a lock, so calls committing inside the same few hundred milliseconds chained onto the same row and the loser was orphaned. This row forks off id '
       || (select a.id from public.audit_log a where a.row_hash = w.prev_hash)::text
       || ', which is a real row on the genuine chain, and it recomputes its own hash from its own payload, so no content was altered. Root cause and the before/after concurrency proof are in migration 20260928a_chain_serialization. These rows are append-only by trigger and cannot be repaired, so the break is registered here instead of being hidden or erased.',
       'Waqas Nafees, Safety Lab Aero'
from w
where coalesce(w.prev_hash,'') is distinct from coalesce(w.prior_row_hash,'')
  and w.ts < timestamptz '2026-09-28 01:00:00+00'
  and exists (select 1 from public.audit_log a where a.row_hash = w.prev_hash)
  and w.row_hash = encode(digest(
        coalesce(w.prev_hash,'') || coalesce((select a.user_id::text from public.audit_log a where a.id=w.id),'')
        || coalesce((select a.feature   from public.audit_log a where a.id=w.id),'')
        || coalesce((select a.model     from public.audit_log a where a.id=w.id),'')
        || coalesce((select a.tokens_in::text  from public.audit_log a where a.id=w.id),'')
        || coalesce((select a.tokens_out::text from public.audit_log a where a.id=w.id),'')
        || coalesce(w.ts::text,''), 'sha256'), 'hex');

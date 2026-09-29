-- ============================================================================
-- 20260929a_acknowledged_chain_breaks.sql — registered, explained chain breaks
--
-- WHY. 20260928a stops the hash chains forking. It cannot repair the forks that
-- already happened: audit_log forked ELEVEN times between 00:00:44 and 00:47:13
-- UTC on 28 Sep 2026 during the Q12-Q14 eval, because the chain trigger read the
-- tail without a lock. The rows are append-only by trigger, so there is no
-- UPDATE or DELETE that could stitch them back together, and there should not be.
--
-- (The register said ONE break. It said one because the old verifier exited at
-- the first mismatch and never looked past id 15. A check that stops early reads
-- as less damage than there is. Same failure mode as the empty mirror tree
-- clearing its objective, and the same lesson as SL-WP-0010 section 9.)
--
-- THE CHOICE. Either re-genesis the chain and throw the history away, or teach
-- the verifier to carry on across a break that a human has registered, with a
-- reason, in a table of its own. This does the second.
--
-- WHAT A REGISTERED BREAK IS ALLOWED TO DO. Exactly one discontinuity, at one
-- id, between two rows whose hashes were both recorded at registration time.
-- It does not weaken anything else:
--
--   * Every row is still recomputed from its own payload. A registered break
--     buys no immunity for the row it sits on; editing that row still fails.
--   * The break is pinned on BOTH sides. Before walking, the verifier checks
--     that each registration still describes real rows: the break row must
--     still carry the registered prev_hash and the row before it must still
--     carry the registered row_hash. Without that check, the row that LOST a
--     race is unprotected, because nothing chains onto it and deleting it
--     leaves a chain that reads as continuous. That case was found by the
--     mutation tests, not by reasoning, and this is the fix for it.
--   * An UNREGISTERED break still fails the whole chain, first_bad_id and all.
--     That is the property the seal exists for and it is unchanged.
--
-- WHO CAN REGISTER ONE. Nobody at runtime. public.chain_breaks has RLS on, no
-- policies, and no grants to anon, authenticated or service_role. Rows go in
-- through a migration, so a registered break is a code-reviewed act with a name
-- attached, not a button.
--
-- AND IT IS VISIBLE. verify_* now returns segments and acknowledged alongside
-- ok, and run_chain_verification records them. A chain with ok = true and
-- segments = 12 reads as "sound, and eleven things happened here" rather than
-- as "clean", which is the honest state of this ledger.
--
-- MUTATION-PROVED on the throwaway project before production, ten for ten:
--   unregistered fork FAILS                     registered fork PASSES (2 segs)
--   edit payload of the break row FAILS         a second unregistered fork FAILS
--   delete the orphaned row before it FAILS     payload edit inside a segment FAILS
--   registration naming a wrong prev_hash FAILS registration naming a wrong
--   delete the break row itself FAILS             prior row FAILS
--   delete a normal row mid-chain FAILS
-- And on production, read-only and rolled back: removing one registration put
-- the chain straight back to ok = false at that id.
--
-- NOTE ON SCOPE. The hash still covers prev_hash, user_id, feature, model,
-- tokens_in, tokens_out and ts. It does NOT cover itar, ok, error, weighted_cost
-- or latency_ms, so someone with database access could flip the export-control
-- flag and the seal would still read clean. Widening it invalidates every
-- existing row. That USED to mean now-or-never; with registered breaks it no
-- longer does, because a widening is just another registered boundary with a
-- recorded reason. Left as a separate decision. See OPEN_ITEMS SEC-0d.
-- ============================================================================

create table if not exists public.chain_breaks (
  id              bigserial primary key,
  chain           text        not null,
  scope           text        not null default '',   -- project_id for per-project chains
  break_at_id     bigint      not null,              -- the row whose prev_hash does not follow
  break_prev_hash text        not null,              -- the prev_hash that row actually carries
  prior_id        bigint,                            -- the row immediately before it
  prior_row_hash  text,                              -- that row's row_hash at registration time
  reason          text        not null,
  acknowledged_by text        not null,
  ts              timestamptz not null default now()
);

create unique index if not exists chain_breaks_uniq
  on public.chain_breaks (chain, scope, break_at_id);

alter table public.chain_breaks enable row level security;
revoke all on public.chain_breaks from public, anon, authenticated, service_role;
revoke all on sequence public.chain_breaks_id_seq from public, anon, authenticated, service_role;

comment on table public.chain_breaks is
  'Registered, explained discontinuities in the append-only hash chains. RLS on with no policies and no runtime grants: rows are added by migration only. An unregistered break still fails verification.';

alter table public.chain_verifications add column if not exists segments     bigint;
alter table public.chain_verifications add column if not exists acknowledged bigint;

-- ------------------------------------------------------ verify_audit_chain
drop function if exists private.verify_audit_chain();
create function private.verify_audit_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint, segments bigint, acknowledged bigint)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  r record; b record;
  expected_prev text := ''; prev_id bigint := null; computed text;
  bad bigint := null; cnt bigint := 0; segs bigint := 1; ack bigint := 0;
begin
  -- Every registration must still describe the rows it was registered against.
  for b in select * from public.chain_breaks where chain = 'audit_log' and scope = '' loop
    if not exists (select 1 from public.audit_log a
                    where a.id = b.break_at_id and coalesce(a.prev_hash,'') = b.break_prev_hash) then
      return query select false, b.break_at_id, 0::bigint, 0::bigint, 0::bigint; return;
    end if;
    if b.prior_id is not null and not exists (select 1 from public.audit_log a
                    where a.id = b.prior_id and a.row_hash = coalesce(b.prior_row_hash,'')) then
      return query select false, b.prior_id, 0::bigint, 0::bigint, 0::bigint; return;
    end if;
  end loop;

  for r in select * from public.audit_log order by id asc loop
    cnt := cnt + 1;
    if coalesce(r.prev_hash,'') is distinct from expected_prev then
      select * into b from public.chain_breaks
       where chain = 'audit_log' and scope = ''
         and break_at_id = r.id
         and break_prev_hash = coalesce(r.prev_hash,'')
         and prior_id is not distinct from prev_id
         and coalesce(prior_row_hash,'') = expected_prev;
      if not found then bad := r.id; exit; end if;
      segs := segs + 1; ack := ack + 1;
    end if;
    computed := encode(digest(
        coalesce(r.prev_hash,'') || coalesce(r.user_id::text,'') || coalesce(r.feature,'')
        || coalesce(r.model,'') || coalesce(r.tokens_in::text,'') || coalesce(r.tokens_out::text,'')
        || coalesce(r.ts::text,''), 'sha256'), 'hex');
    if computed is distinct from r.row_hash then bad := r.id; exit; end if;
    expected_prev := r.row_hash; prev_id := r.id;
  end loop;
  return query select (bad is null), bad, cnt, segs, ack;
end $function$;

-- ---------------------------------------------------- verify_signoff_chain
drop function if exists private.verify_signoff_chain();
create function private.verify_signoff_chain()
returns table(ok boolean, first_bad_id bigint, checked bigint, segments bigint, acknowledged bigint)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  r record; b record;
  expected_prev text := ''; prev_id bigint := null; computed text;
  bad bigint := null; cnt bigint := 0; segs bigint := 1; ack bigint := 0;
begin
  for b in select * from public.chain_breaks where chain = 'signoffs' and scope = '' loop
    if not exists (select 1 from public.signoffs s
                    where s.id = b.break_at_id and coalesce(s.prev_hash,'') = b.break_prev_hash) then
      return query select false, b.break_at_id, 0::bigint, 0::bigint, 0::bigint; return;
    end if;
    if b.prior_id is not null and not exists (select 1 from public.signoffs s
                    where s.id = b.prior_id and s.row_hash = coalesce(b.prior_row_hash,'')) then
      return query select false, b.prior_id, 0::bigint, 0::bigint, 0::bigint; return;
    end if;
  end loop;

  for r in select * from public.signoffs order by id asc loop
    cnt := cnt + 1;
    if coalesce(r.prev_hash,'') is distinct from expected_prev then
      select * into b from public.chain_breaks
       where chain = 'signoffs' and scope = ''
         and break_at_id = r.id
         and break_prev_hash = coalesce(r.prev_hash,'')
         and prior_id is not distinct from prev_id
         and coalesce(prior_row_hash,'') = expected_prev;
      if not found then bad := r.id; exit; end if;
      segs := segs + 1; ack := ack + 1;
    end if;
    computed := encode(digest(
        coalesce(r.prev_hash,'') || coalesce(r.project_id::text,'') || coalesce(r.baseline_sha256,'')
        || coalesce(r.signer_user_id::text,'') || coalesce(r.signer_email,'') || coalesce(r.role_at_signing,'')
        || coalesce(r.decision,'') || coalesce(r.meaning,'') || coalesce(r.ts::text,''), 'sha256'), 'hex');
    if computed is distinct from r.row_hash then bad := r.id; exit; end if;
    expected_prev := r.row_hash; prev_id := r.id;
  end loop;
  return query select (bad is null), bad, cnt, segs, ack;
end $function$;

-- ------------------------------------------------- run_chain_verification
create or replace function private.run_chain_verification(p_ran_by text default 'schedule'::text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare v record;
begin
  for v in select 'audit_log'::text as chain, a.ok, a.first_bad_id, a.checked, a.segments, a.acknowledged
             from private.verify_audit_chain() a
           union all
           select 'signoffs'::text as chain, s.ok, s.first_bad_id, s.checked, s.segments, s.acknowledged
             from private.verify_signoff_chain() s
  loop
    insert into public.chain_verifications (chain, ok, first_bad_id, checked, segments, acknowledged, ran_by)
    values (v.chain, v.ok, v.first_bad_id, v.checked, v.segments, v.acknowledged, coalesce(p_ran_by, 'schedule'));
  end loop;
end $function$;

-- =============================================================================
-- Safety Lab Aero — Review status auto-rollup + sign-off chain verifier (#15)
-- Project: fhrqkhdrwbfnizkepch  ·  [Collab / Cert-Controls]
--
-- A. A trigger that derives reviews.status from its assignment decisions, so a
--    reviewer's approval advances the review without an editor flipping it by hand
--    (reviewers can't update reviews directly under RLS — this runs SECURITY DEFINER).
-- B. verify_signoff_chain(): recomputes the append-only sign-off ledger end-to-end
--    (content hash + prev-link) and returns whether it is intact. Returns only
--    booleans/ids — no row content — so it is safe to expose to authenticated users.
-- Idempotent.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---- A. Review status auto-rollup -------------------------------------------
create or replace function public.review_status_rollup()
  returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  rid uuid;
  cur_status text;
  n_reviewers int; n_rev_ok int; n_approvers int; n_app_ok int; n_rejected int;
  next_status text;
begin
  rid := coalesce(new.review_id, old.review_id);
  select status into cur_status from public.reviews where id = rid;
  if cur_status is null then return coalesce(new, old); end if;
  -- Only manage the active states; never override draft/released/rejected/withdrawn.
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
end $$;

drop trigger if exists trg_review_rollup on public.review_assignments;
create trigger trg_review_rollup after insert or update or delete on public.review_assignments
  for each row execute function public.review_status_rollup();

revoke execute on function public.review_status_rollup() from anon, authenticated, public;

-- ---- B. Sign-off chain verifier ---------------------------------------------
-- Recomputes each row's hash exactly as signoffs_chain() did, and checks the
-- prev-link. Returns (ok, first_bad_id, checked). Reads all rows as definer but
-- returns no content, so exposing it to authenticated users leaks nothing.
create or replace function public.verify_signoff_chain()
  returns table(ok boolean, first_bad_id bigint, checked bigint)
  language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
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
end $$;

revoke execute on function public.verify_signoff_chain() from anon, public;
grant  execute on function public.verify_signoff_chain() to authenticated, service_role;

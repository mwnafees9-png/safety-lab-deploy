-- ============================================================================
-- 31 Aug 2026 — MAKE THE INVITE BUTTON REAL.
--
-- Reported by Waqas as "invite button is not working". It was not broken; the
-- feature was three-quarters missing. inviteWorkspaceMember() inserted a row
-- into public.invitations and stopped. Censused before writing a line: the
-- table is WRITTEN in exactly one place in the client and READ NOWHERE, there
-- is no invite edge function (only notify-signup/feedback/signin/review/expiry
-- + stripe-webhook), and no token/redemption path exists anywhere. The button
-- wrote a row into a table nothing consumed, under a success message that said
-- "Invitation recorded ... (Email delivery via Resend ships in the next
-- update.)" — reassuring grey text a user reads as "sent".
--
-- THIS FILE ADDS THE REDEMPTION HALF. Two objects, both additive:
--   public.accept_invitation(p_token text)  — the join, done server-side
--   public.pending_invitations(p_workspace) — what an admin has outstanding
--
-- WHY REDEMPTION CANNOT BE DONE CLIENT-SIDE. invitations RLS is admin-only for
-- SELECT (invitations_admin_read -> private.can_admin_workspace). An invitee is
-- BY DEFINITION not yet a member, so they cannot read the row naming their own
-- invitation, and no client-side flow can ever work. It must be SECURITY
-- DEFINER. That in turn makes the function the whole security boundary, so:
--
--   [1] THE EMAIL MUST MATCH THE CALLER. A bearer token is a secret in a URL —
--       it lands in mail clients, proxies, browser history and paste buffers.
--       Without this check a leaked token is workspace access for whoever finds
--       it. The invitation is to a PERSON, so the caller must be signed in as
--       that address. Compared case-insensitively (lower(email)) because
--       mail addresses are matched case-insensitively in practice and the
--       inviter types free text.
--   [2] EXPIRY AND SINGLE-USE ARE ENFORCED HERE, not in the caller. expires_at
--       defaults to 14 days; accepted_at makes it single-use.
--   [3] IDEMPOTENT. Clicking the link twice, or being added by hand in the
--       meantime, must not error and must not downgrade an existing role — a
--       stale 'viewer' invite must never demote an admin. Existing membership
--       is left EXACTLY as it is and reported as 'already_member'.
--   [4] NO ROLE ESCALATION. The role is read from the invitation row, never
--       from an argument, and is whitelisted again here — an admin-only column
--       is not a safe input just because RLS guarded the insert.
--   [5] search_path is pinned; SECURITY DEFINER without it is the standard
--       privilege-escalation footgun.
--
-- LIVE-VERIFIED against production 31 Aug 2026: wrong_account (invite issued to
-- someone else), expired, invalid token, already_member (owner NOT downgraded to
-- the invitation's viewer), and single-use replay -> already_used. The pending
-- list returns no token column.
--
-- The function returns a STATUS rather than raising for the ordinary refusals
-- (bad/expired/used token, wrong account), because those are things a human
-- needs explained on screen, not a 500. It raises only for a caller with no
-- session at all, which is a programming error in the client.
-- ============================================================================

create or replace function public.accept_invitation(p_token text)
returns table (status text, workspace_id uuid, workspace_name text, role text, invited_email text)
language plpgsql
security definer
set search_path to 'public'
as $$
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

  -- Wrong account is reported BEFORE expiry/used, because it is the one the
  -- user can actually fix (sign out, sign in as the invited address) and the
  -- screen needs to name the address the invite was issued to.
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

  -- TABLE-QUALIFIED (wm.role). Unqualified `role` collided with the RETURNS
  -- TABLE out-parameter of the same name and raised "column reference \"role\"
  -- is ambiguous" at runtime — in the ALREADY-MEMBER branch, i.e. exactly the
  -- guard that stops a stale viewer invitation demoting an existing admin.
  -- Found by calling the RPC against production, not by reading the SQL.
  -- Shipped as 20260831 invitation_accept_rpc_fix_ambiguous_role.
  select wm.role into v_existing
    from public.workspace_members wm
   where wm.workspace_id = v_inv.workspace_id and wm.user_id = v_uid;

  if v_existing is not null then
    -- [3] Never downgrade. Burn the invitation so it cannot be replayed.
    update public.invitations i set accepted_at = now() where i.id = v_inv.id;
    return query select 'already_member'::text, v_inv.workspace_id, v_ws.name, v_existing, v_inv.email; return;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, v_uid, v_inv.role);

  update public.invitations i set accepted_at = now() where i.id = v_inv.id;

  return query select 'joined'::text, v_inv.workspace_id, v_ws.name, v_inv.role, v_inv.email;
end;
$$;

revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

comment on function public.accept_invitation(text) is
  'Redeem a workspace invitation token. SECURITY DEFINER because invitations RLS is admin-read-only and an invitee is not yet a member. Enforces email match, expiry, single use, role whitelist; never downgrades an existing membership.';

-- ---------------------------------------------------------------------------
-- What an admin has outstanding. RLS already restricts invitations to admins,
-- so this could be a plain select — it exists so the client has ONE shape to
-- render and so the token is never shipped to the browser. A pending-invite
-- list that leaks tokens to every admin's devtools is a credential broadcast.
-- ---------------------------------------------------------------------------
create or replace function public.pending_invitations(p_workspace uuid)
returns table (id uuid, email text, role text, created_at timestamptz, expires_at timestamptz, expired boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select i.id, i.email, i.role, i.created_at, i.expires_at, (i.expires_at <= now()) as expired
    from public.invitations i
   where i.workspace_id = p_workspace
     and i.accepted_at is null
     and private.can_admin_workspace(p_workspace)
   order by i.created_at desc;
$$;

revoke all on function public.pending_invitations(uuid) from public;
grant execute on function public.pending_invitations(uuid) to authenticated;

comment on function public.pending_invitations(uuid) is
  'Outstanding (unaccepted) invitations for a workspace, admin-gated, WITHOUT the token — the token is a credential and never leaves the server.';

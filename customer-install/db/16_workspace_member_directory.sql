-- The reviewer picker has always been empty (16 Sep 2026)
--
-- FOUND BY RUNNING IT. public.users carries exactly one read policy, users_self_read
-- (auth.uid() = id): you can see your own row and nobody else's. Four places in the client join
-- to users anyway, and the two that matter use an INNER join, so another member's row is not
-- merely blank, the member is dropped from the result entirely.
--
-- In the reviewer picker that means the list of people you could send a review to is ALWAYS
-- EMPTY, and submitReviewRequest then refuses with "Pick at least one reviewer or an approver".
-- Nobody has ever been able to request a review. Production agrees: reviews, review_comments and
-- signoffs are all ZERO across 591 projects and 45 users, and notify-review has never sent a
-- single email in the product's life. For a tool whose purpose is turning analysis into
-- certification evidence, the review and approval workflow is the product.
--
-- The other two call sites degrade quietly instead of blocking: the workspace members list shows
-- only you, and save/revision history and the reviews list render every other person's email as
-- a dash.
--
-- WHY NOT JUST WIDEN THE POLICY. Adding "you may read a user who shares a workspace with you"
-- fixes all four in one line, and also hands that right to every present and future query that
-- touches users, including ones written by someone who never knew the policy existed. These two
-- functions are the narrow version: emails go only to someone already inside the workspace, and
-- only for people in it. users_self_read is untouched.
--
-- Waqas chose this shape over the policy change on 16 Sep 2026.

begin;

-- Everyone in a workspace the caller belongs to. Fails CLOSED: workspace_role() is null for a
-- non-member, the predicate is false, and they get zero rows rather than an error to probe with.
create or replace function public.workspace_member_directory(p_workspace uuid)
returns table (id uuid, email text, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select u.id, u.email, wm.role, wm.joined_at
  from public.workspace_members wm
  join public.users u on u.id = wm.user_id
  where wm.workspace_id = p_workspace
    and private.workspace_role(p_workspace) is not null
  order by u.email;
$function$;

revoke execute on function public.workspace_member_directory(uuid) from public, anon;
grant  execute on function public.workspace_member_directory(uuid) to authenticated, service_role;

-- Attribution by id, for history rows and review lists. The same rule the other way round: an id
-- resolves to an email only if that person shares a workspace with the caller. Anyone else comes
-- back absent, and the UI already renders a dash for an id it cannot resolve.
create or replace function public.user_emails_for_ids(p_ids uuid[])
returns table (id uuid, email text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select u.id, u.email
  from public.users u
  where u.id = any(p_ids)
    and (u.id = auth.uid() or exists (
      select 1
      from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = auth.uid() and theirs.user_id = u.id));
$function$;

revoke execute on function public.user_emails_for_ids(uuid[]) from public, anon;
grant  execute on function public.user_emails_for_ids(uuid[]) to authenticated, service_role;

commit;

-- ---- PROVEN ON THE THROWAWAY PROJECT (yiisexbngnjakkqkmctw), 16 Sep 2026 -------------------
-- Under role `authenticated` with a real JWT: the directory returns 2 for a workspace the caller
-- is in and 0 for one they are not; an id that shares a workspace resolves, a stranger's does
-- not; and `select count(*) from public.users` still returns 1, so nothing was widened.
-- Then driven through the actual UI on the reference install: the picker listed a reviewer for
-- the first time, the form submitted, and reviews/review_assignments got their first ever rows.
-- PRODUCTION IS NOT TOUCHED BY THIS FILE.

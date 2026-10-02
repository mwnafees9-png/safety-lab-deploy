-- LOCAL-PROOF fixture: five people, one company workspace, three projects.
--   O owner, E editor, R reviewer, V viewer of workspace W; X belongs only to their own Personal.
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@co.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'editor@co.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'reviewer@co.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'viewer@co.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'outsider@else.test');
insert into public.workspaces(id, name, owner_id, is_personal)
  values ('11111111-1111-1111-1111-111111111111', 'Company', '00000000-0000-0000-0000-0000000000a1', false);
insert into public.workspace_members(workspace_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'editor'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a3', 'reviewer'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a4', 'viewer');
insert into public.projects(id, workspace_id, name, created_by) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Freighter', '00000000-0000-0000-0000-0000000000a1'),
  ('22222222-2222-2222-2222-22222222222a', '11111111-1111-1111-1111-111111111111', 'Archived one', '00000000-0000-0000-0000-0000000000a1');
update public.projects set deleted_at = now() where id = '22222222-2222-2222-2222-22222222222a';
insert into public.projects(id, workspace_id, name, created_by)
  select '33333333-3333-3333-3333-333333333333', w.id, 'Outsider project', '00000000-0000-0000-0000-0000000000a5'
  from public.workspaces w where w.owner_id = '00000000-0000-0000-0000-0000000000a5' and w.is_personal;
-- one message per topic under test, written by the superuser, so a receive check can see it
insert into realtime.messages(topic, extension) values
  ('slab-crdt:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222', 'broadcast'),
  ('slab-locks:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222', 'broadcast'),
  ('slab-presence:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222', 'presence'),
  ('slab-presence:11111111-1111-1111-1111-111111111111', 'presence'),
  ('slab-crdt:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-22222222222a', 'broadcast'),
  ('slab-crdt:11111111-1111-1111-1111-111111111111:33333333-3333-3333-3333-333333333333', 'broadcast'),
  ('labs-thread:AE-001', 'broadcast');
-- second-factor: the editor E has a verified factor, the viewer V an unverified one
insert into auth.mfa_factors(user_id, status) values
  ('00000000-0000-0000-0000-0000000000a2', 'verified'),
  ('00000000-0000-0000-0000-0000000000a4', 'unverified');
-- a review on the Freighter, R assigned as reviewer, O as approver; and one in X's workspace
insert into public.reviews(id, project_id, title, status, requested_by) values
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'PSSA review', 'in_review', '00000000-0000-0000-0000-0000000000a1'),
  ('44444444-4444-4444-4444-44444444444b', '33333333-3333-3333-3333-333333333333', 'Outsider review', 'in_review', '00000000-0000-0000-0000-0000000000a5');
insert into public.review_assignments(id, review_id, user_id, role) values
  ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-0000000000a3', 'reviewer'),
  ('55555555-5555-5555-5555-555555555552', '44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-0000000000a1', 'approver');
-- a second review on the same project, where the reviewer R is NOT assigned
insert into public.reviews(id, project_id, title, status, requested_by) values
  ('44444444-4444-4444-4444-44444444444c', '22222222-2222-2222-2222-222222222222', 'SSA review', 'in_review', '00000000-0000-0000-0000-0000000000a1');
-- a sign-off in the outsider's workspace, so a global count differs from a member's own count
insert into public.signoffs(review_id, project_id, baseline_sha256, signer_user_id, signer_email, role_at_signing, decision)
  values ('44444444-4444-4444-4444-44444444444b', '33333333-3333-3333-3333-333333333333', 'xyz', '00000000-0000-0000-0000-0000000000a5', 'outsider@else.test', 'reviewer', 'approve');
insert into public.invitations(workspace_id, email, role, token, invited_by)
  values ('11111111-1111-1111-1111-111111111111', 'outsider@else.test', 'viewer', 'tok-123', '00000000-0000-0000-0000-0000000000a1');

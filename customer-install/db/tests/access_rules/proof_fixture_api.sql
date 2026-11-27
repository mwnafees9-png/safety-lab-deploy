-- LOCAL-PROOF fixture for the API tables (27 Nov 2026), on top of proof_fixture.sql.
--   C1: an API client of the Company workspace, with a functions collection K1 on the Freighter (two items, one removed)
--   C2: an API client of the outsider's Personal workspace, with a collection on the outsider's project
--   PV: a personal key of the viewer V
insert into public.api_clients(id, workspace_id, kind, name, client_id, secret_hash, can_send, created_by) values
  ('66666666-6666-6666-6666-666666666661', '11111111-1111-1111-1111-111111111111', 'client', 'In-house tool', 'slc_fixture0000000000000001',
   encode(sha256(convert_to('sls_fixture_secret_one', 'UTF8')), 'hex'), true, '00000000-0000-0000-0000-0000000000a1');
insert into public.api_clients(id, workspace_id, kind, name, client_id, secret_hash, can_send, created_by)
  select '66666666-6666-6666-6666-666666666662', w.id, 'client', 'Outsider tool', 'slc_fixture0000000000000002',
         encode(sha256(convert_to('sls_fixture_secret_two', 'UTF8')), 'hex'), true, '00000000-0000-0000-0000-0000000000a5'
    from public.workspaces w where w.owner_id = '00000000-0000-0000-0000-0000000000a5' and w.is_personal;
insert into public.api_clients(id, workspace_id, kind, name, client_id, secret_hash, can_send, user_id, created_by) values
  ('66666666-6666-6666-6666-666666666663', '11111111-1111-1111-1111-111111111111', 'personal', 'Viewer script', 'slk_fixture_v',
   encode(sha256(convert_to('slk_fixture_viewer_key', 'UTF8')), 'hex'), false, '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a4');
insert into public.api_collections(id, project_id, client, name, kind, title) values
  ('77777777-7777-7777-7777-777777777771', '22222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666661', 'functions', 'functions', 'Functions'),
  ('77777777-7777-7777-7777-777777777772', '33333333-3333-3333-3333-333333333333', '66666666-6666-6666-6666-666666666662', 'reqs', 'requirements', 'Requirements');
insert into public.api_items(collection, item_id, key, name, body, sort) values
  ('77777777-7777-7777-7777-777777777771', 'a', 'F-1', 'Provide thrust', 'Thrust on demand', 1),
  ('77777777-7777-7777-7777-777777777771', 'b', 'F-2', 'Decelerate', 'On the ground', 2),
  ('77777777-7777-7777-7777-777777777772', 'x', 'R-1', 'Outsider requirement', '', 1);
update public.api_items set removed_at = now() where collection = '77777777-7777-7777-7777-777777777771' and item_id = 'b';

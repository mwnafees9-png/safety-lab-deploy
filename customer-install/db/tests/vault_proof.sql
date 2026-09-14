\set ON_ERROR_STOP on
insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222') on conflict do nothing;

-- ===== USER A saves + manages her own secret through the functions =====
begin;
  set local role authenticated;
  select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  select public.save_secret('jama_token','TOKEN-AAA','{"user":"ada","baseUrl":"https://acme.jamacloud.com"}');
  do $$ begin raise notice 'A save_secret — OK'; end $$;
  -- A cannot touch the table directly (no grant)
  do $$ declare n int; begin
    begin execute 'select count(*) from public.user_secrets' into n; raise exception 'FAIL: A read % table row(s)', n;
    exception when insufficient_privilege then raise notice 'A has NO direct table read (permission denied) — OK'; end;
  end $$;
  do $$ declare n int; begin
    begin execute 'insert into public.user_secrets(user_id,kind,secret) values (auth.uid(),''voyage_key'',''X'')'; raise exception 'FAIL: A wrote the table directly';
    exception when insufficient_privilege then raise notice 'A has NO direct table write (permission denied) — OK'; end;
  end $$;
  -- A lists status (no secret) via the function
  do $$ declare r record; begin
    select kind, meta->>'user' u into r from public.my_secrets_status() limit 1;
    if r.kind='jama_token' and r.u='ada' then raise notice 'A my_secrets_status returns kind+meta, no value — OK'; else raise exception 'FAIL status %', r; end if;
  end $$;
  select public.save_secret('jama_token','TOKEN-AAA2','{"user":"ada"}');   -- update path (on-conflict inside definer)
  select public.save_secret('anthropic_key','sk-ant-XXXX','{"last4":"XXXX"}');
  do $$ declare n int; begin select count(*) into n from public.my_secrets_status(); if n=2 then raise notice 'A now has 2 saved kinds — OK'; else raise exception 'FAIL count %',n; end if; end $$;
commit;

-- ===== USER B cannot read, list, or overwrite A's secrets =====
begin;
  set local role authenticated;
  select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  do $$ declare n int; begin select count(*) into n from public.my_secrets_status(); if n=0 then raise notice 'B sees 0 of A''s secrets — OK'; else raise exception 'FAIL B saw %',n; end if; end $$;
  -- B saving 'jama_token' writes B's OWN row, never touches A's
  select public.save_secret('jama_token','TOKEN-BBB','{}');
  commit;
begin;
  set local role service_role;
  do $$ declare a text; b text; begin
    select secret into a from public.user_secrets where user_id='11111111-1111-1111-1111-111111111111' and kind='jama_token';
    select secret into b from public.user_secrets where user_id='22222222-2222-2222-2222-222222222222' and kind='jama_token';
    if a='TOKEN-AAA2' and b='TOKEN-BBB' then raise notice 'A''s secret intact after B saved her own (A=%, B=%) — OK', a, b; else raise exception 'FAIL cross-write a=% b=%', a, b; end if;
  end $$;
commit;

-- ===== A deletes one of her own; server confirms =====
begin;
  set local role authenticated;
  select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  select public.delete_secret('anthropic_key');
  do $$ declare n int; begin select count(*) into n from public.my_secrets_status(); if n=1 then raise notice 'A deleted one; 1 left — OK'; else raise exception 'FAIL after delete %',n; end if; end $$;
commit;
select 'ALL VAULT RLS CHECKS PASSED' as result;

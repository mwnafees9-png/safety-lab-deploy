-- 20261106b_mark_university_domain.sql (6 Nov 2026, Waqas: "make sure we have all universities comped at the student
-- tier"). When both lists still miss a school, one call fixes it for everyone: the domain goes on public.university_domains
-- (so every future sign-up from it is comped) and every student-tier account already on it, or on an address under it,
-- becomes academic with no expiry. Service role only (the owner, or Claude on his say-so); never callable from the app.
-- Returns how many existing accounts it comped.
begin;

create or replace function public.mark_university_domain(p_domain text, p_note text default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
    d text := lower(trim(both '.' from trim(coalesce(p_domain, ''))));
    n integer;
begin
    if d !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then
        raise exception 'not a domain: %', p_domain;
    end if;
    insert into public.university_domains (domain, source)
    values (d, coalesce(nullif(trim(p_note), ''), 'marked by the owner ' || to_char(now(), 'YYYY-MM-DD')))
    on conflict (domain) do nothing;
    update public.users
       set academic = true, trial_ends_at = null
     where tier = 'edu'
       and (lower(split_part(email, '@', 2)) = d or lower(split_part(email, '@', 2)) like '%.' || d)
       and (not academic or trial_ends_at is not null);
    get diagnostics n = row_count;
    return n;
end $function$;
revoke all on function public.mark_university_domain(text, text) from public, anon, authenticated;

commit;

-- Read-only catalog queries used to capture production structure (6 Sep 2026).
-- Re-run any of these via the Supabase MCP (execute_sql) to regenerate the JSON
-- captures. They read STRUCTURE ONLY -- no table data.

-- columns.json
select c.table_name, c.ordinal_position, c.column_name, c.data_type, c.udt_name,
       c.is_nullable, c.column_default, c.character_maximum_length, c.is_identity, c.identity_generation
from information_schema.columns c
where c.table_schema='public' order by c.table_name, c.ordinal_position;

-- functions.json
select n.nspname as schema, p.proname as name,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer, l.lanname as lang, p.provolatile as volatility
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
where n.nspname in ('public','private') order by 1,2;
-- (for full bodies: select pg_get_functiondef(p.oid) ...)

-- policies.json
select schemaname||'.'||tablename as tbl, policyname, cmd, roles::text
from pg_policies where schemaname in ('public','private') order by 1,2;

-- constraints.json
select conrelid::regclass::text as tbl, conname,
  case contype when 'p' then 'PK' when 'f' then 'FK' when 'u' then 'UNIQUE' when 'c' then 'CHECK' end as kind,
  pg_get_constraintdef(oid) as def
from pg_constraint where connamespace='public'::regnamespace order by 1,3,2;

-- indexes.json
select schemaname||'.'||tablename as tbl, indexname, indexdef
from pg_indexes where schemaname in ('public','private')
and indexname not like '%_pkey' and indexname not like '%_key' order by 1,2;

-- triggers.json
select event_object_schema||'.'||event_object_table as tbl, trigger_name,
       string_agg(event_manipulation,',') as events, action_timing
from information_schema.triggers where trigger_schema in ('public','private')
group by 1,2,action_timing order by 1,2;

# Safety Lab Aero — database install

This builds the Safety Lab Aero database on **your own** Postgres (a Supabase
project in your own account, or your own Postgres server). No data ever touches
Safety Lab's cloud.

## What you need
- A Postgres database you control. The easiest is a free/managed **Supabase**
  project in your own organization (it provides the auth + realtime the app uses).
- The database connection string (Supabase: Project Settings → Database → Connection string).

## Install
```
./apply.sh "postgresql://postgres:PASSWORD@db.YOURREF.supabase.co:5432/postgres"
```
This runs four files in order:
1. `00_schema_baseline.sql` — the whole schema (tables, security rules, functions).
2. `01_..._cannot_mint_owner.sql` — membership hardening.
3. `02_drop_hardcoded_platform_admins.sql` — admin list lives in a table you own (starts EMPTY).
4. `03_collab_field_edit_locks.sql` — live co-editing locks.

## After install
Make yourself an administrator:
```sql
insert into private.platform_admins(email) values ('you@yourcompany.com');
```
That's it for the database. Point the app and the AI proxy at it next (see the
deployment guide).

# Server-side secret vault (S8) — design & build state

**Why.** Users' AI keys and Jama API token were kept in browser localStorage — persistent, readable by any XSS. Move them onto the customer's own database, write-only from the client, server reads them to use them. Waqas ruled 14 Sep: vault BOTH Jama and AI keys; prove on local Postgres, then a throwaway Supabase.

**The model (proven).** `public.user_secrets(user_id, kind, secret, meta, updated_at)`, RLS on, and:
- The client has NO direct privilege on the table — cannot select, insert, update or delete it.
- The client writes ONLY through SECURITY DEFINER functions pinned to `auth.uid()`: `save_secret(kind, secret, meta)`, `delete_secret(kind)`.
- The client lists ONLY `my_secrets_status()` → kind + non-secret meta + updated_at. Never a value.
- `service_role` (the AI proxy, the Jama bridge) reads the value server-side.
So no client, not even the owner, can read a secret back. Portable plain-Postgres DDL (no Supabase-only extensions) → identical hosted and customer-hosted. Value is plaintext-in-column, protected by RLS-no-client-access + DB encryption at rest; pgcrypto/Vault column encryption is a later hardening.

**Proven (local Postgres 16, proof2.sql).** save via function OK; no direct table read/write (permission denied); status returns kind+meta not value; user B sees 0 of A's secrets and saving her own never touches A's; delete own OK; server (service_role) reads the live value. ALL CHECKS PASSED.

## Phases
- [x] **1. Schema + access model** — `07_user_secrets_vault.sql`, proven on local Postgres. NOT applied to any live DB yet.
- [x] **2. Real-auth proof on a throwaway Supabase** — DONE 14 Sep on the existing throwaway yiisexbngnjakkqkmctw (safety-lab-staging-stage3): migration applied, all vault checks passed with REAL authenticated/service_role roles and real auth.uid() (save/delete via functions, no raw table read/write, status hides the value, cross-user isolation, service_role reads). Test rows cleaned up.
- [ ] **3. App write path** (safety-lab-deploy) — AI-key entry (bindings_modules) and Jama connect (live_bridge) call `save_secret`/`delete_secret`/`my_secrets_status` instead of localStorage; UI shows "saved" from status. Fallbacks: browser-only door → local secure store; desktop → OS keychain (with S26).
- [ ] **4. Server read path** — Jama bridge (worker.js) reads the user's `jama_token` via service_role using the caller's JWT, builds the Basic auth server-side (browser stops sending it). AI proxy (safety-lab-proxy-deploy) authenticates the user and reads their AI key from the vault for the BYO path.
- [ ] **5. customer-install kit + prod** — ship `07_user_secrets_vault.sql` in customer-install/db and apply to prod, staging-proven first.
- [ ] **6. Tests** across the write path, the bridge, and the proxy.

Files: `07_user_secrets_vault.sql` (the migration, portable), `stubs.sql` (Supabase-shaped stubs for the local proof: roles, auth schema, auth.uid), `proof2.sql` (the RLS/functions proof).

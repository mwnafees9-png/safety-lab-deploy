#!/usr/bin/env node
/*
 * Regression — SEC-0b: the workspace activity log records what happens in a workspace (18 Oct 2026).
 *
 * public.workspace_audit had 0 rows in the product's whole life (production, read-only, 18 Oct 2026).
 * 20261018b_workspace_audit_events.sql makes the database record sign-ins, membership and role changes,
 * invitations and the project lifecycle itself. 20261018c captures a production grant the kit lacked
 * (found by the same proof: account erasure failed on a kit-built database).
 *
 * The behaviour is proven on a real Postgres built from the customer kit:
 *   customer-install/db/tests/access_rules/run_proof.sh checks_audit.txt      (32 checks)
 *   customer-install/db/tests/access_rules/run_audit_mutations.sh              (11 mutations, all red)
 * This file is the wall's guard on the files themselves, so a later edit cannot quietly undo them.
 *
 * Run: node tests/regression_workspace_audit_events_20261018.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const R = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = s => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const M = R('supabase/migrations/20261018b_workspace_audit_events.sql');
const K = R('customer-install/db/23_workspace_audit_events.sql');
const MC = R('supabase/migrations/20261018c_private_schema_usage_capture.sql');
const KC = R('customer-install/db/24_private_schema_usage.sql');
const APPLY = R('customer-install/db/apply.sh');

console.log('\n[1] what the database records');
for (const [ev, table] of [['user.signed_in', 'auth.users'], ['workspace.created', 'public.workspaces'], ['workspace.ownership_transferred', 'public.workspaces'],
  ['member.added', 'public.workspace_members'], ['member.role_changed', 'public.workspace_members'], ['member.removed', 'public.workspace_members'],
  ['invitation.sent', 'public.invitations'], ['invitation.accepted', 'public.invitations'], ['invitation.revoked', 'public.invitations'],
  ['project.created', 'public.projects'], ['project.archived', 'public.projects'], ['project.restored', 'public.projects'], ['project.erased', 'public.projects']])
  check(ev + ' is written', M.includes("'" + ev + "'"));
for (const t of ['public.workspaces', 'public.workspace_members', 'public.invitations', 'public.projects'])
  check('a trigger on ' + t, new RegExp('create or replace trigger ws_audit_\\w+ after [^;]+ on ' + t.replace('.', '\\.') + '\\s+for each row').test(M));
check('sign-ins: a trigger on auth.users, only when the stamp really changes', /after update of last_sign_in_at on auth\.users for each row '\s*\n?\s*\|\| 'when \(new\.last_sign_in_at is distinct from old\.last_sign_in_at\)/.test(M));
check('...created only where auth.users has the stamp (a plain Postgres kit build does not)', /if exists \(select 1 from information_schema\.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'last_sign_in_at'\)/.test(M));

console.log('\n[2] the writer');
const W = M.slice(M.indexOf('create or replace function private.ws_audit_write'), M.indexOf('revoke execute on function private.ws_audit_write'));
check('one writer, a definer function with an empty search path', /security definer\s+set search_path to ''/.test(W));
check('a failed audit write never fails the action it records (16 Sep rule)', /exception when others then\s+raise warning 'workspace_audit: % on % not recorded/.test(W));
check('nothing is written for a workspace that is being deleted', /if not exists \(select 1 from public\.workspaces w where w\.id = p_ws\) then return; end if;/.test(W));
check('rows the database writes say source database', W.includes("jsonb_build_object('source', 'database')"));
check('rows the app reports say source app', /jsonb_build_object\('source', 'app'\)\);\s*end \$function\$;/.test(M));
check('the writer and the trigger functions cannot be called by anyone', /revoke execute on function private\.ws_audit_write\(uuid, text, uuid, jsonb, uuid\) from public, anon, authenticated;/.test(M)
  && ['tg_ws_audit_workspaces', 'tg_ws_audit_members', 'tg_ws_audit_invitations', 'tg_ws_audit_projects', 'tg_ws_audit_signin'].every(f => new RegExp('revoke execute on function private\\.' + f + '\\(\\)\\s+from public, anon, authenticated;').test(M)));

console.log('\n[3] who reads it, who writes it');
check('owners and admins read the workspace, each person their own rows', /alter policy ws_audit_admin_read on public\.workspace_audit to authenticated\s+using \(private\.can_admin_workspace\(workspace_id\) or user_id = \(select auth\.uid\(\)\)\);/.test(M));
check('the every-member policy becomes it (renamed, never dropped: the read rule is never absent)', /alter policy ws_audit_member_read on public\.workspace_audit rename to ws_audit_admin_read;/.test(M) && !/create policy ws_audit_member_read/.test(M) && !/drop policy/.test(M));
check('no direct writes: insert and select revoked from anon, insert from authenticated', /revoke insert, select on public\.workspace_audit from anon;/.test(M) && /revoke insert on public\.workspace_audit from authenticated;/.test(M));

console.log('\n[4] append-only, except when the workspace itself is deleted');
const IMM = M.slice(M.indexOf('create or replace function private.audit_immutable'));
check('a workspace_audit row may go only when its workspace is already gone, and it is noted', /if tg_op = 'DELETE' and tg_table_name = 'workspace_audit'\s+and not exists \(select 1 from public\.workspaces w where w\.id = old\.workspace_id\) then\s+perform private\.record_maintenance\(tg_table_name::text, 'DELETE \(workspace deleted\)', old\.id::text\);\s+return old;/.test(IMM));
check('everything else is still refused', /raise exception 'audit records are append-only: % on % is not permitted', tg_op, tg_table_name\s+using errcode = 'insufficient_privilege';/.test(IMM));
check('the maintenance switch is unchanged', /if coalesce\(current_setting\('app\.allow_audit_maintenance', true\), 'off'\) = 'on' then/.test(IMM));

console.log('\n[5] the customer kit');
check('23_ is the twin of 20261018b', strip(M.slice(M.indexOf('-- ---- the one writer'))) === strip(K.slice(K.indexOf('-- ---- the one writer'))));
check('24_ is the twin of 20261018c (USAGE on private, as production has it)', strip(MC) === strip(KC) && /grant usage on schema private to authenticated, anon, service_role;/.test(KC));
check('apply.sh runs 22, 23, 24 in order after 21', /21_version_archive_prune_cheap 22_self_serve_project_erasure 23_workspace_audit_events 24_private_schema_usage[ ;]/.test(APPLY));
const CH = R('customer-install/db/tests/access_rules/checks_audit.txt');
check('the database proof covers every event, the read rule, the grants, append-only, a failed write and erasure',
  ['workspace.created', 'member.role_changed', 'member.removed', 'ownership_transferred', 'invitation.sent', 'invitation.accepted', 'invitation.revoked', 'project.created', 'project.archived', 'project.restored', 'project.erased', 'user.signed_in',
    'a viewer reads only their own rows', 'an outsider reads nothing', 'no insert grant', 'not even the database owner can change a row', 'not even the database owner can delete a row', 'cannot be written', 'can still be erased'].every(s => CH.includes(s)));
check('the mutation proof exists and breaks fourteen things', (R('customer-install/db/tests/access_rules/run_audit_mutations.sh').match(/^"[^\n]*~[^\n]*~[^\n]*"$/gm) || []).length === 14);

console.log('\n[6] SEC-3b: the AI ledger row from the proxy (20261018d / 25_)');
const D = R('supabase/migrations/20261018d_ai_ledger_from_proxy.sql'), K25 = R('customer-install/db/25_ai_ledger_from_proxy.sql');
check('audit_log.source, app by default, only app or proxy', /add column if not exists source text not null default 'app';/.test(D) && /check \(source in \('app', 'proxy'\)\)/.test(D));
check('the proxy\'s writer marks its rows proxy', /coalesce\(p_ok, true\), left\(p_error, 500\), 'proxy'\);/.test(D));
check('...and only the service role may call it', /revoke execute on function public\.audit_ai_call_observed\([^)]*\) from public, anon, authenticated;/.test(D) && /grant  execute on function public\.audit_ai_call_observed\([^)]*\) to service_role;/.test(D));
check('...a row for a user the database does not know is refused, not stored nameless', /if p_user is null or not exists \(select 1 from public\.users u where u\.id = p_user\) then\s+raise exception/.test(D));
check('the hash chain is not touched here (widening it is SEC-0d)', !/audit_log_chain/.test(D.replace(/--[^\n]*/g, '')));
// 21 Oct 2026: 26_server_admin_check now follows 25 in apply.sh; the check is that 25 runs right after 24.
check('25_ is its twin and apply.sh runs it after 24', strip(D.slice(D.indexOf('alter table public.audit_log add column'))) === strip(K25.slice(K25.indexOf('alter table public.audit_log add column'))) && / 24_private_schema_usage 25_ai_ledger_from_proxy[ ;]/.test(APPLY));
check('the database proof covers the proxy ledger', ['marked proxy', 'claims the proxy saw it', 'marked app', 'same hash chain', 'does not know is refused'].every(t => CH.includes(t)));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

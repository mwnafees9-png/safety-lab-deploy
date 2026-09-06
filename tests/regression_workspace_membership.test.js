#!/usr/bin/env node
/*
 * Regression — S1: the cross-tenant membership hole, and ownership.
 * Guards supabase/migrations/20260905_workspace_membership_and_ownership.sql.
 *
 * THE DEFECT. 0001_rls_baseline.sql:109 created
 *   ws_members_self_join ... for insert with check (auth.uid() = user_id)
 * and that was the whole condition. It asked whose row it was and never which
 * workspace. Permissive INSERT policies OR, so any signed-in user who learned a
 * workspace id could insert themselves at any role, including owner, and then
 * read, write and delete everything in that tenant. Verified live in pg_policies
 * on 5 Sep 2026. 0008 re-emitted every OTHER workspace_members policy and left
 * this one alone, so the 0001 version was still live.
 *
 * WAQAS'S RULING, 5 Sep 2026: "whoever creates the workspace should be
 * automatically assigned as the owner/admin ... only they should be the ones
 * allowed to invite people ... People cannot enter a workspace without an
 * invite." Plus: only the owner transfers ownership, and admins may not evict
 * the owner unless ownership has been transferred.
 *
 * WHY THESE CHECKS ARE STATIC. The wall runs with no database, so these read the
 * migration rather than the server. That is a real limit and it is stated here
 * so nobody mistakes a green wall for a verified database: the live proof is the
 * post-apply checklist at the foot of the migration, run against the server.
 * What this suite CAN do is stop the tree drifting back — which is precisely
 * what happened between 0001 and 5 Sep.
 *
 * Run: node tests/regression_workspace_membership.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const M = read('20260905_workspace_membership_and_ownership.sql');

// The policy body, isolated, so a check cannot be satisfied by prose in a comment.
//
// The first draft of this used indexOf('create policy <name> on') and matched
// the OLD, BROKEN policy quoted verbatim in this migration's own header comment,
// then sliced to that quote's semicolon and stripped it as a comment — leaving
// an empty string, so three checks failed against a correct migration. A probe
// that reads the defect it is hunting for and calls it the current state is
// worse than no probe. Anchor on a real statement: a line that BEGINS with
// `create policy`, never one behind a `--`.
function policyBody(src, name) {
  const lines = src.split('\n');
  const start = lines.findIndex(l => l.trimStart().indexOf('create policy ' + name + ' on') === 0
                                     && l.trimStart().indexOf('--') !== 0);
  if (start < 0) return '';
  const out = [];
  for (let i = start; i < lines.length; i++) {
    out.push(lines[i].replace(/--[^\n]*/g, ''));
    if (lines[i].indexOf(';') >= 0) break;
  }
  return out.join('\n');
}

console.log('\n[s1] 1 — the eighth helper, and why it has to exist');
check('private.owns_workspace is created',
      /create or replace function private\.owns_workspace\(p_workspace uuid\)/.test(M));
check('it is SECURITY DEFINER with a pinned search_path',
      /owns_workspace[\s\S]{0,200}security definer set search_path to 'public'/.test(M));
check('it reads workspaces.owner_id, NOT a membership role',
      /owns_workspace[\s\S]{0,400}w\.owner_id = auth\.uid\(\)[\s\S]{0,120}from public\.workspaces/.test(M),
      'is_workspace_owner reads workspace_members and answers false for the very row being inserted');
check('it can never return NULL (the 20260831c lesson)',
      /owns_workspace[\s\S]{0,400}coalesce\(/.test(M));
check('anon and public cannot execute it',
      /revoke execute on function private\.owns_workspace\(uuid\) from anon, public/.test(M));

console.log('\n[s1] 2 — self-join is now only the creator\'s own first row');
{
  const b = policyBody(M, 'ws_members_self_join');
  check('the policy is re-emitted at all', b.length > 0);
  check('it still requires the row to be yours', /auth\.uid\(\) = user_id/.test(b));
  check('AND that you own that workspace — the condition that was missing',
        /private\.owns_workspace\(workspace_id\)/.test(b),
        'this is the whole defect: the old policy never asked WHICH workspace');
  check('AND that the role is owner (the creation bootstrap, nothing else)',
        /role = 'owner'/.test(b));
  check('all three are ANDed, not ORed', !/\bor\b/i.test(b));
}

console.log('\n[s1] 3 — admins cannot promote to owner or touch the owner\'s row');
{
  const b = policyBody(M, 'ws_members_admin_update');
  check('admin_update now has a WITH CHECK at all', /with check/i.test(b),
        'it had none, so an admin could update their own row and set role = owner');
  const parts = b.split(/with check/i);
  check('USING excludes the owner row', /using[\s\S]*role <> 'owner'/i.test(parts[0]));
  check('WITH CHECK excludes the owner role', /role <> 'owner'/.test(parts[1] || ''));
  check('both still require admin', (b.match(/private\.can_admin_workspace\(workspace_id\)/g) || []).length >= 2);
}

console.log('\n[s1] 4 — admins cannot evict the owner');
{
  const b = policyBody(M, 'ws_members_admin_delete');
  check('delete is restricted to non-owner rows', /role <> 'owner'/.test(b),
        'Waqas: admins may not evict the owner unless ownership has been transferred');
  check('and still requires admin', /private\.can_admin_workspace\(workspace_id\)/.test(b));
}

console.log('\n[s1] 5 — ownership moves only by the owner, atomically');
check('a transfer RPC exists', /create or replace function public\.transfer_workspace_ownership/.test(M));
check('it is SECURITY DEFINER with a pinned search_path',
      /transfer_workspace_ownership[\s\S]{0,400}security definer set search_path = public, pg_temp/.test(M));
check('it refuses a caller who is not the owner',
      /not_owner/.test(M) && /w\.owner_id = v_uid/.test(M));
check('the new owner must ALREADY be a member — so ownership can only reach someone invited',
      /not_a_member/.test(M) && /from public\.workspace_members m[\s\S]{0,120}user_id = p_new_owner/.test(M));
check('it swaps both role rows, not just the workspace',
      /update public\.workspaces  set owner_id = p_new_owner/.test(M) &&
      /set role = 'admin'/.test(M) && /set role = 'owner'/.test(M));
check('anon and public cannot execute it',
      /revoke execute on function public\.transfer_workspace_ownership\(uuid, uuid\) from anon, public/.test(M));
check('authenticated can',
      /grant  execute on function public\.transfer_workspace_ownership\(uuid, uuid\) to authenticated/.test(M));

console.log('\n[s1] 6 — the invariant this design leans on, in another file');
{
  const inv = read('20260831_invitation_accept_rpc.sql');
  check('accept_invitation still refuses to grant owner',
        /role not in \('admin','editor','reviewer','viewer'\)/.test(inv),
        'if owner ever joins that whitelist, invitations become a second route to ownership');
  check('accept_invitation is still SECURITY DEFINER (it is the only other way in)',
        /security definer/i.test(inv));
}

console.log('\n[s1] 7 — the erase_project grant drift rides along (S12)');
check('erase_project is revoked from authenticated',
      /revoke execute on function public\.erase_project\(uuid, boolean\) from anon, authenticated, public/.test(M),
      '0005:43 granted it to authenticated while production grants only service_role — the DISK was more permissive than production');
check('and granted to service_role only',
      /grant  execute on function public\.erase_project\(uuid, boolean\) to service_role/.test(M));

console.log('\n[s1] 8 — the migration refuses to be applied blind');
check('it carries the pre-flight query for rows that already walked through',
      /PRE-FLIGHT/.test(M) && /accepted_at is not null/.test(M),
      'this migration shuts the door; it does not remove anyone already inside');
check('it carries a post-apply verification checklist',
      /POST-APPLY VERIFICATION/.test(M) && /must be refused \(42501\)/.test(M));
check('it is marked not-yet-applied, honestly',
      /NOT YET APPLIED/.test(M));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

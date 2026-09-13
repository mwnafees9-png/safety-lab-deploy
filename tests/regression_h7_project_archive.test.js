#!/usr/bin/env node
/*
 * Regression — H-7: project archive / restore.
 *
 * Before this, a customer could not retire a project at all. Nothing
 * client-side ever set projects.deleted_at, even though projects_member_read
 * has always filtered on it: the machinery existed and nothing used it.
 *
 * RULED BY WAQAS, 31 Aug 2026: admin/owner only, and ARCHIVE (reversible)
 * rather than hard delete.
 *
 * WHY THE TRIGGER EXISTS AT ALL. Live RLS lets an EDITOR set deleted_at —
 * projects_editor_update is `using private.can_edit_workspace(workspace_id)`
 * and, with no separate WITH CHECK, that expression serves as the check too.
 * The ruling tightens that, and a WITH CHECK cannot express it because WITH
 * CHECK cannot see OLD. A BEFORE UPDATE trigger can.
 *
 * THE DEFECT THIS SUITE WAS BORN OUT OF, which no amount of reading found:
 * `private.can_admin_workspace()` returned NULL — not false — for a non-member,
 * because private.workspace_role() is NULL for them and `null in ('owner',...)`
 * is NULL. So every gate of the form `if not private.can_admin_workspace(x)`
 * did NOT fire for exactly the population it existed to stop: `not NULL` is
 * NULL, which is not TRUE, so the IF body was skipped. RLS policies were never
 * affected (a NULL policy expression is treated as false); only the SECURITY
 * DEFINER RPCs were. Proven live and rolled back: a signed-in non-member passed
 * the gate in public.sl_restore_project_version against someone else's live
 * project. Fixed at the helpers so every caller — today's and tomorrow's — is
 * closed at once; the call sites below coalesce as well, so a helper rewritten
 * without it cannot silently re-open them.
 *
 * Run: node tests/regression_h7_project_archive.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const helpers = read('site/helpers_modules.js');
const html    = read('site/index.html');
const boot    = read('site/safety_lab.js');
const mig     = read('supabase/migrations/20260831b_project_archive.sql');
const fix     = read('supabase/migrations/20260831c_rls_helpers_never_return_null.sql');

console.log('[h7] 1 — the NULL-gate defect is closed at the helpers');
{
  for (const fn of ['is_workspace_owner', 'can_edit_workspace', 'can_admin_workspace', 'can_review_workspace']) {
    check(fn + ' can never return NULL',
          new RegExp('create or replace function private\\.' + fn + '[\\s\\S]{0,300}?coalesce\\(').test(fix));
  }
  check('is_workspace_member was never affected (exists() is never NULL) and is left alone',
        !/create or replace function private\.is_workspace_member/.test(fix));
  check('the file states that RLS policies were never exposed, only the RPCs',
        /RLS POLICIES WERE NEVER AFFECTED/.test(fix));
  check('...and names the function the hole was PROVEN on, not just theorised',
        /sl_restore_project_version/.test(fix) && /PROVEN, NOT INFERRED/.test(fix));
}

console.log('[h7] 2 — every new gate coalesces at the call site too');
{
  const gates = (mig + fix).match(/if\s+(not\s+)?(coalesce\s*\(\s*)?private\.can_admin_workspace[^\n]*/g) || [];
  check('there are gates to check', gates.length >= 4, String(gates.length));
  const bare = gates.filter(g => /if\s+not\s+private\./.test(g));
  // The 20260831b file is the historical first cut and DID ship the bare form;
  // 20260831c supersedes every one of those functions. What must hold is that
  // the LAST definition of each is the coalesced one.
  const lastDefs = ['archive_project', 'restore_project', 'archived_projects', 'guard_project_archive'];
  for (const fn of lastDefs) {
    const body = fix.slice(fix.indexOf(fn));
    check(fn + ' is redefined in the fix with a coalesced gate',
          new RegExp(fn + '[\\s\\S]{0,900}?coalesce\\(private\\.can_admin_workspace').test(fix));
  }
  check('the superseded bare-gate cut is still on disk as the record', bare.length > 0);
}

console.log('[h7] 3 — the RPCs are shaped for a browser to call safely');
{
  for (const fn of ['archive_project', 'restore_project', 'archived_projects']) {
    check(fn + ' is SECURITY DEFINER with a pinned search_path',
          new RegExp('function public\\.' + fn + '[\\s\\S]{0,400}?security definer set search_path').test(fix));
    check(fn + ' refuses an unauthenticated caller before anything else',
          new RegExp('function public\\.' + fn + '[\\s\\S]{0,600}?auth\\.uid\\(\\) is null then raise').test(fix));
  }
  check('archived_projects table-qualifies EVERY column — an unqualified `name` or `id` collides with the RETURNS TABLE out-params and only raises at call time (accept_invitation, 31 Aug)',
        /select p\.id, p\.name, p\.cert_basis, p\.updated_at, p\.deleted_at/.test(fix));
  check('anon is revoked on all three; authenticated keeps execute',
        /revoke execute on function public\.archive_project\(uuid\)\s+from public, anon/.test(mig) &&
        /grant  execute on function public\.archived_projects\(uuid\) to authenticated, service_role/.test(mig));
}

console.log('[h7] 4 — the trigger, which is the only gate that cannot be bypassed');
{
  check('a BEFORE UPDATE trigger on projects exists', /create trigger sl_guard_project_archive\s+before update on public\.projects/.test(mig));
  check('it only cares about a change to deleted_at — ordinary editor edits are untouched',
        /NEW\.deleted_at is not distinct from OLD\.deleted_at then return NEW/.test(fix));
  check('service-role / backend writes step past it rather than being blocked',
        /auth\.uid\(\) is null then return NEW/.test(fix));
  check('and it explains WHY a WITH CHECK could not do this job',
        /WITH CHECK cannot see OLD/.test(mig));
}

console.log('[h7] 5 — the client');
{
  check('_canAdminActiveWorkspace reads myRole', /function _canAdminActiveWorkspace[\s\S]{0,300}myRole/.test(helpers));
  check('the Archive button is not rendered for a non-admin at all',
        /_canAdminActiveWorkspace\(\)\s*\n?\s*\?\s*'<button[^']*Archive/.test(helpers));
  check('archiveCloudProject confirms first (through the app\'s own dialog since R19 step 3, never the native confirm)', /function archiveCloudProject[\s\S]{0,900}await slConfirm\(/.test(helpers) && !/function archiveCloudProject[\s\S]{0,900}window\.confirm/.test(helpers));
  check('...and the prompt says it is REVERSIBLE — an irreversible-sounding prompt for a reversible action trains people to fear the button',
        /Nothing is deleted/.test(helpers));
  check('archive calls the RPC, never a raw update on projects',
        /rpc\('archive_project', \{ p_project: projectId \}\)/.test(helpers) &&
        !/from\('projects'\)[\s\S]{0,120}deleted_at/.test(helpers));
  check('restore calls the RPC', /rpc\('restore_project', \{ p_project: projectId \}\)/.test(helpers));
  check('the archived list comes from the definer RPC, not a select', /rpc\('archived_projects', \{ p_workspace: wsId \}\)/.test(helpers));
  check('the archived list is CAPPED — this workspace already holds 354 archived rows',
        /_ARCHIVED_CAP = 100/.test(helpers) && /slice\(0, _ARCHIVED_CAP\)/.test(helpers));
  check('...and says how many it is not showing', /showing the ' \+ shown\.length \+ ' most recently archived/.test(helpers));
  // FOUND LIVE on the deployed build, 31 Aug: with the archived list left expanded,
  // switching workspace re-rendered the live list but NOT the archived one, so the
  // panel showed the previous workspace's archived projects under a header naming
  // the new one — "Nothing archived" for a workspace holding 354, and vice versa.
  // Re-rendering on open would still flash the wrong list; collapsing means there is
  // never a wrong list on screen, and the toggle re-fetches on the way open.
  check('the archived panel is reset every time the modal opens',
        /_resetArchivedProjectsPanel\(\);/.test(helpers) && /function _resetArchivedProjectsPanel/.test(helpers));
  check('...and the reset EMPTIES it, not just hides it — a hidden stale list is still stale',
        /function _resetArchivedProjectsPanel[\s\S]{0,320}list\.innerHTML = ''/.test(helpers));
  check('...and puts the toggle label back', /function _resetArchivedProjectsPanel[\s\S]{0,400}Show archived/.test(helpers));
  check('the reset runs inside openProjectFromCloud, not only on first open',
        /function openProjectFromCloud[\s\S]{0,4000}_resetArchivedProjectsPanel\(\)/.test(helpers));
  check('every failure path reports instead of returning silently',
        /Archive failed: /.test(helpers) && /Restore failed: /.test(helpers) && /Failed to load archived projects/.test(helpers));
}

console.log('[h7] 6 — the markup and the exports');
{
  check('the archive section exists in index.html', /id="cloud-archived-wrap"/.test(html));
  check('it is display:none by default — revealed only for an admin', /id="cloud-archived-wrap" style="display: none;/.test(html));
  // FOUND AT RUNTIME on the deployed build, 31 Aug: .modal-body is a two-column
  // grid (330px 330px) and every child here was grid-column:auto, so the workspace
  // line and the project list sat SIDE BY SIDE and the archived section landed back
  // in column 1. Pre-existing — the list has always had half the modal — and adding
  // a third child is what made it visible. Same root cause as the invite email field
  // that collapsed to 20px, which is why it is pinned rather than just fixed.
  check('the archived section spans both grid columns',
        /id="cloud-archived-wrap" style="display: none; grid-column: 1 \/ -1;/.test(html));
  check('the project list spans both grid columns',
        /id="cloud-projects-list"[^>]*grid-column: 1 \/ -1/.test(html));
  check('the workspace line spans both grid columns',
        /Workspace: <strong id="cloud-projects-workspace">/.test(html) &&
        /font-size: 13px; grid-column: 1 \/ -1;">\s*\n\s*Workspace:/.test(html));
  check('the cause is written down at the site, not just fixed',
        /\.modal-body is a TWO-COLUMN grid/.test(html));
  check('a Show archived toggle exists', /id="cloud-archived-toggle"[\s\S]{0,200}Show archived/.test(html));
  check('the section is revealed BEFORE the empty-list early return',
        helpers.indexOf("cloud-archived-wrap") < helpers.indexOf('No projects in this workspace yet'));
  for (const fn of ['archiveCloudProject', 'restoreCloudProject', 'toggleArchivedProjects']) {
    check(fn + ' is exported for the inline onclick', new RegExp('window\\.' + fn + '\\s*=').test(boot));
  }
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

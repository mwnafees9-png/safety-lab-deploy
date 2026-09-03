#!/usr/bin/env node
/*
 * Regression — H-8: the migration tree must be able to rebuild production.
 *
 * WHAT WAS FOUND, 31 Aug 2026. Production keeps all seven RLS helper functions
 * in the `private` schema and every one of its 59 policies calls them
 * schema-qualified (`private.can_edit_workspace(...)`). NOTHING on disk creates
 * that schema, and all 18 helper-calling policies on disk call the helpers
 * UNQUALIFIED. The move was made straight against the database and never
 * written down.
 *
 * Two consequences, and the second is the dangerous one:
 *   · The three newest RPCs already call private.* — on a database rebuilt from
 *     disk they would fail, because the schema does not exist. The tree cannot
 *     rebuild production.
 *   · 0001's own header says re-applying it is "idempotent and non-destructive".
 *     Doing that today would create a SECOND set of helpers in `public`, without
 *     the 0002/0005 anon-execute revokes, and repoint all 18 policies at the
 *     unqualified names — which resolve to the new, un-revoked copies. A silent
 *     authorization downgrade, invited by a comment.
 *
 * These checks are static over the migration directory, so they run in the wall
 * with no database. They cannot see production; what they CAN do is stop the
 * tree from silently drifting back into a state that would not rebuild it.
 *
 * Run: node tests/regression_h8_rls_disk_sync.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const SYNC = '0008_rls_private_schema_sync_20260831.sql';
const HELPERS = ['is_workspace_member', 'workspace_role', 'is_workspace_owner',
                 'can_edit_workspace', 'can_admin_workspace', 'can_review_workspace',
                 'is_safety_lab_admin'];

console.log('[h8] 1 — the tree creates the schema its own RPCs depend on');
{
  const callers = files.filter(f => /private\.\w+\s*\(/.test(read(f)) && f !== SYNC);
  check('some migration calls private.* (the RPCs do)', callers.length > 0, callers.join(', '));
  const creators = files.filter(f => /create schema if not exists private\b/i.test(read(f)));
  check('a migration CREATES schema private', creators.length > 0);
  // Ordering: files apply in sorted order, so the creator must sort before every caller.
  const firstCreator = creators.sort()[0];
  check('...and it sorts BEFORE every migration that calls private.*',
        creators.length > 0 && callers.every(c => firstCreator <= c),
        'creator=' + firstCreator + ' callers=' + callers.join(','));
}

console.log('[h8] 2 — the helpers are defined where production actually keeps them');
{
  const sync = read(SYNC);
  for (const h of HELPERS) {
    check('private.' + h + ' is defined on disk',
          new RegExp('create or replace function private\\.' + h + '\\s*\\(').test(sync));
  }
  check('every helper is SECURITY DEFINER with a pinned search_path',
        (sync.match(/security definer set search_path to 'public'/g) || []).length >= HELPERS.length);
  check('anon/PUBLIC execute is revoked, authenticated keeps it',
        /revoke execute on function %s from public, anon/.test(sync) &&
        /grant  execute on function %s to authenticated, service_role/.test(sync));
  check('the public copies a rebuild would create are dropped again',
        HELPERS.every(h => new RegExp('drop function if exists public\\.' + h + '\\s*\\(').test(sync)));
}

console.log('[h8] 3 — no policy in the FINAL state calls a helper unqualified');
{
  // The final state is what the last file touching each policy says. 0001 is the
  // 21 Jun historical record and is deliberately left unqualified; the sync file
  // re-emits every policy it defines. So: every policy 0001 defines with an
  // unqualified helper call must be re-emitted by the sync file.
  const p0001 = read('0001_rls_baseline.sql'), sync = read(SYNC);
  const bare = new RegExp('(^|[^.\\w])(' + HELPERS.join('|') + ')\\s*\\(');
  const stale = [];
  for (const line of p0001.split('\n')) {
    const m = /^create policy (\w+) on public\.(\w+)/.exec(line.trim());
    if (!m || !bare.test(line)) continue;
    if (!new RegExp('create policy ' + m[1] + ' on public\\.' + m[2]).test(sync)) stale.push(m[1]);
  }
  check('every unqualified-helper policy in 0001 is superseded by the sync file',
        stale.length === 0, 'not re-emitted: ' + stale.join(', '));

  // And the sync file itself must never introduce an unqualified call.
  const syncBare = sync.split('\n').filter(l => /^create policy /.test(l.trim()) && bare.test(l));
  check('the sync file itself qualifies every helper call it makes',
        syncBare.length === 0, syncBare.slice(0, 3).join(' | '));
}

console.log('[h8] 4 — 0001 no longer invites its own re-application');
{
  const p = read('0001_rls_baseline.sql');
  check('0001 carries a dated supersession notice', /SUPERSEDED IN PART — 31 Aug 2026/.test(p));
  check('...that names the sync file as required on a rebuild', /0008_rls_private_schema_sync_20260831\.sql/.test(p));
  check('...and states the hazard in plain words', /authorization downgrade/i.test(p));
  check('the ORIGINAL statements are left byte-unchanged as the historical record',
        /create or replace function public\.is_workspace_member/.test(p),
        'rewriting history is how this drift survived');
}

console.log('[h8] 5 — the census findings are written down, not just fixed');
{
  const sync = read(SYNC);
  check('records that project_crdt policies appear in no other migration', /project_crdt[\s\S]{0,200}NO\s*\n?--\s*migration on disk|appears in NO/.test(sync));
  check('names what is still missing (H-8b) rather than implying the tree is whole',
        /H-8b/.test(sync) && /erase_my_account/.test(sync));
  check('clears the two NON-drift findings so they are not re-investigated',
        /pending_comps/.test(sync) && /0007_config_management/.test(sync));
  check('says explicitly that production is the correct side and must not be re-applied to',
        /Do not apply to\s*\n?--\s*production/i.test(sync));
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

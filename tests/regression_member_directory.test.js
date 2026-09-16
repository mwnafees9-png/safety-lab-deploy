#!/usr/bin/env node
/*
 * Regression — the reviewer picker has someone in it (16 Sep 2026).
 *
 * public.users allows you to read your OWN row and nobody else's (users_self_read). The client
 * joined to users anyway, with an INNER join, so other members were dropped from the result
 * rather than showing a blank email. The reviewer picker was therefore ALWAYS EMPTY and
 * submitReviewRequest refused every time: nobody has ever been able to request a review.
 * Production: reviews, review_comments and signoffs all ZERO across 591 projects and 45 users,
 * and notify-review has never sent an email.
 *
 * This suite pins the fix AND the shape of the fix. The tempting one-line alternative was to
 * widen users_self_read to cover workspace peers, which would have fixed all four call sites and
 * also granted that read to every future query touching users. The chosen shape keeps the table
 * policy exactly as tight as it was and puts the widening inside two functions that check
 * membership themselves. A later "simplification" back to a policy is the regression to catch.
 *
 * Run: node tests/regression_member_directory.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const MIG = 'supabase/migrations/20260916b_workspace_member_directory.sql';

console.log('\n[directory] the functions exist and are the narrow shape');
check('the migration is in the repo', fs.existsSync(path.join(REPO, MIG)));
const sql = fs.existsSync(path.join(REPO, MIG)) ? read(MIG) : '';
check('workspace_member_directory exists', /create or replace function public\.workspace_member_directory\(p_workspace uuid\)/.test(sql));
check('user_emails_for_ids exists', /create or replace function public\.user_emails_for_ids\(p_ids uuid\[\]\)/.test(sql));
check('both are security definer, or they would hit the same policy they exist to work around',
  (sql.match(/security definer/g) || []).length === 2);
check('the directory refuses a workspace the caller is not in',
  /private\.workspace_role\(p_workspace\) is not null/.test(sql));
check('id-to-email resolves only for someone sharing a workspace',
  /mine\.user_id = auth\.uid\(\) and theirs\.user_id = u\.id/.test(sql));
check('neither is callable by anon', (sql.match(/from public, anon;/g) || []).length === 2);

console.log('\n[directory] the table policy is NOT the fix, and must not become it');
check('the migration creates no policy on users',
  !/create policy[^;]*on public\.users/i.test(sql),
  'widening users_self_read would fix the picker and also grant peer reads to every future query');
check('the migration alters no policy on users', !/alter policy[^;]*on public\.users/i.test(sql));
check('the reason is written down, not just implied', /WHY NOT JUST WIDEN THE POLICY/.test(sql));

console.log('\n[directory] every client join to users is gone');
const FILES = ['site/misc_fn_modules.js', 'site/helpers_modules.js'];
for (const f of FILES) {
  const s = read(f);
  check(f + ' does not inner-join users', !/users:users!inner/.test(s));
  check(f + " does not select emails straight off users", !/from\('users'\)\s*\.select\('id, email'\)/.test(s));
}
const mfm = read('site/misc_fn_modules.js'), hm = read('site/helpers_modules.js');
check('the reviewer picker calls the directory', /rpc\('workspace_member_directory'/.test(mfm));
check('the picker reads the directory shape (m.id, not m.user_id)',
  /filter\(m => m\.id !== myId\)/.test(mfm));
check('the workspace members list calls the directory', /rpc\('workspace_member_directory'/.test(hm));
check('the members list reads the directory shape', /const isSelf = m\.id === myId;/.test(hm));
check('history and review attribution call the id resolver',
  (hm.match(/rpc\('user_emails_for_ids'/g) || []).length === 2);

console.log('\n[directory] the pins moved, or browsers keep serving the broken bundles');
const idx = read('site/index.html');
const pin = (n) => { const m = idx.match(new RegExp(n + '\\.js\\?v=([0-9.]+)')); return m && m[1]; };
check('misc_fn_modules pin is past the broken build', pin('misc_fn_modules') !== '66.66', pin('misc_fn_modules'));
check('helpers_modules pin is past the broken build', pin('helpers_modules') !== '3.5', pin('helpers_modules'));

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * Regression — erasure actually erases, and the certificate tells the truth (16 Sep 2026).
 *
 * WHY THIS EXISTS. The Radia mutual NDA Section 7 asks us to destroy their Confidential
 * Information on request and certify it within five days. Auditing that promise against the code
 * found erase_project could not keep it, for FIVE separate reasons, and the last two were only
 * visible by running the thing:
 *
 *   1. feedback survived. Its FK is ON DELETE SET NULL, so the row stayed with its free-text
 *      message intact and only the project link cleared.
 *   2. ai_org_cache survived completely. It holds model output derived from the customer's own
 *      documents and had no project or workspace column, so it could not even be targeted.
 *   3. notification_log survived the same way.
 *   4. THE APPEND-ONLY JOURNALS REFUSED THE CASCADE. change_journal and problem_report_events
 *      raise on DELETE. Deleting the project cascades into them, the trigger fires, the whole
 *      function aborts and NOTHING is deleted. Both triggers already had a maintenance escape
 *      hatch; the erase functions never opened it.
 *   5. digest() WAS NOT ON THE SEARCH PATH. pgcrypto lives in `extensions`; the functions pinned
 *      search_path to public and pg_temp, so the manifest hash raised for every project.
 *
 * 4 and 5 meant the function had never once succeeded. Production agrees: zero rows in
 * destruction_certificates against 591 projects.
 *
 * These checks read the migration rather than the database, so they run in the wall with no
 * credentials. The live proof is recorded at the end of the migration file.
 *
 * Run: node tests/regression_erasure_completeness.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const REPO = path.join(__dirname, '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '20260916_erasure_completeness.sql');
check('the erasure migration is in the repo', fs.existsSync(MIG));
const sql = fs.existsSync(MIG) ? fs.readFileSync(MIG, 'utf8') : '';

// ---- [1] everything a project touches is reachable -------------------------------------------
console.log('\n[erasure] every table that holds project data is named');
// The full set, checked against the LIVE schema on 16 Sep 2026 rather than the 6 Sep capture,
// which is how change_journal, edit_locks and problem_report_events were found at all.
const TABLES = ['project_documents','yjs_documents','project_baselines','project_crdt',
  'project_document_versions','reviews','review_assignments','review_comments','signoffs',
  'feedback','ai_org_cache','notification_log','change_journal','edit_locks','problem_report_events'];
for (const t of TABLES) check(t + ' is counted in the project manifest', new RegExp("'" + t + "'\\s*,\\s*v_").test(sql), 'missing from jsonb_build_object');

console.log('\n[erasure] the three that used to survive are deleted, not just counted');
check('feedback is deleted BEFORE the project row (its FK is SET NULL, not CASCADE)',
  sql.indexOf('delete from public.feedback         where project_id = p_project_id;') > -1 &&
  sql.indexOf('delete from public.feedback         where project_id = p_project_id;') <
  sql.indexOf('delete from public.projects         where id         = p_project_id;'));
check('notification_log is deleted by project', /delete from public\.notification_log where project_id = p_project_id;/.test(sql));
check('ai_org_cache loses this project and is removed once no project holds it',
  /array_remove\(project_ids, p_project_id\)/.test(sql) &&
  /delete from public\.ai_org_cache where project_ids = '\{\}' and workspace_ids = '\{\}'/.test(sql));
check('the cache is stamped with an ARRAY, because one hash is reachable from several projects',
  /project_ids\s+uuid\[\]/.test(sql) && /@> array\[p_project_id\]/.test(sql));

// ---- [2] the two reasons it never ran --------------------------------------------------------
console.log('\n[erasure] the two faults that made it fail outright');
check('the append-only maintenance hatch is opened by the erase',
  /allow_journal_maintenance/.test(sql) && /allow_problem_maintenance/.test(sql));
check('the hatch is transaction-local, so it cannot outlive the erase',
  /set_config\('app\.allow_journal_maintenance','on', true\)/.test(sql));
check('digest() resolves: extensions is on the search path of BOTH erase functions',
  /alter function public\.erase_project\(uuid, boolean\) set search_path to 'public', 'extensions', 'pg_temp'/.test(sql) &&
  /alter function private\.erase_my_account\(boolean\)   set search_path to 'public', 'extensions', 'pg_temp'/.test(sql));

// ---- [3] the certificate is honest about what is still out there ------------------------------
console.log('\n[erasure] the certificate states the windows it cannot close');
check('a single retention policy function holds the numbers', /create or replace function private\.retention_policy\(\)/.test(sql));
check('the database backup window is named, with its holder', /'holder', 'Supabase'/.test(sql));
check('the model provider window is named, with its holder', /'holder', 'Anthropic'/.test(sql));
check('Anthropic is recorded at 30 days, not zero',
  /'model_provider'[\s\S]{0,200}'days', 30/.test(sql));
check('the Covered Models caveat is on the certificate, not just in someone head',
  /Covered Models/.test(sql));
check('customer-hosted is called out as not affected', /never reach Licensor/.test(sql));
check('every certificate carries the windows and the date they expire',
  /add column if not exists retention  jsonb/.test(sql) && /add column if not exists complete_at timestamptz/.test(sql));
check('complete_at is the LONGEST window, not the shortest',
  /greatest\(\(v_ret->'database_backups'->>'days'\)::int/.test(sql));

// ---- [4] the writers stamp what erasure needs -------------------------------------------------
console.log('\n[erasure] the writers fill in what erasure matches on');
const ac = fs.readFileSync(path.join(REPO, 'site', 'ai_consistency.js'), 'utf8');
check('the client writes the cache through the RPC, not a bare upsert',
  /rpc\('ai_cache_put'/.test(ac) && !/from\('ai_org_cache'\)\.upsert/.test(ac));
check('the client passes the active project and workspace',
  /getActiveCloudProjectId/.test(ac) && /getActiveWorkspaceId/.test(ac));
check('a missing project degrades to null rather than throwing', /p_project: proj, p_workspace: ws/.test(ac));
for (const f of ['notify-review', 'notify-invite']) {
  const t = fs.readFileSync(path.join(REPO, 'supabase', 'functions', f, 'index.ts'), 'utf8');
  check(f + ' stamps the notification row from its payload', /row\.payload\?\.project_id/.test(t));
}
const nf = fs.readFileSync(path.join(REPO, 'supabase', 'functions', 'notify-feedback', 'index.ts'), 'utf8');
check('notify-feedback stamps from the feedback row it mirrors',
  /project_id: feedbackRow\.project_id/.test(nf) && /workspace_id: feedbackRow\.workspace_id/.test(nf));

// ---- [5] production is not touched by this file -----------------------------------------------
console.log('\n[erasure] the file says who applies it where');
check('the migration records the live proof on the throwaway project', /yiisexbngnjakkqkmctw/.test(sql));
check('the migration states that production is not touched by it', /PRODUCTION IS NOT TOUCHED/.test(sql));

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);

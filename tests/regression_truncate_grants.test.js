#!/usr/bin/env node
/*
 * Regression — TRUNCATE must never be held by the API roles (17 Sep 2026).
 *
 * WHAT WAS FOUND. anon and authenticated held TRUNCATE on 19 public tables, including every one
 * that holds customer work: projects, project_documents, project_document_versions, project_crdt,
 * yjs_documents, workspaces, workspace_members, users, license_tokens, reviews and the rest.
 *
 * WHY "RLS IS ON" IS NOT AN ANSWER. Row-level security is enabled on all 29 public tables, which
 * is exactly why this sat there looking fine. Postgres RLS DOES NOT APPLY TO TRUNCATE. A policy
 * can forbid deleting a single row and have nothing to say about emptying the table.
 *
 * WHAT THE 16 SEP FIX DID AND DID NOT DO. 20260916c revoked update/delete/truncate on five LEDGER
 * tables -- audit_log, workspace_audit, signoffs, project_baselines, destruction_certificates --
 * because the 5 Sep audit had named those. The tables holding the actual data were never in scope
 * and kept the privilege. A fix that lands on the examples in the report rather than on the class
 * of problem leaves the rest of the class in place.
 *
 * HOW BAD IT ACTUALLY WAS, stated honestly: not reachable through the public API. PostgREST has no
 * verb that issues a TRUNCATE, neither role has CREATE on the schema, and the one SECURITY DEFINER
 * function authenticated can reach that runs dynamic SQL binds its user value as a parameter. So
 * the only thing between a published anon key and an empty projects table was that PostgREST
 * happens not to offer the verb -- a control nobody chose, wrote down, or could test.
 *
 * THE PART THAT MATTERS MOST is the default privileges. Supabase grants ALL on new tables in
 * public to anon and authenticated, so a revoke fixes today and the next CREATE TABLE undoes it.
 *
 * Run: node tests/regression_truncate_grants.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const mp = path.join(REPO, 'supabase', 'migrations', '20260917b_truncate_grants_lockdown.sql');
const m = fs.existsSync(mp) ? fs.readFileSync(mp, 'utf8') : '';

console.log('\n[revoke] every table, not a hand-written list');
check('the migration exists', !!m);
check('it sweeps pg_class rather than naming tables',
  /for t in[\s\S]{0,200}?from pg_class c/.test(m) && /ns\.nspname = 'public' and c\.relkind = 'r'/.test(m),
  'a list of table names is how the 16 Sep fix covered five tables and missed nineteen');
check('it revokes truncate from both API roles',
  /revoke truncate, references, trigger on public\.%I from anon, authenticated/.test(m));
check('it does NOT revoke the privileges the app needs',
  !/revoke[^\n]*\b(select|insert|update|delete)\b[^\n]*from anon, authenticated/i.test(m),
  'those are governed by RLS and the product depends on them');

console.log('\n[default] the next table created must not bring it back');
check('default privileges are changed too',
  /alter default privileges in schema public\s*\n\s*revoke truncate, references, trigger on tables from anon, authenticated/.test(m),
  'without this the revoke lasts until the next CREATE TABLE');
check('...including for the role that actually creates tables',
  /alter default privileges for role postgres in schema public/.test(m));

console.log('\n[reason] why RLS is not the backstop, recorded so it is not re-argued');
check('the migration says RLS does not cover TRUNCATE',
  /RLS does not apply to TRUNCATE|row-level security does not apply to TRUNCATE/i.test(m));
check('it records that the 16 Sep fix covered only the ledgers',
  /20260916c/.test(m) && /five/i.test(m));

console.log('\n[scope] the earlier ledger lockdown is still in place');
{
  const lp = path.join(REPO, 'supabase', 'migrations', '20260916c_audit_writers_and_ledger_lockdown.sql');
  const l = fs.existsSync(lp) ? fs.readFileSync(lp, 'utf8') : '';
  for (const t of ['audit_log', 'workspace_audit', 'signoffs', 'project_baselines', 'destruction_certificates']) {
    check(t + ' keeps its update/delete/truncate revoke',
      new RegExp('revoke update, delete, truncate on public\\.' + t).test(l));
  }
}

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);

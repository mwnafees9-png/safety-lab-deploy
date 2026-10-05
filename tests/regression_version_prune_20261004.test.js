#!/usr/bin/env node
/*
 * Regression: the project-save guard no longer re-reads every archived version (4 Oct 2026).
 *
 * Found live: six projects stopped saving their backup copy (project_documents) between 3 and
 * 24 Sep. Once a project had more than 80 archived versions, every save pruned them and chose
 * "the 10 largest" with order by sl_doc_items(data) over every archived copy: 13.7 s measured
 * on production for one project, against the app role's 8 s limit. The save was cancelled, the
 * prune rolled back with it, and every later save hit the same wall.
 *
 * The behavior is proven on a real Postgres by customer-install/db/tests/version_prune_proof.sql
 * (2 parses instead of 84 per save, the same versions kept, wipe refusal and version counter
 * unchanged; four mutations each red). This suite pins the text so the fix cannot quietly
 * regress, and keeps the production migration and the customer-kit file identical.
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = process.env.SLAB_REPO || path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const mig = R('supabase/migrations/20261004a_version_archive_prune_cheap.sql');
const kit = R('customer-install/db/21_version_archive_prune_cheap.sql');
const body = mig.replace(/--[^\n]*/g, '');

check('the production migration and the customer-kit file are identical', mig === kit);
check('archived versions carry an item count column', /alter table public\.project_document_versions add column if not exists items integer;/.test(body));
check('every writer gets the count filled once, at insert (BEFORE INSERT trigger)', /create trigger sl_version_items_fill_trg\s+before insert on public\.project_document_versions/.test(body) && /NEW\.items := public\.sl_doc_items\(NEW\.data\);/.test(body));
check('the versions already archived are back-filled', /update public\.project_document_versions set items = public\.sl_doc_items\(data\) where items is null;/.test(body));
const guard = (body.match(/create or replace function public\.sl_guard_project_document\(\)[\s\S]*?\$function\$;/) || [''])[0];
check('the guard is redefined', guard.length > 0);
check('THE FIX: the prune ranks by the stored count, never by re-parsing archived copies', /order by coalesce\(items, 0\) desc, saved_at desc limit 10/.test(guard) && !/order by public\.sl_doc_items\(data\)/.test(guard));
check('the guard parses only the old and new live documents', (guard.match(/sl_doc_items\(/g) || []).length === 2);
check('the archive insert stores the count it already worked out', /insert into project_document_versions \(project_id, version, data, saved_by, saved_at, items\)\s*values \(OLD\.project_id, OLD\.version, OLD\.data, OLD\.updated_by, coalesce\(OLD\.updated_at, now\(\)\), old_items\)/.test(guard));
check('same keepers as before: the 50 newest and the 10 largest, pruned above 80', /> 80 then/.test(guard) && /order by saved_at desc limit 50/.test(guard));
check('the wipe refusal is unchanged', /new_items < \(old_items \* 0\.2\)/.test(guard) && /_slIntentionalClear/.test(guard) && /Refused: this save would cut project content/.test(guard));
check('the version counter rule is unchanged', /NEW\.version := OLD\.version \+ 1;/.test(guard));
check('neither function is callable by the app role', /revoke all on function public\.sl_version_items_fill\(\) from anon, authenticated, public;/.test(body) && /revoke all on function public\.sl_guard_project_document\(\) from anon, authenticated, public;/.test(body));
check('the header records it as applied in production, and how (5 Oct 2026)', /STATUS: APPLIED IN PRODUCTION 5 Oct 2026/.test(mig) && /five batches/.test(mig));
check('apply.sh runs 21 after 20', /20_access_rules_hardening 21_version_archive_prune_cheap;/.test(R('customer-install/db/apply.sh')));
check('the Postgres proof and its seed are in the kit tests', fs.existsSync(path.join(REPO, 'customer-install/db/tests/version_prune_proof.sql')) && /ALL PASS/.test(R('customer-install/db/tests/version_prune_proof.sql')) && fs.existsSync(path.join(REPO, 'customer-install/db/tests/version_prune_setup.sql')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

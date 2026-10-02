#!/usr/bin/env node
/*
 * Regression — the customer install kit cannot drift from the migrations. (2 Oct 2026)
 *
 * FOUND BY DOING IT. The kit was built on a clean Postgres and diffed against production,
 * object by object. Two migrations had never been ported: 20260916_erasure_completeness and
 * 20260916b_workspace_member_directory. On a customer install built from the kit that meant
 * workspace_member_directory(), user_emails_for_ids() and ai_cache_put() did not exist, the
 * reviewer picker was empty (nobody could request a review), and erase_project ran the old,
 * narrower version. Radia installs from this kit. SEC-6 called it "drifting"; this is the
 * mechanism that stops it.
 *
 * THE RULE. Every file in supabase/migrations/ must land in exactly one bucket:
 *   1. BASELINE   — folded into 00_schema_baseline.sql at the 6 Sep capture (frozen list).
 *   2. TWIN       — a kit file with the identical content (comments and whitespace ignored).
 *   3. ADAPTED    — a kit file that differs on purpose; named here with the reason.
 *   4. NOT_PORTED — hosted-only or production-data-only; named here with the reason.
 * A new migration in none of the buckets fails the wall. That is the point: the author of
 * the next migration has to say, in this file, what the customer kit does with it.
 *
 * Also checked: apply.sh runs every NN_*.sql in the kit, in order, none skipped.
 *
 * Run: node tests/regression_customer_kit_parity.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const MIG = path.join(ROOT, 'supabase', 'migrations');
const KIT = path.join(ROOT, 'customer-install', 'db');
const norm = p => crypto.createHash('md5').update(
  fs.readFileSync(p, 'utf8').replace(/--[^\n]*/g, '').replace(/\s+/g, '')).digest('hex');

// Bucket 1 — captured into the baseline on 6 Sep 2026. Frozen: nothing is ever added here.
const BASELINE = new Set([
  '0001_rls_baseline.sql', '0002_datasec_hardening.sql', '0003_reviews_approvals_signatures.sql',
  '0004_document_version_history.sql', '0005_security_perf_hardening.sql',
  '0006_review_rollup_and_chain_verify.sql', '0007_config_management.sql',
  '0008_rls_private_schema_sync_20260831.sql', '20260820_project_document_loss_guard.sql',
  '20260820b_project_recovery_rpc.sql', '20260821_baseline_restore_rpc.sql',
  '20260831_invitation_accept_rpc.sql', '20260831_version_monotonic_guard.sql',
  '20260831b_project_archive.sql', '20260831c_rls_helpers_never_return_null.sql',
  '20260905_workspace_membership_and_ownership.sql',
]);

// Bucket 3 — ported with deliberate differences. Function bodies were diffed against
// production on 2 Oct 2026 and match once comments are stripped; the differences are the
// pg_cron scheduling and hosted-only wiring that a customer install does not carry.
const ADAPTED = {
  '20260916c_audit_writers_and_ledger_lockdown.sql': '09_audit_writers_and_ledger_lockdown.sql',
  '20260916d_scheduled_chain_verification.sql':      '10_scheduled_chain_verification.sql',
};

// Bucket 4 — never ported, and why.
const NOT_PORTED = {
  '20260917a_notify_hook_secret_and_health.sql': 'hosted-only: notify webhooks, vault secret, outbox; a customer install has no edge functions',
  '20260920a_notify_timeout_and_no_reply.sql':   'hosted-only: notify outbox timeout handling',
  '20260929b_register_28sep_concurrency_forks.sql': 'production data only: registers chain breaks in OUR audit history; a fresh install has none',
};

// Bucket 5 — kit-only files: things production has that no migration file ever created
// (made in the dashboard before the repo captured DDL), or customer-install replacements.
const KIT_ONLY = {
  '00_schema_baseline.sql': 'the 6 Sep 2026 capture of production, scrubbed of Safety Lab specifics',
  '06_grants_lockdown.sql': 'the 6 Sep capture lost the privilege revokes; this file reproduces production\'s grant state (verified 9 Sep 2026)',
  '17_auth_signup_trigger.sql': 'production\'s on_auth_user_created trigger lives on auth.users and was never in a migration; the kit also replaces handle_new_user() with a customer version (tier from the licence file, no trial clock)',
};

const migrations = fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
const kitFiles = fs.readdirSync(KIT).filter(f => /^\d\d_.*\.sql$/.test(f)).sort();
const kitHash = new Map(kitFiles.map(f => [norm(path.join(KIT, f)), f]));

console.log('\n[kit] every migration lands in exactly one bucket');
let twins = 0;
for (const m of migrations) {
  const h = norm(path.join(MIG, m));
  const buckets = [];
  if (BASELINE.has(m)) buckets.push('baseline');
  if (kitHash.has(h)) buckets.push('twin:' + kitHash.get(h));
  if (ADAPTED[m]) buckets.push('adapted:' + ADAPTED[m]);
  if (NOT_PORTED[m]) buckets.push('not-ported');
  if (buckets.length === 1 && buckets[0].startsWith('twin:')) twins++;
  check(m + '  ->  ' + (buckets.join(', ') || 'NOTHING'), buckets.length === 1,
        buckets.length === 0 ? 'new migration: port it to customer-install/db or name it in ADAPTED/NOT_PORTED with a reason'
                             : 'listed in more than one bucket: ' + buckets.join(', '));
}
check('at least the known twins are present (' + twins + ' >= 12)', twins >= 12);

console.log('\n[kit] every kit file is accounted for: a twin of a migration, an ADAPTED target, or KIT_ONLY with a reason');
{
  const migHash = new Set(migrations.map(m => norm(path.join(MIG, m))));
  const adaptedTargets = new Set(Object.values(ADAPTED));
  for (const k of kitFiles) {
    const why = migHash.has(norm(path.join(KIT, k))) ? 'twin' : adaptedTargets.has(k) ? 'adapted' : KIT_ONLY[k] ? 'kit-only' : '';
    check(k + '  <-  ' + (why || 'NOTHING'), !!why, 'kit file with no migration and no KIT_ONLY reason');
  }
}

console.log('\n[kit] ADAPTED entries point at real kit files');
for (const [m, k] of Object.entries(ADAPTED)) check(m + ' -> ' + k + ' exists', fs.existsSync(path.join(KIT, k)));

console.log('\n[kit] apply.sh runs every kit file, in order, none skipped');
const apply = fs.readFileSync(path.join(KIT, 'apply.sh'), 'utf8');
const m = apply.match(/for f in ([^;]+); do/);
const listed = m ? m[1].trim().split(/\s+/) : [];
const expected = kitFiles.map(f => f.replace(/\.sql$/, ''));
check('apply.sh has a for-loop over the files', !!m);
check('apply.sh lists exactly the kit files, in order', JSON.stringify(listed) === JSON.stringify(expected),
      'listed=' + listed.join(' ') + '\n        kit=' + expected.join(' '));

console.log('\n[kit] MUTATION — hiding a ported migration from the kit must go red');
{
  // simulate: pretend 16_workspace_member_directory.sql is absent
  const h = norm(path.join(MIG, '20260916b_workspace_member_directory.sql'));
  const without = new Map(kitHash); without.delete(h);
  const stillFound = without.has(h) || BASELINE.has('20260916b_workspace_member_directory.sql')
                  || !!ADAPTED['20260916b_workspace_member_directory.sql'] || !!NOT_PORTED['20260916b_workspace_member_directory.sql'];
  check('mutation proven: with the kit file gone the migration lands in no bucket', !stillFound);
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
